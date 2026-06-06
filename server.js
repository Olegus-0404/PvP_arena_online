const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Состояние игры
const players = {};
const coopRooms = {
    'mode_coop': {
        wave: 1,
        isBreak: true,
        timeLeft: 15, // Перерыв перед первой волной
        bots: {},
        skipVotes: new Set()
    }
};

// Простая карта (размеры препятствий для проверки коллизий на сервере, если нужно)
const mapData = {
    width: 80,
    length: 80
};

// Спавн-точки
const coopSpawn = { x: 0, z: 20 };
const pvpSpawns = [
    { x: -30, z: -30 },
    { x: 30, z: 30 },
    { x: -30, z: 30 },
    { x: 30, z: -30 }
];

// Тик-рейт сервера (обновление физики и ботов 30 раз в секунду)
setInterval(() => {
    updateCoopBots();
    // Рассылаем состояние комнат игрокам
    broadcastRooms();
}, 1000 / 30);

// Секундный таймер для волн коопа
setInterval(() => {
    const room = coopRooms['mode_coop'];
    if (room.timeLeft > 0) {
        room.timeLeft--;
    } else {
        if (room.isBreak) {
            // Закончился перерыв, запускаем волну
            room.isBreak = false;
            room.skipVotes.clear();
            spawnWave(room.wave);
        } else {
            // Если боты кончились, а таймер истек (на всякий случай)
            if (Object.keys(room.bots).length === 0) {
                startBreak();
            }
        }
    }
    
    // Отправляем тики таймера в кооп-комнату
    io.to('mode_coop').emit('timerUpdate', {
        isBreak: room.isBreak,
        timeLeft: room.isBreak ? room.timeLeft : Object.keys(room.bots).length,
        wave: room.wave,
        votes: room.skipVotes.size
    });
}, 1000);

io.on('connection', (socket) => {
    console.log(`Подключился игрок: ${socket.id}`);

    socket.on('playerAuth', (data) => {
        const nick = data.nick || "Боец";
        const mode = data.mode === 'pvp' ? 'pvp' : 'coop';
        const roomName = mode === 'pvp' ? 'mode_pvp' : 'mode_coop';

        // Если игрок уже был в другой комнате — убираем его оттуда
        if (players[socket.id]) {
            socket.leave(players[socket.id].room);
            // Удаляем голос за пропуск, если он уходит из коопа
            coopRooms['mode_coop'].skipVotes.delete(socket.id);
        }

        // Регистрируем игрока
        players[socket.id] = {
            id: socket.id,
            nick: nick,
            pass: data.pass || "",
            mode: mode,
            room: roomName,
            x: 0,
            z: 0,
            rotY: 0,
            hp: 100,
            armor: 100,
            kills: 0
        };

        socket.join(roomName);
        socket.emit('authSuccess', { nick: nick, pass: data.pass, mode: mode });
        
        // Отправляем инициализацию (карту и позицию)
        const spawn = mode === 'coop' ? coopSpawn : pvpSpawns[Math.floor(Math.random() * pvpSpawns.length)];
        players[socket.id].x = spawn.x;
        players[socket.id].z = spawn.z;
        
        socket.emit('init', { x: spawn.x, z: spawn.z, map: true });
    });

    socket.on('playerMove', (data) => {
        const p = players[socket.id];
        if (p && p.hp > 0) {
            p.x = data.x;
            p.z = data.z;
            p.rotY = data.rotY;
        }
    });

    socket.on('playerHit', (data) => {
        const shooter = players[socket.id];
        if (!shooter || shooter.hp <= 0) return;

        const targetId = data.targetId;
        const roomName = shooter.room;

        // Расчет урона: в голову х2
        const baseDamage = data.zone === 'head' ? 50 : 25;

        // 1. Если стреляют в игрока (PvP)
        if (roomName === 'mode_pvp' && players[targetId] && players[targetId].room === 'mode_pvp') {
            const target = players[targetId];
            if (target.hp <= 0) return;

            applyDamage(target, baseDamage, shooter);
            socket.to(targetId).emit('damagedBy', { shooterX: shooter.x, shooterZ: shooter.z });
        }

        // 2. Если стреляют в бота (Co-op)
        if (roomName === 'mode_coop') {
            const room = coopRooms['mode_coop'];
            const bot = room.bots[targetId];
            if (bot && bot.hp > 0) {
                bot.hp -= baseDamage;
                if (bot.hp <= 0) {
                    delete room.bots[targetId];
                    shooter.kills++;
                    
                    // Проверяем, живы ли еще боты
                    if (Object.keys(room.bots).length === 0 && !room.isBreak) {
                        startBreak();
                    }
                }
            }
        }
    });

    // Голосование за пропуск перерыва
    socket.on('skipBreakVote', () => {
        const p = players[socket.id];
        if (!p || p.room !== 'mode_coop') return;

        const room = coopRooms['mode_coop'];
        if (!room.isBreak) return;

        room.skipVotes.add(socket.id);

        // Считаем сколько игроков в кооп комнате всего
        const totalInCoop = Object.values(players).filter(pl => pl.room === 'mode_coop').length;

        // Если большинство проголосовало (или все), урезаем таймер до 0
        if (room.skipVotes.size >= Math.max(1, totalInCoop)) {
            room.timeLeft = 0;
        }
    });

    // Респавн по кнопке
    socket.on('requestRespawn', () => {
        const p = players[socket.id];
        if (!p || p.hp > 0) return;

        p.hp = 100;
        p.armor = 100;
        
        const spawn = p.mode === 'coop' ? coopSpawn : pvpSpawns[Math.floor(Math.random() * pvpSpawns.length)];
        p.x = spawn.x;
        p.z = spawn.z;

        socket.emit('init', { x: spawn.x, z: spawn.z });
    });

    socket.on('disconnect', () => {
        console.log(`Игрок отключился: ${socket.id}`);
        coopRooms['mode_coop'].skipVotes.delete(socket.id);
        delete players[socket.id];
    });
});

// Нанесение урона игроку (с учетом брони)
function applyDamage(target, damage, shooter) {
    if (target.armor > 0) {
        const armorAbsorb = Math.floor(damage * 0.5);
        const healthDamage = damage - armorAbsorb;
        target.armor = Math.max(0, target.armor - armorAbsorb);
        target.hp = Math.max(0, target.hp - healthDamage);
    } else {
        target.hp = Math.max(0, target.hp - damage);
    }

    if (target.hp <= 0 && shooter) {
        shooter.kills++;
    }
}

// Запуск перерыва между волнами
function startBreak() {
    const room = coopRooms['mode_coop'];
    room.isBreak = true;
    room.wave++;
    room.timeLeft = 20; // 20 секунд перерыва
    room.skipVotes.clear();
    io.to('mode_coop').emit('waveCleared');
}

// Спавн ботов в зависимости от номера волны
function spawnWave(waveNumber) {
    const room = coopRooms['mode_coop'];
    room.bots = {};
    const botCount = 3 + waveNumber * 2; // С каждой волной на 2 бота больше

    for (let i = 0; i < botCount; i++) {
        const botId = `bot_${Date.now()}_${i}`;
        // Спавним ботов по кругу на расстоянии от центра
        const angle = Math.random() * Math.PI * 2;
        const radius = 25 + Math.random() * 10;
        
        room.bots[botId] = {
            id: botId,
            x: Math.cos(angle) * radius,
            z: Math.sin(angle) * radius,
            rotY: 0,
            hp: 50 + waveNumber * 10, // Боты жирнеют
            speed: 4 + Math.min(4, waveNumber * 0.5) // Боты ускоряются
        };
    }
}

// ИИ Ботов: Движение к ближайшему игроку в коопе и урон
function updateCoopBots() {
    const room = coopRooms['mode_coop'];
    if (room.isBreak) return;

    // Собираем всех живых игроков из коопа
    const coopPlayers = Object.values(players).filter(p => p.room === 'mode_coop' && p.hp > 0);
    if (coopPlayers.length === 0) return;

    for (let bId in room.bots) {
        const bot = room.bots[bId];
        
        // Находим ближайшего игрока
        let closestPlayer = null;
        let minDist = Infinity;
        
        coopPlayers.forEach(p => {
            const dist = Math.hypot(p.x - bot.x, p.z - bot.z);
            if (dist < minDist) {
                minDist = dist;
                closestPlayer = p;
            }
        });

        if (closestPlayer) {
            // Поворот в сторону игрока
            bot.rotY = Math.atan2(closestPlayer.x - bot.x, closestPlayer.z - bot.z);
            
            // Если бот далеко — бежит к игроку
            if (minDist > 1.2) {
                bot.x += Math.sin(bot.rotY) * bot.speed * (1/30);
                bot.z += Math.cos(bot.rotY) * bot.speed * (1/30);
            } else {
                // Если подошел вплотную — бьет (урон раз в секунду примерно)
                if (!bot.lastAttackTime || Date.now() - bot.lastAttackTime > 1000) {
                    applyDamage(closestPlayer, 15, null);
                    io.to(closestPlayer.id).emit('damagedBy', { shooterX: bot.x, shooterZ: bot.z });
                    bot.lastAttackTime = Date.now();
                }
            }
        }
    }
}

// Пакетная отправка координат игрокам в их комнаты
function broadcastRooms() {
    const pvpPlayers = {};
    const coopPlayers = {};

    for (let id in players) {
        if (players[id].room === 'mode_pvp') pvpPlayers[id] = players[id];
        else coopPlayers[id] = players[id];
    }

    io.to('mode_pvp').emit('updatePlayers', pvpPlayers);
    io.to('mode_coop').emit('updatePlayers', coopPlayers);
    
    // Ботов шлем только в кооп
    io.to('mode_coop').emit('updateBots', coopRooms['mode_coop'].bots);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на портах: ${PORT}`);
});
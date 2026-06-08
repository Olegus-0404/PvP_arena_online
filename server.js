// ============================================================================
// GAME SERVER CORE: WebGL Mobile FPS Dedicated Backend
// Engine: Node.js | Network: Socket.io v4 | Target: Render / Universal Deploy
// ============================================================================

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

// Простая заглушка для проверки работы сервера через браузер
app.get('/', (req, res) => {
    res.send('PvP Arena Online Server is Running.');
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// ГЛОБАЛЬНОЕ ХРАНИЛИЩЕ ИГРОКОВ (все комнаты)
const players = {};

// СОСТОЯНИЕ КОМНАТЫ CO-OP (PvE)
const coopRoom = {
    wave: 1,
    isBreak: true,
    timeLeft: 15,          // Перерыв между волнами 15 секунд (Скриншот №3)
    bots: {},
    skipVotes: new Set(),  // Коллекция ID игроков, проголосовавших за пропуск
    botSpawnTimer: null
};

// Конфигурация игрового мира
const MAP_LIMIT = 40; // Границы карты (80x80, от -40 до 40)

// ============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================================

// Отправка точечного состояния конкретному игроку (Скриншот №4)
function sendPlayerState(player) {
    io.to(player.id).emit('playerState', {
        hp: player.hp,
        armor: player.armor,
        kills: player.kills
    });
}

// Генерация случайной точки спавна игрока
function getRandomSpawnPoint() {
    return {
        x: (Math.random() - 0.5) * 50, // спавн ближе к центру карты
        z: (Math.random() - 0.5) * 50
    };
}

// Спавн ботов по краям карты для PvE режима
function spawnBotsForWave(waveNumber) {
    coopRoom.bots = {};
    const botCount = waveNumber * 3 + 2; // Формула прогрессии ботов
    
    for (let i = 0; i < botCount; i++) {
        const id = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        
        // Спавн по периметру (краям) карты
        let x, z;
        if (Math.random() > 0.5) {
            x = Math.random() > 0.5 ? MAP_LIMIT - 2 : -MAP_LIMIT + 2;
            z = (Math.random() - 0.5) * (MAP_LIMIT * 2);
        } else {
            x = (Math.random() - 0.5) * (MAP_LIMIT * 2);
            z = Math.random() > 0.5 ? MAP_LIMIT - 2 : -MAP_LIMIT + 2;
        }

        coopRoom.bots[id] = {
            id: id,
            hp: 100,
            x: x,
            z: z,
            rotY: 0,
            targetPlayerId: null
        };
    }
}

// Нанесение урона игроку с учётом брони
function applyDamageToPlayer(target, amount, shooter = null) {
    if (target.hp <= 0) return;

    // Распределение урона: 70% в бронежилет, 30% в здоровье
    if (target.armor > 0) {
        const armorDamage = Math.min(target.armor, amount * 0.7);
        target.armor -= Math.round(armorDamage);
        target.hp -= Math.round(amount - armorDamage);
    } else {
        target.hp -= amount;
    }

    if (target.hp < 0) target.hp = 0;

    // Если был стрелок и цель погибла — начисляем фраг
    if (target.hp === 0 && shooter && players[shooter.id]) {
        players[shooter.id].kills++;
        sendPlayerState(players[shooter.id]);
    }
}

// ============================================================================
// СЕТЕВЫЕ ОБРАБОТЧИКИ SOCKET.IO
// ============================================================================

io.on('connection', (socket) => {
    // 1. АВТОРnetworkИЗАЦИЯ ИГРОКА (playerAuth)
    socket.on('playerAuth', (data) => {
        const roomName = data.mode === 'pvp' ? 'mode_pvp' : 'mode_coop';
        
        // Если игрок меняет режим, убираем его из старой комнаты
        if (players[socket.id]) {
            socket.leave(players[socket.id].room);
            coopRoom.skipVotes.delete(socket.id);
        }

        const spawn = getRandomSpawnPoint();
        
        // Инициализация структуры игрока на сервере
        players[socket.id] = {
            id: socket.id,
            nick: data.nick || `Боец_${socket.id.substr(0, 3)}`,
            room: roomName,
            hp: 100,
            armor: 100,
            kills: 0,
            x: spawn.x,
            z: spawn.z,
            rotY: 0
        };

        socket.join(roomName);
        socket.emit('authSuccess', { nick: players[socket.id].nick, mode: data.mode });
        socket.emit('init', { x: spawn.x, z: spawn.z });
        
        // Моментально высылаем актуальный HUD здоровья и фрагов
        sendPlayerState(players[socket.id]);

        // ПЕРВАЯ ОТПРАВКА ТАЙМЕРА ДЛЯ СНЯТИЯ ПЛАШКИ «ЗАГРУЗКА...» (Скриншот №7-8)
        if (roomName === 'mode_coop') {
            socket.emit('timerUpdate', {
                isBreak: coopRoom.isBreak,
                timeLeft: coopRoom.isBreak ? coopRoom.timeLeft : Object.keys(coopRoom.bots).length,
                wave: coopRoom.wave,
                votes: coopRoom.skipVotes.size
            });
        } else {
            socket.emit('timerUpdate', { isBreak: false, timeLeft: 0, wave: 0, votes: 0 });
        }
    });

    // 2. СИНХРОНИЗАЦИЯ ДВИЖЕНИЯ (playerMove)
    socket.on('playerMove', (data) => {
        const p = players[socket.id];
        if (!p || p.hp <= 0) return;

        p.x = data.x;
        p.z = data.z;
        p.rotY = data.rotY;
    });

    // 3. ОБРАБОТКА ПОПАДАНИЯ (playerHit)
    socket.on('playerHit', (data) => {
        const shooter = players[socket.id];
        if (!shooter || shooter.hp <= 0) return;

        // Расчёт базового урона по контракту: head = 100, body = 35 (Скриншот №2)
        const baseDamage = data.zone === 'head' ? 100 : 35;

        if (shooter.room === 'mode_coop') {
            // Режим PvE: Наносим урон зомби-боту
            const bot = coopRoom.bots[data.targetId];
            if (bot && bot.hp > 0) {
                bot.hp -= baseDamage;
                if (bot.hp <= 0) {
                    delete coopRoom.bots[data.targetId];
                    shooter.kills++;
                    sendPlayerState(shooter);
                    
                    // Если все боты зачищены
                    if (Object.keys(coopRoom.bots).length === 0) {
                        io.to('mode_coop').emit('waveCleared');
                        coopRoom.isBreak = true;
                        coopRoom.wave++;
                        coopRoom.timeLeft = 15; // Сброс таймера на перерыв 15 сек (Скриншот №3)
                        coopRoom.skipVotes.clear();
                    }
                }
            }
        } else if (shooter.room === 'mode_pvp') {
            // Режим PvP: Наносим урон другому игроку
            const targetPlayer = players[data.targetId];
            if (targetPlayer && targetPlayer.room === 'mode_pvp' && targetPlayer.hp > 0) {
                applyDamageToPlayer(targetPlayer, baseDamage, shooter);
                sendPlayerState(targetPlayer);
                
                // Пересылаем жертве сигнал о направлении атаки (Кровавый указатель)
                io.to(targetPlayer.id).emit('damagedBy', {
                    shooterX: shooter.x,
                    shooterZ: shooter.z
                });
            }
        }
    });

    // 4. ЗАПРОС НА РЕСПАВН (requestRespawn) (Скриншот №5)
    socket.on('requestRespawn', () => {
        const p = players[socket.id];
        if (!p || p.hp > 0) return;

        const spawn = getRandomSpawnPoint();
        p.hp = 100;
        p.armor = 100;
        p.x = spawn.x;
        p.z = spawn.z;

        socket.emit('init', { x: spawn.x, z: spawn.z });
        sendPlayerState(p); // Сразу же обновляем HUD у клиента после респавна
    });

    // 5. ГОЛОСОВАНИЕ ЗА ПРОПУСК ПЕРЕРЫВА (skipBreakVote)
    socket.on('skipBreakVote', () => {
        const p = players[socket.id];
        if (!p || p.room !== 'mode_coop' || !coopRoom.isBreak) return;

        coopRoom.skipVotes.add(socket.id);

        // Считаем количество активных игроков в Co-op
        const coopPlayersCount = Object.values(players).filter(pl => pl.room === 'mode_coop').length;

        // Если проголосовало большинство (или все), досрочно завершаем перерыв
        if (coopRoom.skipVotes.size >= Math.max(1, Math.ceil(coopPlayersCount * 0.5))) {
            coopRoom.isBreak = false;
            coopRoom.timeLeft = 0;
            spawnBotsForWave(coopRoom.wave);
        }
    });

    // 6. ОТКЛЮЧЕНИЕ ИГРОКА
    socket.on('disconnect', () => {
        coopRoom.skipVotes.delete(socket.id);
        delete players[socket.id];
    });
});

// ============================================================================
// ИГРОВЫЕ ЦИКЛЫ (ТИКИ СЕРВЕРА)
// ============================================================================

// Высокочастотный цикл (Tickrate 30Hz): Рассылка позиций через volatile
setInterval(() => {
    const pvpPlayers = {};
    const coopPlayers = {};

    // Сортируем игроков по их комнатам
    for (let id in players) {
        const p = players[id];
        const pData = { nick: p.nick, hp: p.hp, armor: p.armor, x: p.x, z: p.z, rotY: p.rotY, kills: p.kills };
        if (p.room === 'mode_pvp') pvpPlayers[id] = pData;
        if (p.room === 'mode_coop') coopPlayers[id] = pData;
    }

    // Использование volatile.emit для разгрузки мобильной сети (Скриншот №1)
    io.to('mode_pvp').volatile.emit('updatePlayers', pvpPlayers);
    io.to('mode_coop').volatile.emit('updatePlayers', coopPlayers);
    
    // Отправляем позиции ботов только в комнату Co-op
    if (Object.keys(coopRoom.bots).length > 0) {
        io.to('mode_coop').volatile.emit('updateBots', coopRoom.bots);
    }
}, 1000 / 30);


// Низкочастотный цикл ИИ ботов (10Hz)
setInterval(() => {
    if (coopRoom.isBreak || Object.keys(coopRoom.bots).length === 0) return;

    const coopPlayers = Object.values(players).filter(p => p.room === 'mode_coop' && p.hp > 0);
    if (coopPlayers.length === 0) return;

    for (let id in coopRoom.bots) {
        const bot = coopRoom.bots[id];
        
        // Поиск ближайшего живого игрока
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
            // Поворот бота в сторону цели
            bot.rotY = Math.atan2(closestPlayer.x - bot.x, closestPlayer.z - bot.z);
            
            // Движение бота к игроку
            const speed = 2.8; // скорость зомби
            bot.x += Math.sin(bot.rotY) * speed * 0.1;
            bot.z += Math.cos(bot.rotY) * speed * 0.1;

            // Если бот подошёл вплотную — наносит урон ($15$ единиц) (Скриншот №4)
            if (minDist < 1.1) {
                // Ограничиваем частоту укусов (каждый бот кусает раз в секунду)
                const now = Date.now();
                if (!bot.lastAttackTime || now - bot.lastAttackTime > 1000) {
                    applyDamageToPlayer(closestPlayer, 15);
                    sendPlayerState(closestPlayer);
                    bot.lastAttackTime = now;
                }
            }
        }
    }
}, 100);


// Секундный таймер (1Hz) для обновления волн и HUD времени
setInterval(() => {
    // ЗАЩИТА: Не гоняем таймер волн, если в Co-op комнате пусто (Скриншот №6)
    const coopPlayersCount = Object.values(players).filter(p => p.room === 'mode_coop').length;
    if (coopPlayersCount === 0) {
        // Замораживаем таймер в состоянии дефолтного перерыва
        coopRoom.isBreak = true;
        coopRoom.timeLeft = 15;
        coopRoom.bots = {};
        return;
    }

    if (coopRoom.isBreak) {
        coopRoom.timeLeft--;
        if (coopRoom.timeLeft <= 0) {
            coopRoom.isBreak = false;
            spawnBotsForWave(coopRoom.wave);
        }
    }

    // Рассылаем тики таймера в Co-op комнату
    io.to('mode_coop').emit('timerUpdate', {
        isBreak: coopRoom.isBreak,
        // Если перерыв — шлём секунды, если бой — шлём количество оставшихся ботов (Скриншот №7)
        timeLeft: coopRoom.isBreak ? coopRoom.timeLeft : Object.keys(coopRoom.bots).length,
        wave: coopRoom.wave,
        votes: coopRoom.skipVotes.size
    });
}, 1000);

// ============================================================================
// ЗАПУСК СЕРВЕРА
// ============================================================================
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server successfully started on port ${PORT}`);
});
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
        methods: ["GET", "POST"],
        allowedHeaders: ["my-custom-header"],
        credentials: true
    },
    allowEIO3: true // Совместимость со всеми версиями протокола клиента
});

// Состояние игры
const players = {};
const coopRooms = {
    'mode_coop': {
        wave: 1,
        isBreak: true,
        timeLeft: 15,
        bots: {},
        skipVotes: new Set()
    }
};

const coopSpawn = { x: 0, z: 20 };
const pvpSpawns = [
    { x: -30, z: -30 }, { x: 30, z: 30 }, { x: -30, z: 30 }, { x: 30, z: -30 }
];

// Тик-рейт сервера (30 раз в секунду)
setInterval(() => {
    updateCoopBots();
    broadcastRooms();
}, 1000 / 30);

// Секундный таймер
setInterval(() => {
    const room = coopRooms['mode_coop'];
    if (room.timeLeft > 0) {
        room.timeLeft--;
    } else {
        if (room.isBreak) {
            room.isBreak = false;
            room.skipVotes.clear();
            spawnWave(room.wave);
        } else {
            if (Object.keys(room.bots).length === 0) startBreak();
        }
    }
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

        if (players[socket.id]) {
            socket.leave(players[socket.id].room);
            coopRooms['mode_coop'].skipVotes.delete(socket.id);
        }

        players[socket.id] = {
            id: socket.id, nick: nick, pass: data.pass || "", mode: mode, room: roomName,
            x: 0, z: 0, rotY: 0, hp: 100, armor: 100, kills: 0
        };

        socket.join(roomName);
        socket.emit('authSuccess', { nick: nick, pass: data.pass, mode: mode });
        
        const spawn = mode === 'coop' ? coopSpawn : pvpSpawns[Math.floor(Math.random() * pvpSpawns.length)];
        players[socket.id].x = spawn.x;
        players[socket.id].z = spawn.z;
        socket.emit('init', { x: spawn.x, z: spawn.z, map: true });
    });

    socket.on('playerMove', (data) => {
        const p = players[socket.id];
        if (p && p.hp > 0) { p.x = data.x; p.z = data.z; p.rotY = data.rotY; }
    });

    socket.on('playerHit', (data) => {
        const shooter = players[socket.id];
        if (!shooter || shooter.hp <= 0) return;
        const targetId = data.targetId;
        const baseDamage = data.zone === 'head' ? 50 : 25;

        if (shooter.room === 'mode_pvp' && players[targetId] && players[targetId].room === 'mode_pvp') {
            const target = players[targetId];
            if (target.hp <= 0) return;
            applyDamage(target, baseDamage, shooter);
            socket.to(targetId).emit('damagedBy', { shooterX: shooter.x, shooterZ: shooter.z });
        }

        if (shooter.room === 'mode_coop') {
            const room = coopRooms['mode_coop'];
            const bot = room.bots[targetId];
            if (bot && bot.hp > 0) {
                bot.hp -= baseDamage;
                if (bot.hp <= 0) {
                    delete room.bots[targetId];
                    shooter.kills++;
                    if (Object.keys(room.bots).length === 0 && !room.isBreak) startBreak();
                }
            }
        }
    });

    socket.on('skipBreakVote', () => {
        const p = players[socket.id];
        if (!p || p.room !== 'mode_coop') return;
        const room = coopRooms['mode_coop'];
        if (!room.isBreak) return;
        room.skipVotes.add(socket.id);
        const totalInCoop = Object.values(players).filter(pl => pl.room === 'mode_coop').length;
        if (room.skipVotes.size >= Math.max(1, totalInCoop)) room.timeLeft = 0;
    });

    socket.on('requestRespawn', () => {
        const p = players[socket.id];
        if (!p || p.hp > 0) return;
        p.hp = 100; p.armor = 100;
        const spawn = p.mode === 'coop' ? coopSpawn : pvpSpawns[Math.floor(Math.random() * pvpSpawns.length)];
        p.x = spawn.x; p.z = spawn.z;
        socket.emit('init', { x: spawn.x, z: spawn.z });
    });

    socket.on('disconnect', () => {
        coopRooms['mode_coop'].skipVotes.delete(socket.id);
        delete players[socket.id];
    });
});

function applyDamage(target, damage, shooter) {
    if (target.armor > 0) {
        const armorAbsorb = Math.floor(damage * 0.5);
        const healthDamage = damage - armorAbsorb;
        target.armor = Math.max(0, target.armor - armorAbsorb);
        target.hp = Math.max(0, target.hp - healthDamage);
    } else {
        target.hp = Math.max(0, target.hp - damage);
    }
    if (target.hp <= 0 && shooter) shooter.kills++;
}

function startBreak() {
    const room = coopRooms['mode_coop'];
    room.isBreak = true; room.wave++; room.timeLeft = 20; room.skipVotes.clear();
    io.to('mode_coop').emit('waveCleared');
}

function spawnWave(waveNumber) {
    const room = coopRooms['mode_coop']; room.bots = {};
    const botCount = 3 + waveNumber * 2;
    for (let i = 0; i < botCount; i++) {
        const botId = `bot_${Date.now()}_${i}`;
        const angle = Math.random() * Math.PI * 2;
        const radius = 25 + Math.random() * 10;
        room.bots[botId] = {
            id: botId, x: Math.cos(angle) * radius, z: Math.sin(angle) * radius,
            rotY: 0, hp: 50 + waveNumber * 10, speed: 4 + Math.min(4, waveNumber * 0.5)
        };
    }
}

function updateCoopBots() {
    const room = coopRooms['mode_coop']; if (room.isBreak) return;
    const coopPlayers = Object.values(players).filter(p => p.room === 'mode_coop' && p.hp > 0);
    if (coopPlayers.length === 0) return;

    for (let bId in room.bots) {
        const bot = room.bots[bId]; let closestPlayer = null; let minDist = Infinity;
        coopPlayers.forEach(p => {
            const dist = Math.hypot(p.x - bot.x, p.z - bot.z);
            if (dist < minDist) { minDist = dist; closestPlayer = p; }
        });
        if (closestPlayer) {
            bot.rotY = Math.atan2(closestPlayer.x - bot.x, closestPlayer.z - bot.z);
            if (minDist > 1.2) {
                bot.x += Math.sin(bot.rotY) * bot.speed * (1/30);
                bot.z += Math.cos(bot.rotY) * bot.speed * (1/30);
            } else {
                if (!bot.lastAttackTime || Date.now() - bot.lastAttackTime > 1000) {
                    applyDamage(closestPlayer, 15, null);
                    io.to(closestPlayer.id).emit('damagedBy', { shooterX: bot.x, shooterZ: bot.z });
                    bot.lastAttackTime = Date.now();
                }
            }
        }
    }
}

function broadcastRooms() {
    const pvpPlayers = {}, coopPlayers = {};
    for (let id in players) {
        if (players[id].room === 'mode_pvp') pvpPlayers[id] = players[id];
        else coopPlayers[id] = players[id];
    }
    io.to('mode_pvp').emit('updatePlayers', pvpPlayers);
    io.to('mode_coop').emit('updatePlayers', coopPlayers);
    io.to('mode_coop').emit('updateBots', coopRooms['mode_coop'].bots);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер запущен на портах: ${PORT}`));
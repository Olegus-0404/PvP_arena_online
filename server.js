// ============================================================================
// GAME SERVER CORE: WebGL Mobile FPS Dedicated Backend
// ============================================================================
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.get('/', (req, res) => {
    res.send('PvP Arena Online Server v1.2 is Running.');
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// ГЛОБАЛЬНЫЕ ХРАНИЛИЩА
const players = {};
const rooms = {}; // roomName -> { round, totalRounds, roundEndsAt, roundKills, roundWins, finished }

// Точки спавна — координаты сняты напрямую из меша карты
// (spawn_blue / spawn_red в chernobyl_pvp_map.glb), с небольшим разбросом,
// чтобы игроки одной команды не спавнились друг в друге.
const spawnPointsByTeam = {
    blue: [
        { x: -80, z: 20 }, { x: -78, z: 23 }, { x: -82, z: 17 },
        { x: -76, z: 20 }, { x: -80, z: 25 }
    ],
    red: [
        { x: 80, z: 20 }, { x: 78, z: 23 }, { x: 82, z: 17 },
        { x: 76, z: 20 }, { x: 80, z: 25 }
    ]
};

// Лобби убрали — все игроки всегда в одной общей комнате
const ROOM_NAME = 'public_match';

const ROUND_DURATION_MS = 3 * 60 * 1000; // 3 минуты
const TOTAL_ROUNDS = 5;

function getSpawnPoint(team) {
    const points = spawnPointsByTeam[team] || spawnPointsByTeam.blue;
    return points[Math.floor(Math.random() * points.length)];
}

function ensureRoom(roomName) {
    if (!rooms[roomName]) {
        rooms[roomName] = {
            round: 1,
            totalRounds: TOTAL_ROUNDS,
            roundEndsAt: Date.now() + ROUND_DURATION_MS,
            roundKills: { blue: 0, red: 0 },
            roundWins: { blue: 0, red: 0 },
            finished: false
        };
    }
    return rooms[roomName];
}

// Балансировка команд: считаем живых в комнате и добавляем в ту, где меньше
function assignTeam(roomName) {
    let blueCount = 0, redCount = 0;
    for (const id in players) {
        const p = players[id];
        if (p.room !== roomName) continue;
        if (p.team === 'blue') blueCount++;
        else if (p.team === 'red') redCount++;
    }
    return blueCount <= redCount ? 'blue' : 'red';
}

function sendPlayerState(player) {
    io.to(player.id).emit('playerState', {
        hp: player.hp, armor: player.armor, kills: player.kills, team: player.team
    });
}

function sendMatchState(roomName) {
    const room = rooms[roomName];
    if (!room) return;
    io.to(roomName).emit('matchState', {
        round: room.round,
        totalRounds: room.totalRounds,
        timeLeft: Math.max(0, room.roundEndsAt - Date.now()),
        roundWins: room.roundWins,
        finished: room.finished
    });
}

function respawnAllInRoom(roomName) {
    for (const id in players) {
        const p = players[id];
        if (p.room !== roomName) continue;
        const spawn = getSpawnPoint(p.team);
        p.hp = 100; p.armor = 100; p.x = spawn.x; p.z = spawn.z;
        io.to(p.id).emit('init', { x: spawn.x, z: spawn.z });
        sendPlayerState(p);
    }
}

function endRound(roomName) {
    const room = rooms[roomName];
    if (!room || room.finished) return;

    // Победитель раунда — команда с большим числом убийств за раунд.
    // При равенстве очко не начисляется никому.
    const { blue, red } = room.roundKills;
    if (blue > red) room.roundWins.blue++;
    else if (red > blue) room.roundWins.red++;

    room.roundKills = { blue: 0, red: 0 };
    room.round++;

    if (room.round > room.totalRounds) {
        room.finished = true;
        const winner = room.roundWins.blue === room.roundWins.red
            ? 'draw'
            : (room.roundWins.blue > room.roundWins.red ? 'blue' : 'red');
        io.to(roomName).emit('matchEnd', { roundWins: room.roundWins, winner });
        sendMatchState(roomName);
        return;
    }

    room.roundEndsAt = Date.now() + ROUND_DURATION_MS;
    respawnAllInRoom(roomName);
    io.to(roomName).emit('roundStart', {
        round: room.round, totalRounds: room.totalRounds, roundWins: room.roundWins
    });
    sendMatchState(roomName);
}

function applyDamageToPlayer(target, amount, shooter = null) {
    if (target.hp <= 0) return;

    if (target.armor > 0) {
        const armorDamage = Math.min(target.armor, amount * 0.7);
        target.armor -= Math.round(armorDamage);
        target.hp -= Math.round(amount - armorDamage);
    } else {
        target.hp -= amount;
    }

    if (target.hp <= 0) {
        target.hp = 0;
        if (shooter && players[shooter.id]) {
            players[shooter.id].kills++;
            sendPlayerState(players[shooter.id]);

            const room = rooms[target.room];
            if (room && !room.finished && shooter.team && room.roundKills[shooter.team] !== undefined) {
                room.roundKills[shooter.team]++;
            }

            io.to(target.room).emit('killfeed', {
                killer: shooter.nick,
                weapon: shooter.currentWeapon || 'AK-47',
                victim: target.nick
            });
        }
    }
}

io.on('connection', (socket) => {
    const query = socket.handshake.query;
    let nick = query.nick ? query.nick.trim() : "Боец_" + socket.id.substr(0, 3);
    const roomName = ROOM_NAME;

    ensureRoom(roomName);
    const team = assignTeam(roomName);
    const spawn = getSpawnPoint(team);

    players[socket.id] = {
        id: socket.id,
        nick: nick,
        room: roomName,
        team: team,
        hp: 100,
        armor: 100,
        kills: 0,
        x: spawn.x,
        z: spawn.z,
        rotY: 0,
        currentWeapon: 'rifle'
    };

    socket.join(roomName);
    socket.emit('authSuccess', { nick: nick, room: roomName, mode: 'pvp', team: team });
    socket.emit('init', { x: spawn.x, z: spawn.z });
    sendPlayerState(players[socket.id]);
    sendMatchState(roomName);

    socket.on('playerMove', (data) => {
        const p = players[socket.id];
        if (!p || p.hp <= 0) return;
        p.x = data.x; p.z = data.z; p.rotY = data.rotY;
    });

    socket.on('playerHit', (data) => {
        const shooter = players[socket.id];
        if (!shooter || shooter.hp <= 0) return;

        const baseDamage = data.zone === 'head' ? 100 : 35;
        const targetPlayer = players[data.targetId];

        if (targetPlayer && targetPlayer.room === shooter.room
            && targetPlayer.team !== shooter.team && targetPlayer.hp > 0) {
            applyDamageToPlayer(targetPlayer, baseDamage, shooter);
            sendPlayerState(targetPlayer);
            io.to(targetPlayer.id).emit('damagedBy', { shooterX: shooter.x, shooterZ: shooter.z });
        }
    });

    socket.on('requestRespawn', () => {
        const p = players[socket.id];
        if (!p || p.hp > 0) return;
        const spawn = getSpawnPoint(p.team);
        p.hp = 100; p.armor = 100; p.x = spawn.x; p.z = spawn.z;
        socket.emit('init', { x: spawn.x, z: spawn.z });
        sendPlayerState(p);
    });

    socket.on('sendChatMessage', (data) => {
        if (!data || !data.msg) return;
        const p = players[socket.id];
        if (p) {
            io.to(p.room).emit('chatMessage', { nick: p.nick, msg: data.msg });
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
    });
});

// Тикрейт позиций (30Hz)
setInterval(() => {
    const roomStates = {};
    for (let id in players) {
        const p = players[id];
        if (!roomStates[p.room]) roomStates[p.room] = {};
        roomStates[p.room][id] = {
            nick: p.nick, hp: p.hp, armor: p.armor, x: p.x, z: p.z,
            rotY: p.rotY, kills: p.kills, team: p.team
        };
    }
    for (let room in roomStates) {
        io.to(room).volatile.emit('updatePlayers', roomStates[room]);
    }
}, 1000 / 30);

// Тикрейт раундов/таймера (1Hz)
setInterval(() => {
    const now = Date.now();
    for (const roomName in rooms) {
        const room = rooms[roomName];
        if (room.finished) continue;
        if (now >= room.roundEndsAt) {
            endRound(roomName);
        } else {
            sendMatchState(roomName);
        }
    }
}, 1000);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server successfully started on port ${PORT}`);
});
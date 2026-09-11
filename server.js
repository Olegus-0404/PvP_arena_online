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
    res.send('PvP Arena Online Server v1.1 is Running.');
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// ГЛОБАЛЬНЫЕ ХРАНИЛИЩА
const players = {};
const lobbies = {}; // Хранилище кастомных комнат

// Имитация БД пользователей (в реальном проекте тут будет MongoDB/PostgreSQL)
const usersDB = {}; 

// Фиксированные точки спавна (замени координаты на свои, где нет текстур)
const spawnPoints = [
    { x: 10, z: 10 }, { x: -10, z: -10 }, { x: 20, z: -20 },
    { x: -20, z: 20 }, { x: 0, z: 25 }, { x: 0, z: -25 }
];

function sendPlayerState(player) {
    io.to(player.id).emit('playerState', { hp: player.hp, armor: player.armor, kills: player.kills });
}

function getSafeSpawnPoint() {
    return spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
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
            // Отправка данных для Killfeed (в стиле CS)
            io.to(target.room).emit('killfeed', {
                killer: shooter.nick,
                weapon: shooter.currentWeapon || 'AK-47',
                victim: target.nick
            });
        }
    }
}

io.on('connection', (socket) => {
    
    // АВТОРИЗАЦИЯ И РЕГИСТРАЦИЯ (Базовая реализация)
    socket.on('playerAuth', (data) => {
        // data = { email, password, serverUrl, lobbyId, ... }
        let nick = "Боец_" + socket.id.substr(0, 3);
        
        if (data.email) {
            nick = data.email.split('@')[0]; // Ник берем из почты
            // Здесь должна быть логика проверки пароля bcrypt
        }

        const roomName = data.lobbyId ? `lobby_${data.lobbyId}` : 'public_match';
        
        if (players[socket.id]) {
            socket.leave(players[socket.id].room);
        }

        const spawn = getSafeSpawnPoint();
        
        players[socket.id] = {
            id: socket.id,
            nick: nick,
            room: roomName,
            hp: 100,
            armor: 100,
            kills: 0,
            x: spawn.x,
            z: spawn.z,
            rotY: 0,
            currentWeapon: 'Pistol'
        };

        socket.join(roomName);
        socket.emit('authSuccess', { nick: nick, room: roomName });
        socket.emit('init', { x: spawn.x, z: spawn.z });
        sendPlayerState(players[socket.id]);
    });

    socket.on('playerMove', (data) => {
        const p = players[socket.id];
        if (!p || p.hp <= 0) return;
        p.x = data.x; p.z = data.z; p.rotY = data.rotY;
    });

    // Обработка стрельбы (теперь без ботов, только PvP)
    socket.on('playerHit', (data) => {
        const shooter = players[socket.id];
        if (!shooter || shooter.hp <= 0) return;

        // В main.js мы добавим разный урон для ножа, пистолета и калаша
        const baseDamage = data.zone === 'head' ? 100 : (data.weaponDamage || 35);
        const targetPlayer = players[data.targetId];

        if (targetPlayer && targetPlayer.room === shooter.room && targetPlayer.hp > 0) {
            applyDamageToPlayer(targetPlayer, baseDamage, shooter);
            sendPlayerState(targetPlayer);
            io.to(targetPlayer.id).emit('damagedBy', { shooterX: shooter.x, shooterZ: shooter.z });
        }
    });

    socket.on('requestRespawn', () => {
        const p = players[socket.id];
        if (!p || p.hp > 0) return;

        const spawn = getSafeSpawnPoint();
        p.hp = 100; p.armor = 100; p.x = spawn.x; p.z = spawn.z;

        socket.emit('init', { x: spawn.x, z: spawn.z });
        sendPlayerState(p);
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
    });
});

// Тикрейт (30Hz)
setInterval(() => {
    const roomStates = {};
    for (let id in players) {
        const p = players[id];
        if (!roomStates[p.room]) roomStates[p.room] = {};
        roomStates[p.room][id] = { nick: p.nick, hp: p.hp, armor: p.armor, x: p.x, z: p.z, rotY: p.rotY, kills: p.kills };
    }
    
    for (let room in roomStates) {
        io.to(room).volatile.emit('updatePlayers', roomStates[room]);
    }
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server successfully started on port ${PORT}`);
});
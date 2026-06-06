const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// Подключаем наш класс игрока из соседнего файла player.js
const Player = require('./player');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

let players = {};
let accounts = {}; 

const MATCH_DURATION = 180; 
let timeLeft = MATCH_DURATION;

setInterval(() => {
    if (timeLeft > 0) timeLeft--;
    else { timeLeft = MATCH_DURATION; resetMatch(); }
    io.emit('timerUpdate', { timeLeft });
}, 1000);

function resetMatch() {
    for (let id in players) {
        players[id].resetKills(); // Используем метод из класса
        players[id].respawn();    // Используем метод из класса
        io.to(id).emit('init', { x: players[id].x, z: players[id].z });
    }
    io.emit('updatePlayers', players);
}

io.on('connection', (socket) => {
    console.log(`Пользователь подключился: ${socket.id}`);
    socket.emit('timerUpdate', { timeLeft });

    socket.on('playerAuth', (data) => {
        const nick = data.nick ? data.nick.trim() : "";
        const pass = data.pass ? data.pass.trim() : "";

        if (nick.length < 2 || pass.length < 3) {
            socket.emit('authFailed', "Слишком короткий ник или пароль!");
            return;
        }

        if (accounts[nick]) {
            if (accounts[nick] !== pass) {
                socket.emit('authFailed', "Неверный пароль!");
                return;
            }
        } else {
            accounts[nick] = pass;
        }

        for (let id in players) {
            if (players[id].nick === nick) {
                socket.emit('authFailed', "Этот игрок уже на арене!");
                return;
            }
        }

        // КРАСИВО: Создаем игрока через наш класс!
        players[socket.id] = new Player(socket.id, nick);

        socket.emit('authSuccess', { nick, pass });
        socket.emit('init', { x: players[socket.id].x, z: players[socket.id].z });
        io.emit('updatePlayers', players);
    });

    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            // Используем метод класса для обновления позиции
            players[socket.id].updatePosition(data.x, data.z, data.rotY);
            socket.broadcast.emit('updatePlayers', players);
        }
    });

    socket.on('playerHit', (data) => {
        const shooter = players[socket.id];
        const target = players[data.targetId];

        if (!shooter || shooter.hp <= 0 || !target || target.hp <= 0) return;

        // Используем метод класса для нанесения урона
        const isDead = target.takeDamage(data.zone);

        if (isDead) {
            shooter.kills++;
            console.log(`${shooter.nick} убил ${target.nick}`);
        }

        io.emit('updatePlayers', players);
    });

    socket.on('requestRespawn', () => {
        if (players[socket.id] && players[socket.id].hp <= 0) {
            players[socket.id].respawn(); // Оживляем через класс
            socket.emit('init', { x: players[socket.id].x, z: players[socket.id].z });
            io.emit('updatePlayers', players);
        }
    });

    socket.on('disconnect', () => {
        if (players[socket.id]) {
            console.log(`Игрок ${players[socket.id].nick} покинул арену.`);
            delete players[socket.id];
            io.emit('updatePlayers', players);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
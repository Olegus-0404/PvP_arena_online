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

// КЛАСС ИГРОКА ОПИСАН ПРЯМО ТУТ ДЛЯ НАДЕЖНОСТИ
class Player {
    constructor(id, nick) {
        this.id = id;
        this.nick = nick;
        this.hp = 100;
        this.kills = 0;
        this.x = (Math.random() * 40) - 20;
        this.z = (Math.random() * 40) - 20;
        this.rotY = 0;
    }
    updatePosition(x, z, rotY) {
        if (this.hp > 0) {
            this.x = x;
            this.z = z;
            this.rotY = rotY;
        }
    }
    takeDamage(zone) {
        if (this.hp <= 0) return false;
        let damage = (zone === 'head') ? 100 : 20;
        this.hp -= damage;
        if (this.hp < 0) this.hp = 0;
        return this.hp === 0;
    }
    respawn() {
        this.hp = 100;
        this.x = (Math.random() * 40) - 20;
        this.z = (Math.random() * 40) - 20;
        this.rotY = 0;
    }
}

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
        players[id].kills = 0;
        players[id].respawn();
        io.to(id).emit('init', { x: players[id].x, z: players[id].z });
    }
    io.emit('updatePlayers', players);
}

io.on('connection', (socket) => {
    console.log(`Подключился сокет: ${socket.id}`);
    socket.emit('timerUpdate', { timeLeft });

    socket.on('playerAuth', (data) => {
        const nick = data.nick ? data.nick.trim() : "";
        const pass = data.pass ? data.pass.trim() : "";

        if (nick.length < 2 || pass.length < 3) {
            socket.emit('authFailed', "Короткий ник или пароль!");
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
                socket.emit('authFailed', "Ник уже занят на арене!");
                return;
            }
        }

        players[socket.id] = new Player(socket.id, nick);
        socket.emit('authSuccess', { nick, pass });
        socket.emit('init', { x: players[socket.id].x, z: players[socket.id].z });
        io.emit('updatePlayers', players);
    });

    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].updatePosition(data.x, data.z, data.rotY);
            socket.broadcast.emit('updatePlayers', players);
        }
    });

    socket.on('playerHit', (data) => {
        const shooter = players[socket.id];
        const target = players[data.targetId];
        if (!shooter || shooter.hp <= 0 || !target || target.hp <= 0) return;

        if (target.takeDamage(data.zone)) {
            shooter.kills++;
        }
        io.emit('updatePlayers', players);
    });

    socket.on('requestRespawn', () => {
        if (players[socket.id] && players[socket.id].hp <= 0) {
            players[socket.id].respawn();
            socket.emit('init', { x: players[socket.id].x, z: players[socket.id].z });
            io.emit('updatePlayers', players);
        }
    });

    socket.on('disconnect', () => {
        if (players[socket.id]) {
            delete players[socket.id];
            io.emit('updatePlayers', players);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Сервер активен на порту ${PORT}`));
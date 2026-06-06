const express = require('express');
const app = express();
const http = require('http').createServer(app);

// Настраиваем CORS, чтобы сервер принимал подключения ОТО ВСЮДУ
const io = require('socket.io')(http, {
    cors: {
        origin: "*", // Разрешает подключаться любым сайтам (включая твой GitHub Pages)
        methods: ["GET", "POST"]
    }
});

let players = {};
let passwords = {}; 
let matchTimer = 180; // 3 минуты (180 секунд)

// Запуск таймера раунда
setInterval(() => {
    if (matchTimer > 0) {
        matchTimer--;
        io.emit('timerUpdate', { timeLeft: matchTimer });
    } else {
        matchTimer = 180; // Перезапуск раунда
        let leaderboard = Object.values(players)
            .sort((a, b) => b.kills - a.kills)
            .slice(0, 5);
            
        io.emit('matchEnd', { leaderboard: leaderboard });
        
        // Респавн всех живых и мертвых для нового раунда
        for (let id in players) {
            players[id].hp = 100;
            players[id].kills = 0;
            players[id].x = (Math.random() * 40) - 20;
            players[id].z = (Math.random() * 40) - 20;
        }
        
        setTimeout(() => {
            io.emit('mapChange', "arena_1");
            for (let id in players) {
                io.to(id).emit('init', { x: players[id].x, z: players[id].z });
            }
        }, 5000);
    }
}, 1000);

io.on('connection', (socket) => {
    console.log(`Подключился игрок: ${socket.id}`);

    socket.on('playerAuth', (data) => {
        let nick = data.nick;
        let pass = data.pass;

        if (passwords[nick] && passwords[nick] !== pass) {
            socket.emit('authFailed', "Неверный пароль для этого ника!");
            return;
        }

        passwords[nick] = pass;
        
        players[socket.id] = {
            id: socket.id,
            nick: nick,
            x: (Math.random() * 40) - 20,
            z: (Math.random() * 40) - 20,
            rotY: 0,
            hp: 100,
            kills: 0
        };

        socket.emit('authSuccess', { nick: nick, pass: pass });
        socket.emit('init', { x: players[socket.id].x, z: players[socket.id].z });
        socket.emit('timerUpdate', { timeLeft: matchTimer });
    });

    socket.on('playerMove', (data) => {
        if (players[socket.id] && players[socket.id].hp > 0) {
            players[socket.id].x = data.x;
            players[socket.id].z = data.z;
            players[socket.id].rotY = data.rotY;
            io.emit('updatePlayers', players);
        }
    });

    socket.on('playerHit', (data) => {
        let targetId = data.targetId;
        let zone = data.zone;

        if (players[targetId] && players[targetId].hp > 0 && players[socket.id] && players[socket.id].hp > 0) {
            let damage = zone === 'head' ? 100 : 35; // Хедшот — мгновенная смерть
            players[targetId].hp -= damage;

            if (players[targetId].hp <= 0) {
                players[targetId].hp = 0;
                players[socket.id].kills += 1; // Засчитываем килл без лимитов
            }

            io.emit('updatePlayers', players);
        }
    });

    socket.on('requestRespawn', () => {
        if (players[socket.id] && players[socket.id].hp <= 0) {
            players[socket.id].hp = 100;
            players[socket.id].x = (Math.random() * 40) - 20;
            players[socket.id].z = (Math.random() * 40) - 20;
            socket.emit('init', { x: players[socket.id].x, z: players[socket.id].z });
            io.emit('updatePlayers', players);
        }
    });

    socket.on('disconnect', () => {
        console.log(`Игрок отключился: ${socket.id}`);
        delete players[socket.id];
        io.emit('updatePlayers', players);
    });
});

const PORT = process.env.PORT || 10000;
http.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
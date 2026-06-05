const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

let players = {};
let votes = { arena: 0, factory: 0, city: 0 };
let votedPlayers = {};

io.on('connection', (socket) => {
    console.log('Игрок подключился: ' + socket.id);

    // Создаём данные игрока при подключении
    players[socket.id] = {
        x: (Math.random() - 0.5) * 20,
        z: (Math.random() - 0.5) * 20,
        hp: 100,
        armor: 100,
        kills: 0
    };

    // Отправляем игроку его начальные координаты
    socket.emit('init', { x: players[socket.id].x, z: players[socket.id].z });

    // Обновление позиции
    socket.on('playerMove', (data) => {
        if (players[socket.id] && players[socket.id].hp > 0) {
            players[socket.id].x = data.x;
            players[socket.id].z = data.z;
        }
    });

    // Регистрация попаданий и урон
    socket.on('playerHit', (data) => {
        const targetId = data.targetId;
        const zone = data.zone;

        if (players[targetId] && players[targetId].hp > 0) {
            let damage = 15; 
            if (zone === 'head') damage = 100; // Ваншот в сферу головы!

            if (players[targetId].armor > 0 && zone !== 'head') {
                players[targetId].armor -= damage;
                if (players[targetId].armor < 0) {
                    players[targetId].hp += players[targetId].armor;
                    players[targetId].armor = 0;
                }
            } else {
                players[targetId].hp -= damage;
            }

            if (players[targetId].hp <= 0) {
                players[targetId].hp = 0;
                players[socket.id].kills += 1;

                if (players[socket.id].kills >= 15) {
                    let leaderboard = Object.keys(players).map(id => ({ id, kills: players[id].kills }))
                        .sort((a,b) => b.kills - a.kills);
                    io.emit('matchEnd', { leaderboard });
                }
            }
        }
    });

    socket.on('requestRespawn', () => {
        if (players[socket.id]) {
            players[socket.id].hp = 100;
            players[socket.id].armor = 100;
        }
    });

    socket.on('voteMap', (mapName) => {
        if (!votedPlayers[socket.id]) {
            votedPlayers[socket.id] = true;
            votes[mapName] = (votes[mapName] || 0) + 1;
            io.emit('updateVotes', votes);
            
            let totalVotes = Object.values(votes).reduce((a, b) => a + b, 0);
            if (totalVotes >= Object.keys(players).length) {
                let winnerMap = Object.keys(votes).reduce((a, b) => votes[a] > votes[b] ? a : b);
                votes = { arena: 0, factory: 0, city: 0 };
                votedPlayers = {};
                
                Object.keys(players).forEach(id => { players[id].kills = 0; players[id].hp = 100; players[id].armor = 100; });
                io.emit('mapChange', winnerMap);
            }
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        delete votedPlayers[socket.id];
    });
});

// Каждые 30 миллисекунд отправляем всем игрокам координаты роботов-соперников
setInterval(() => { io.emit('updatePlayers', players); }, 30);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log('Сервер работает на порту ' + PORT); });
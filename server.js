const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const USERS_FILE = path.join('/tmp', 'users_backup.json');

let registeredUsers = { "admin": "1234" };
let players = {};
let mapVotes = { arena: 0, factory: 0, city: 0 };
let votedPlayers = new Set();
let currentMap = 'arena';

// Настройки таймера (3 минуты = 180 секунд)
let roundTimeLeft = 180; 
let isMatchEnded = false;
let timerInterval = null;

// Загрузка аккаунтов
if (fs.existsSync(USERS_FILE)) {
    try {
        registeredUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        console.log('База данных игроков успешно загружена.');
    } catch (e) {
        console.log('Не удалось прочитать сохранение, используем память.');
    }
}

function saveUsersToFile() {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(registeredUsers, null, 2), 'utf8');
    } catch (e) {
        console.error('Ошибка сохранения файла:', e);
    }
}

// Запуск игрового таймера раунда
function startRoundTimer() {
    if (timerInterval) clearInterval(timerInterval);
    roundTimeLeft = 180; // 3 минуты
    isMatchEnded = false;

    timerInterval = setInterval(() => {
        if (roundTimeLeft > 0 && !isMatchEnded) {
            roundTimeLeft--;
            // Отправляем каждую секунду время всем подключенным игрокам
            io.emit('timerUpdate', { timeLeft: roundTimeLeft });
        } else if (roundTimeLeft <= 0 && !isMatchEnded) {
            endMatch();
        }
    }, 1000);
}

// Запускаем таймер сразу при старте сервера
startRoundTimer();

io.on('connection', (socket) => {
    console.log(`Подключился клиент: ${socket.id}`);

    socket.on('playerAuth', (data) => {
        const { nick, pass } = data;
        if (!nick || !pass) return socket.emit('authFailed', 'Заполните поля!');

        if (registeredUsers[nick]) {
            if (registeredUsers[nick] === pass) {
                loginPlayer(socket, nick, pass);
            } else {
                socket.emit('authFailed', 'Этот ник занят. Неверный пароль!');
            }
        } else {
            registeredUsers[nick] = pass;
            saveUsersToFile();
            loginPlayer(socket, nick, pass);
        }
    });

    function loginPlayer(socket, nick, pass) {
        players[socket.id] = {
            id: socket.id,
            nick: nick,
            x: (Math.random() - 0.5) * 40,
            z: (Math.random() - 0.5) * 40,
            hp: 100,
            armor: 100,
            kills: 0,
            rotY: 0
        };

        socket.emit('authSuccess', { nick, pass });
        socket.emit('init', { x: players[socket.id].x, z: players[socket.id].z });
        socket.emit('mapChange', currentMap);
        // Сразу шлем текущее время раунда новому игроку
        socket.emit('timerUpdate', { timeLeft: roundTimeLeft });
        io.emit('updatePlayers', players);
    }

    socket.on('playerMove', (data) => {
        if (players[socket.id] && players[socket.id].hp > 0 && !isMatchEnded) {
            players[socket.id].x = data.x;
            players[socket.id].z = data.z;
            players[socket.id].rotY = data.rotY;
            socket.broadcast.emit('updatePlayers', players);
        }
    });

    socket.on('playerHit', (data) => {
        const targetId = data.targetId;
        const zone = data.zone;

        if (players[targetId] && players[targetId].hp > 0 && !isMatchEnded) {
            if (zone === 'head') {
                players[targetId].hp = 0;
            } else {
                let damage = 25;
                if (players[targetId].armor > 0) {
                    players[targetId].armor -= damage * 0.5;
                    players[targetId].hp -= damage * 0.5;
                    if (players[targetId].armor < 0) {
                        players[targetId].hp += players[targetId].armor;
                        players[targetId].armor = 0;
                    }
                } else {
                    players[targetId].hp -= damage;
                }
            }

            if (players[targetId].hp <= 0) {
                players[targetId].hp = 0;
                if (players[socket.id]) {
                    players[socket.id].kills++;
                }
            }
            io.emit('updatePlayers', players);
        }
    });

    socket.on('requestRespawn', () => {
        if (players[socket.id] && players[socket.id].hp <= 0) {
            players[socket.id].hp = 100;
            players[socket.id].armor = 100;
            // Спавн в случайной точке большой карты
            players[socket.id].x = (Math.random() - 0.5) * 70;
            players[socket.id].z = (Math.random() - 0.5) * 70;
            socket.emit('init', { x: players[socket.id].x, z: players[socket.id].z });
            io.emit('updatePlayers', players);
        }
    });

    socket.on('voteMap', (mapName) => {
        if (!votedPlayers.has(socket.id) && mapVotes[mapName] !== undefined) {
            mapVotes[mapName]++;
            votedPlayers.add(socket.id);
            io.emit('updateVotes', mapVotes);
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        votedPlayers.delete(socket.id);
        io.emit('updatePlayers', players);
    });
});

function endMatch() {
    isMatchEnded = true;
    clearInterval(timerInterval);

    const leaderboard = Object.values(players)
        .sort((a, b) => b.kills - a.kills)
        .map(p => ({ id: p.id, nick: p.nick, kills: p.kills }));

    io.emit('matchEnd', { leaderboard });

    // Время на голосование за карту — 10 секунд
    setTimeout(() => {
        let winnerMap = 'arena';
        if (mapVotes.factory > mapVotes.arena && mapVotes.factory > mapVotes.city) winnerMap = 'factory';
        if (mapVotes.city > mapVotes.arena && mapVotes.city > mapVotes.factory) winnerMap = 'city';

        currentMap = winnerMap;
        mapVotes = { arena: 0, factory: 0, city: 0 };
        votedPlayers.clear();

        Object.keys(players).forEach(id => {
            players[id].kills = 0;
            players[id].hp = 100;
            players[id].armor = 100;
            players[id].x = (Math.random() - 0.5) * 70;
            players[id].z = (Math.random() - 0.5) * 70;
        });

        io.emit('mapChange', currentMap);
        io.emit('updatePlayers', players);
        
        // Запуск нового раунда на 3 минуты
        startRoundTimer();
    }, 10000);
}

http.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});

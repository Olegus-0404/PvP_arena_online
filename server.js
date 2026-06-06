эconst express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const USERS_FILE = path.join(__dirname, 'users.json');

let players = {};
let registeredUsers = {};
let mapVotes = { arena: 0, factory: 0, city: 0 };
let votedPlayers = new Set();
let currentMap = 'arena';
let matchKillsLimit = 15;
let isMatchEnded = false;

// Загрузка зарегистрированных аккаунтов из файла users.json
if (fs.existsSync(USERS_FILE)) {
    try {
        registeredUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        console.log('База данных пользователей успешно загружена из JSON.');
    } catch (e) {
        console.error('Ошибка чтения базы данных пользователей, создаём чистую:', e);
        registeredUsers = {};
    }
} else {
    console.log('Файл users.json не найден, он будет создан автоматически при первой регистрации.');
}

// Функция для сохранения аккаунтов в файл
function saveUsers() {
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(registeredUsers, null, 2), 'utf8');
    } catch (e) {
        console.error('Не удалось сохранить пользователей в файл:', e);
    }
}

io.on('connection', (socket) => {
    console.log(`Подключился клиент: ${socket.id}`);

    // --- ОБРАБОТКА РЕГИСТРАЦИИ И ВХОДА ---
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
            // Создание нового аккаунта, если ника нет в базе
            registeredUsers[nick] = pass;
            saveUsers();
            loginPlayer(socket, nick, pass);
        }
    });

    function loginPlayer(socket, nick, pass) {
        players[socket.id] = {
            id: socket.id,
            nick: nick,
            x: (Math.random() - 0.5) * 30,
            z: (Math.random() - 0.5) * 30,
            hp: 100,
            armor: 100,
            kills: 0,
            rotY: 0
        };

        socket.emit('authSuccess', { nick, pass });
        socket.emit('init', { x: players[socket.id].x, z: players[socket.id].z });
        socket.emit('mapChange', currentMap);
        io.emit('updatePlayers', players);
    }

    // Движение игрока
    socket.on('playerMove', (data) => {
        if (players[socket.id] && players[socket.id].hp > 0 && !isMatchEnded) {
            players[socket.id].x = data.x;
            players[socket.id].z = data.z;
            players[socket.id].rotY = data.rotY;
            socket.broadcast.emit('updatePlayers', players);
        }
    });

    // --- ОБРАБОТКА ХЕДШОТОВ И УРОНА ---
    socket.on('playerHit', (data) => {
        const targetId = data.targetId;
        const zone = data.zone;

        if (players[targetId] && players[targetId].hp > 0 && !isMatchEnded) {
            if (zone === 'head') {
                players[targetId].hp = 0; // Мгновенная смерть при хедшоте
                console.log(`Игрок ${players[socket.id]?.nick} поставил хедшот ${players[targetId].nick}!`);
            } else {
                let damage = 25; // Обычное попадание в тело
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
                    // Проверка на победу в раунде
                    if (players[socket.id].kills >= matchKillsLimit && !isMatchEnded) {
                        endMatch();
                    }
                }
            }
            io.emit('updatePlayers', players);
        }
    });

    // Респавн игрока
    socket.on('requestRespawn', () => {
        if (players[socket.id] && players[socket.id].hp <= 0) {
            players[socket.id].hp = 100;
            players[socket.id].armor = 100;
            players[socket.id].x = (Math.random() - 0.5) * 30;
            players[socket.id].z = (Math.random() - 0.5) * 30;
            socket.emit('init', { x: players[socket.id].x, z: players[socket.id].z });
            io.emit('updatePlayers', players);
        }
    });

    // Голосование за следующую локацию
    socket.on('voteMap', (mapName) => {
        if (!votedPlayers.has(socket.id) && mapVotes[mapName] !== undefined) {
            mapVotes[mapName]++;
            votedPlayers.add(socket.id);
            io.emit('updateVotes', mapVotes);
        }
    });

    socket.on('disconnect', () => {
        console.log(`Отключился клиент: ${socket.id}`);
        delete players[socket.id];
        votedPlayers.delete(socket.id);
        io.emit('updatePlayers', players);
    });
});

function endMatch() {
    isMatchEnded = true;
    const leaderboard = Object.values(players)
        .sort((a, b) => b.kills - a.kills)
        .map(p => ({ id: p.id, nick: p.nick, kills: p.kills }));

    io.emit('matchEnd', { leaderboard });

    // Смена карты через 10 секунд
    setTimeout(() => {
        let winnerMap = 'arena';
        if (mapVotes.factory > mapVotes.arena && mapVotes.factory > mapVotes.city) winnerMap = 'factory';
        if (mapVotes.city > mapVotes.arena && mapVotes.city > mapVotes.factory) winnerMap = 'city';

        currentMap = winnerMap;
        isMatchEnded = false;
        mapVotes = { arena: 0, factory: 0, city: 0 };
        votedPlayers.clear();

        // Полный сброс параметров перед новым раундом
        Object.keys(players).forEach(id => {
            players[id].kills = 0;
            players[id].hp = 100;
            players[id].armor = 100;
            players[id].x = (Math.random() - 0.5) * 30;
            players[id].z = (Math.random() - 0.5) * 30;
        });

        io.emit('mapChange', currentMap);
        io.emit('updatePlayers', players);
    }, 10000);
}

http.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});
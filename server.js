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

// Хранилище игроков и зарегистрированных аккаунтов
let players = {};
let accounts = {}; // Простая база данных в оперативной памяти {nick: pass}

// Таймер матча (в секундах)
const MATCH_DURATION = 180; // 3 минуты
let timeLeft = MATCH_DURATION;

// Каждую секунду уменьшаем время матча и рассылаем всем игрокам
setInterval(() => {
    if (timeLeft > 0) {
        timeLeft--;
    } else {
        timeLeft = MATCH_DURATION; // Перезапуск матча, если время вышло
        resetMatch();
    }
    io.emit('timerUpdate', { timeLeft });
}, 1000);

function resetMatch() {
    // При перезапуске матча обнуляем убийства и возрождаем всех
    for (let id in players) {
        players[id].kills = 0;
        players[id].hp = 100;
        players[id].x = (Math.random() * 40) - 20;
        players[id].z = (Math.random() * 40) - 20;
        io.to(id).emit('init', { x: players[id].x, z: players[id].z });
    }
    io.emit('updatePlayers', players);
}

io.on('connection', (socket) => {
    console.log(`Пользователь подключился: ${socket.id}`);

    // Отправляем текущее время матча новому подключению
    socket.emit('timerUpdate', { timeLeft });

    // Обработка авторизации / регистрации
    socket.on('playerAuth', (data) => {
        const nick = data.nick ? data.nick.trim() : "";
        const pass = data.pass ? data.pass.trim() : "";

        if (nick.length < 2 || pass.length < 3) {
            socket.emit('authFailed', "Слишком короткий ник или пароль!");
            return;
        }

        // Проверяем, существует ли аккаунт
        if (accounts[nick]) {
            if (accounts[nick] !== pass) {
                socket.emit('authFailed', "Неверный пароль для этого ника!");
                return;
            }
        } else {
            // Если нет, регистрируем новый
            accounts[nick] = pass;
        }

        // Проверяем, не играет ли уже кто-то под этим ником
        for (let id in players) {
            if (players[id].nick === nick) {
                socket.emit('authFailed', "Этот игрок уже на арене!");
                return;
            }
        }

        // Успешный вход! Создаем объект игрока
        players[socket.id] = {
            id: socket.id,
            nick: nick,
            x: (Math.random() * 40) - 20,
            z: (Math.random() * 40) - 20,
            rotY: 0,
            hp: 100,
            kills: 0
        };

        socket.emit('authSuccess', { nick, pass });
        // Отправляем координаты для спавна
        socket.emit('init', { x: players[socket.id].x, z: players[socket.id].z });
        
        // Обновляем список игроков для всех
        io.emit('updatePlayers', players);
    });

    // Движение игрока
    socket.on('playerMove', (data) => {
        if (players[socket.id] && players[socket.id].hp > 0) {
            players[socket.id].x = data.x;
            players[socket.id].z = data.z;
            players[socket.id].rotY = data.rotY;
            
            // Рассылаем обновленные координаты (можно оптимизировать через socket.broadcast.emit)
            socket.broadcast.emit('updatePlayers', players);
        }
    });

    // Обработка попадания (стрельба)
    socket.on('playerHit', (data) => {
        const shooter = players[socket.id];
        const target = players[data.targetId];

        if (!shooter || shooter.hp <= 0 || !target || target.hp <= 0) return;

        // Считаем урон в зависимости от зоны попадания
        let damage = 20; // Обычное в тело
        if (data.zone === 'head') {
            damage = 100; // Ваншот в голову!
        }

        target.hp -= damage;

        if (target.hp <= 0) {
            target.hp = 0;
            shooter.kills++; // Начисляем фраг фрагеру
            console.log(`${shooter.nick} убил ${target.nick}`);
        }

        io.emit('updatePlayers', players);
    });

    // Запрос на возрождение (респавн)
    socket.on('requestRespawn', () => {
        if (players[socket.id] && players[socket.id].hp <= 0) {
            players[socket.id].hp = 100;
            players[socket.id].x = (Math.random() * 40) - 20;
            players[socket.id].z = (Math.random() * 40) - 20;
            
            socket.emit('init', { x: players[socket.id].x, z: players[socket.id].z });
            io.emit('updatePlayers', players);
        }
    });

    // ОБРАБОТКА ВЫХОДА И ОТКЛЮЧЕНИЯ
    // Этот блок сработает ВСЕГДА: и когда игрок нажмет "Выйти в меню" (socket.disconnect() на клиенте), 
    // и когда у него просто пропадет интернет или он закроет вкладку браузера.
    socket.on('disconnect', () => {
        if (players[socket.id]) {
            console.log(`Игрок ${players[socket.id].nick} покинул арену.`);
            delete players[socket.id]; // Удаляем данные игрока из памяти сервера
            io.emit('updatePlayers', players); // Говорим остальным убрать его модельку
        } else {
            console.log(`Неавторизованный сокет отключился: ${socket.id}`);
        }
    });
});

// Запуск сервера на Render (он сам подставит порт в process.env.PORT) или локально на 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер кибер-арены запущен на порту ${PORT}`);
});
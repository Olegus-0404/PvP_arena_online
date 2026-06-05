const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, { cors: { origin: "*" } });

let players = {};

io.on('connection', (socket) => {
    console.log('Игрок зашел: ' + socket.id);

    // Распределяем роли: первый зашедший — левый, второй — правый
    const isFirst = Object.keys(players).length === 0;
    players[socket.id] = {
        id: socket.id,
        x: isFirst ? 150 : 600,
        y: 300,
        hp: 100,
        color: isFirst ? '#00ffff' : '#ff0055',
        isAttacking: false
    };

    // Отправляем игроку его ID и начальное состояние комнат
    socket.emit('init', { myId: socket.id, players });
    // Всем остальным говорим, что зашел новый игрок
    socket.broadcast.emit('playerJoined', players[socket.id]);

    // Получаем движения от игрока
    socket.on('playerUpdate', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].isAttacking = data.isAttacking;

            // Рассылаем координаты другим игрокам
            socket.broadcast.emit('playerMoved', players[socket.id]);
        }
    });

    // Получаем сигнал о нанесении урона
    socket.on('hitEnemy', () => {
        let enemyId = Object.keys(players).find(id => id !== socket.id);
        if (enemyId && players[enemyId]) {
            players[enemyId].hp -= 10; // Отнимаем 10 единиц здоровья
            if (players[enemyId].hp <= 0) {
                players[enemyId].hp = 0; 
            }
            io.emit('hpUpdate', { id: enemyId, hp: players[enemyId].hp });
        }
    });

    // Если игрок вышел
    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
    });
});

// Настройка порта для Render
const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));

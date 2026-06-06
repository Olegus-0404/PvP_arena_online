const express = require('express');
const app = express();
const http = require('http').createServer(app);

// Подключаем Socket.io версии 4.7.2 с полной свободой для CORS
const io = require('socket.io')(http, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"],
    credentials: true
  }
});

let players = {};
let currentMap = "arena"; // Начальная карта
let gameTimeLeft = 180;   // 3 минуты на раунд
let isVotingMode = false;
let mapVotes = { arena: 0, maze: 0 };
let votedPlayers = new Set();

// Спавн-точки для карт
const spawnPoints = {
  arena: [
    { x: 0, z: 15 }, { x: 15, z: -15 }, { x: -15, z: -15 }, { x: 0, z: -20 }
  ],
  maze: [
    { x: -35, z: -35 }, { x: 35, z: 35 }, { x: -35, z: 35 }, { x: 35, z: -35 }
  ]
};

function getRandomSpawn() {
  const points = spawnPoints[currentMap] || spawnPoints.arena;
  const p = points[Math.floor(Math.random() * points.length)];
  return { x: p.x + (Math.random() * 2 - 1), z: p.z + (Math.random() * 2 - 1), map: currentMap };
}

// Таймер матча
setInterval(() => {
  if (gameTimeLeft > 0) {
    gameTimeLeft--;
    io.emit('timerUpdate', { timeLeft: gameTimeLeft, isVoting: isVotingMode });
  } else {
    if (!isVotingMode) {
      // Время вышло — запускаем голосование за карту
      isVotingMode = true;
      gameTimeLeft = 15; // 15 секунд на голосование
      mapVotes = { arena: 0, maze: 0 };
      votedPlayers.clear();
      io.emit('startVoting');
    } else {
      // Голосование завершено — считаем результаты
      isVotingMode = false;
      gameTimeLeft = 180; // Сброс на 3 минуты
      
      currentMap = mapVotes.maze > mapVotes.arena ? "maze" : "arena";
      io.emit('endVoting');

      // Респавним всех на новой карте
      for (let id in players) {
        players[id].hp = 100;
        players[id].armor = 100;
        let s = getRandomSpawn();
        players[id].x = s.x;
        players[id].z = s.z;
        io.to(id).emit('init', s);
      }
    }
  }
}, 1000);

io.on('connection', (socket) => {

  socket.on('playerAuth', (data) => {
    let nickname = (data.nick || "Игрок").substring(0, 14);
    
    players[socket.id] = {
      id: socket.id,
      nick: nickname,
      x: 0, z: 0, rotY: 0,
      hp: 100, armor: 100,
      kills: 0
    };

    socket.emit('authSuccess', { nick: nickname, pass: data.pass || "1234" });
    
    let spawn = getRandomSpawn();
    players[socket.id].x = spawn.x;
    players[socket.id].z = spawn.z;
    
    socket.emit('init', spawn);
  });

  socket.on('playerMove', (data) => {
    if (players[socket.id] && players[socket.id].hp > 0) {
      players[socket.id].x = data.x;
      players[socket.id].z = data.z;
      players[socket.id].rotY = data.rotY;
    }
  });

  // Фикс регистрации попаданий и урона
  socket.on('playerHit', (data) => {
    let shooter = players[socket.id];
    let target = players[data.targetId];

    if (!shooter || shooter.hp <= 0 || !target || target.hp <= 0) return;

    // Считаем урон: в голову 55, в тело 20
    let damage = data.zone === 'head' ? 55 : 20;

    // Просчет брони
    if (target.armor > 0) {
      let absorbed = Math.floor(damage * 0.4);
      target.armor = Math.max(0, target.armor - absorbed);
      target.hp -= (damage - absorbed);
    } else {
      target.hp -= damage;
    }

    // Отправляем таргету вспышку урона
    io.to(data.targetId).emit('damagedBy');

    if (target.hp <= 0) {
      target.hp = 0;
      shooter.kills++;
    }
  });

  socket.on('requestRespawn', () => {
    if (players[socket.id] && players[socket.id].hp <= 0) {
      players[socket.id].hp = 100;
      players[socket.id].armor = 100;
      socket.emit('init', getRandomSpawn());
    }
  });

  socket.on('submitVote', (mapName) => {
    if (isVotingMode && !votedPlayers.has(socket.id)) {
      if (mapVotes[mapName] !== undefined) {
        mapVotes[mapName]++;
        votedPlayers.add(socket.id);
        io.emit('votesUpdated', mapVotes);
      }
    }
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    votedPlayers.delete(socket.id);
  });
});

// Отправка позиций игроков 30 раз в секунду (тикрэйт)
setInterval(() => {
  io.emit('updatePlayers', players);
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Сервер пашет на порту ${PORT}`);
});
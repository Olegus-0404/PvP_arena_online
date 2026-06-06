const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: { origin: "*", methods: ["GET", "POST"], credentials: true }
});

let players = {};
let bots = {};
let gameState = {
  wave: 1,
  botsLeft: 0,
  waveActive: false,
  timerBeforeWave: 10, // Время на передышку между волнами (сек)
  isBreak: true
};

let botIdCounter = 0;

// Точки спавна для ботов
const botSpawnPoints = [
  {x: -20, z: -20}, {x: 20, z: -20}, {x: -20, z: 20}, {x: 20, z: 20},
  {x: 0, z: -30}, {x: 0, z: 30}, {x: -30, z: 0}, {x: 30, z: 0}
];

function startWave() {
  gameState.isBreak = false;
  gameState.waveActive = true;
  // Количество ботов зависит от номера волны и числа игроков
  let playerCount = Object.keys(players).length || 1;
  gameState.botsLeft = gameState.wave * 4 + playerCount * 2;
  
  bots = {};
  for (let i = 0; i < gameState.botsLeft; i++) {
    botIdCounter++;
    let spawn = botSpawnPoints[Math.floor(Math.random() * botSpawnPoints.length)];
    bots["bot_" + botIdCounter] = {
      id: "bot_" + botIdCounter,
      x: spawn.x + (Math.random() * 4 - 2),
      z: spawn.z + (Math.random() * 4 - 2),
      hp: 50 + gameState.wave * 10, // С каждой волной боты жирнее
      speed: 4 + Math.min(4, gameState.wave * 0.3) // И чуть быстрее
    };
  }
  io.emit('waveStarted', { wave: gameState.wave, bots: bots });
}

function nextWaveCountdown() {
  gameState.isBreak = true;
  gameState.waveActive = false;
  gameState.timerBeforeWave = 10;
  
  // Хилим и восполняем припасы всем выжившим игрокам в конце волны!
  for (let id in players) {
    if (players[id].hp > 0) {
      players[id].hp = 100;
      players[id].armor = 100;
    }
  }
  io.emit('waveCleared', { nextWaveIn: gameState.timerBeforeWave });
}

// Главный игровой цикл сервера (ИИ ботов и таймеры)
setInterval(() => {
  // Если передышка между волнами
  if (gameState.isBreak) {
    if (gameState.timerBeforeWave > 0) {
      gameState.timerBeforeWave--;
      io.emit('timerUpdate', { timeLeft: gameState.timerBeforeWave, isBreak: true, wave: gameState.wave });
    } else {
      startWave();
    }
  }

  // Если идет волна — двигаем ботов к ближайшему игроку
  if (gameState.waveActive) {
    let pIds = Object.keys(players).filter(id => players[id].hp > 0);
    
    if (pIds.length > 0) {
      for (let bId in bots) {
        let bot = bots[bId];
        // Находим ближайшего живого игрока
        let closestPlayer = null;
        let minDist = 9999;
        
        pIds.forEach(pId => {
          let p = players[pId];
          let dist = Math.sqrt((p.x - bot.x)**2 + (p.z - bot.z)**2);
          if (dist < minDist) { minDist = dist; closestPlayer = p; }
        });

        if (closestPlayer) {
          // Вычисляем вектор движения к игроку (упрощенно за 1 тик)
          let dx = closestPlayer.x - bot.x;
          let dz = closestPlayer.z - bot.z;
          let angle = Math.atan2(dx, dz);
          
          // Движение (учитываем тикрейт 30 раз в сек)
          bot.x += Math.sin(angle) * (bot.speed / 30);
          bot.z += Math.cos(angle) * (bot.speed / 30);
          bot.rotY = angle;

          // Если бот подошел вплотную — наносит урон игроку
          if (minDist < 1.2) {
            let targetPlayer = players[closestPlayer.id];
            if (targetPlayer && targetPlayer.hp > 0 && (!bot.lastAttack || Date.now() - bot.lastAttack > 1000)) {
              bot.lastAttack = Date.now();
              let dmg = 10 + gameState.wave * 2;
              if (targetPlayer.armor > 0) {
                targetPlayer.armor = Math.max(0, targetPlayer.armor - Math.floor(dmg * 0.4));
                targetPlayer.hp -= Math.floor(dmg * 0.6);
              } else {
                targetPlayer.hp -= dmg;
              }
              io.to(closestPlayer.id).emit('damagedBy', { shooterX: bot.x, shooterZ: bot.z });
            }
          }
        }
      }
    }
    io.emit('updateBots', bots);
    io.emit('timerUpdate', { timeLeft: Object.keys(bots).length, isBreak: false, wave: gameState.wave });
  }
}, 1000 / 30);

io.on('connection', (socket) => {
  socket.on('playerAuth', (data) => {
    let nickname = (data.nick || "Боец").substring(0, 14);
    players[socket.id] = { id: socket.id, nick: nickname, x: 0, z: 0, rotY: 0, hp: 100, armor: 100, kills: 0 };
    socket.emit('authSuccess', { nick: nickname, pass: data.pass || "1234" });
    socket.emit('init', { x: 0, z: 0, map: "arena" });
    // Синхронизируем текущее состояние волны для зашедшего
    socket.emit('syncWave', { wave: gameState.wave, isBreak: gameState.isBreak });
  });

  socket.on('playerMove', (data) => {
    if (players[socket.id] && players[socket.id].hp > 0) {
      players[socket.id].x = data.x; players[socket.id].z = data.z; players[socket.id].rotY = data.rotY;
    }
  });

  socket.on('playerHit', (data) => {
    let shooter = players[socket.id];
    if (!shooter || shooter.hp <= 0) return;

    // Проверяем попадание по БОТУ
    if (bots[data.targetId]) {
      let bot = bots[data.targetId];
      let damage = data.zone === 'head' ? 60 : 25;
      bot.hp -= damage;

      if (bot.hp <= 0) {
        delete bots[data.targetId];
        shooter.kills++;
        
        // Если ботов больше не осталось — запускаем отсчет следующей волны
        if (Object.keys(bots).length === 0) {
          gameState.wave++;
          nextWaveCountdown();
        }
      }
    }
  });

  socket.on('requestRespawn', () => {
    if (players[socket.id] && players[socket.id].hp <= 0) {
      players[socket.id].hp = 100; players[socket.id].armor = 100;
      socket.emit('init', { x: 0, z: 0 });
    }
  });

  socket.on('disconnect', () => { delete players[socket.id]; });
});

setInterval(() => { io.emit('updatePlayers', players); }, 1000 / 30);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log(`Coop сервер пашет на порту ${PORT}`); });
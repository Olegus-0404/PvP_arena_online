const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
  cors: { origin: "*", methods: ["GET", "POST"], credentials: true }
});

let players = {};
let bots = {};
let pvpMap = "arena";

// Состояние кооперативного режима
let coopState = {
  wave: 1,
  botsLeft: 0,
  waveActive: false,
  timerBeforeWave: 15, // Изменено на 15 секунд перерыва!
  isBreak: true
};

let skipVotes = new Set(); // ID игроков, проголосовавших за пропуск перерыва
let botIdCounter = 0;

const botSpawnPoints = [
  {x: -20, z: -20}, {x: 20, z: -20}, {x: -20, z: 20}, {x: 20, z: 20},
  {x: 0, z: -30}, {x: 0, z: 30}
];

function startWave() {
  coopState.isBreak = false;
  coopState.waveActive = true;
  skipVotes.clear();

  let coopPlayersCount = Object.values(players).filter(p => p.mode === 'coop' && p.hp > 0).length || 1;
  coopState.botsLeft = coopState.wave * 4 + coopPlayersCount * 2;
  
  bots = {};
  for (let i = 0; i < coopState.botsLeft; i++) {
    botIdCounter++;
    let spawn = botSpawnPoints[Math.floor(Math.random() * botSpawnPoints.length)];
    bots["bot_" + botIdCounter] = {
      id: "bot_" + botIdCounter,
      x: spawn.x + (Math.random() * 4 - 2),
      z: spawn.z + (Math.random() * 4 - 2),
      hp: 40 + coopState.wave * 12,
      speed: 4 + Math.min(4, coopState.wave * 0.3)
    };
  }
  // Отправляем инфу только игрокам в режиме coop
  io.to('mode_coop').emit('waveStarted', { wave: coopState.wave, bots: bots });
}

function nextWaveCountdown() {
  coopState.isBreak = true;
  coopState.waveActive = false;
  coopState.timerBeforeWave = 15; // 15 секунд перерыва
  skipVotes.clear();
  
  // Лечим всех живых кооп-игроков
  for (let id in players) {
    if (players[id].mode === 'coop' && players[id].hp > 0) {
      players[id].hp = 100;
      players[id].armor = 100;
    }
  }
  io.to('mode_coop').emit('waveCleared');
}

// Игровой тик сервера (30 раз в секунду)
setInterval(() => {
  // Логика Co-op режима
  if (coopState.isBreak) {
    // Если все кооп-игроки проголосовали за скип — сбрасываем таймер в 0
    let totalCoopPlayers = Object.values(players).filter(p => p.mode === 'coop').length;
    if (totalCoopPlayers > 0 && skipVotes.size >= totalCoopPlayers) {
      coopState.timerBeforeWave = 0;
    }
  }

  // Обновление физики ботов
  if (coopState.waveActive) {
    let aliveCoopPlayers = Object.values(players).filter(p => p.mode === 'coop' && p.hp > 0);
    
    if (aliveCoopPlayers.length > 0) {
      for (let bId in bots) {
        let bot = bots[bId];
        let closestPlayer = null;
        let minDist = 9999;
        
        aliveCoopPlayers.forEach(p => {
          let dist = Math.sqrt((p.x - bot.x)**2 + (p.z - bot.z)**2);
          if (dist < minDist) { minDist = dist; closestPlayer = p; }
        });

        if (closestPlayer) {
          let dx = closestPlayer.x - bot.x;
          let dz = closestPlayer.z - bot.z;
          let angle = Math.atan2(dx, dz);
          
          bot.x += Math.sin(angle) * (bot.speed / 30);
          bot.z += Math.cos(angle) * (bot.speed / 30);
          bot.rotY = angle;

          if (minDist < 1.2) {
            let targetPlayer = players[closestPlayer.id];
            if (targetPlayer && targetPlayer.hp > 0 && (!bot.lastAttack || Date.now() - bot.lastAttack > 1000)) {
              bot.lastAttack = Date.now();
              let dmg = 12 + coopState.wave * 2;
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
    io.to('mode_coop').emit('updateBots', bots);
  }
}, 1000 / 30);

// Ежесекундный таймер
setInterval(() => {
  if (coopState.isBreak) {
    if (coopState.timerBeforeWave > 0) {
      coopState.timerBeforeWave--;
    } else {
      startWave();
    }
  }
  // Рассылаем тики таймера в соответствующие комнаты
  let totalCoopVotes = skipVotes.size;
  io.to('mode_coop').emit('timerUpdate', { 
    timeLeft: coopState.isBreak ? coopState.timerBeforeWave : Object.keys(bots).length, 
    isBreak: coopState.isBreak, 
    wave: coopState.wave,
    votes: totalCoopVotes
  });
}, 1000);

io.on('connection', (socket) => {
  socket.on('playerAuth', (data) => {
    let nickname = (data.nick || "Боец").substring(0, 14);
    let chosenMode = data.mode === 'pvp' ? 'pvp' : 'coop';

    players[socket.id] = {
      id: socket.id,
      nick: nickname,
      mode: chosenMode,
      x: 0, z: 0, rotY: 0,
      hp: 100, armor: 100, kills: 0
    };

    // Закидываем сокет в комнату выбранного режима
    socket.join('mode_' + chosenMode);

    socket.emit('authSuccess', { nick: nickname, pass: data.pass || "1234", mode: chosenMode });
    
    // Спавн
    let spawn = chosenMode === 'pvp' ? { x: Math.random()*20-10, z: Math.random()*20-10, map: pvpMap } : { x: 0, z: 0, map: "arena" };
    socket.emit('init', spawn);
  });

  socket.on('playerMove', (data) => {
    if (players[socket.id] && players[socket.id].hp > 0) {
      players[socket.id].x = data.x;
      players[socket.id].z = data.z;
      players[socket.id].rotY = data.rotY;
    }
  });

  socket.on('skipBreakVote', () => {
    if (players[socket.id] && players[socket.id].mode === 'coop' && coopState.isBreak) {
      skipVotes.add(socket.id);
    }
  });

  socket.on('playerHit', (data) => {
    let shooter = players[socket.id];
    if (!shooter || shooter.hp <= 0) return;

    if (shooter.mode === 'coop') {
      // Стрельба по ботам в коопе
      if (bots[data.targetId]) {
        let bot = bots[data.targetId];
        bot.hp -= (data.zone === 'head' ? 60 : 25);
        if (bot.hp <= 0) {
          delete bots[data.targetId];
          shooter.kills++;
          if (Object.keys(bots).length === 0) {
            coopState.wave++;
            nextWaveCountdown();
          }
        }
      }
    } else {
      // Стрельба по игрокам в PvP режиме
      let target = players[data.targetId];
      if (target && target.hp > 0 && target.mode === 'pvp') {
        let damage = data.zone === 'head' ? 55 : 20;
        if (target.armor > 0) {
          let abs = Math.floor(damage * 0.4);
          target.armor = Math.max(0, target.armor - abs);
          target.hp -= (damage - abs);
        } else {
          target.hp -= damage;
        }
        io.to(data.targetId).emit('damagedBy', { shooterX: shooter.x, shooterZ: shooter.z });
        if (target.hp <= 0) { target.hp = 0; shooter.kills++; }
      }
    }
  });

  socket.on('requestRespawn', () => {
    if (players[socket.id] && players[socket.id].hp <= 0) {
      players[socket.id].hp = 100;
      players[socket.id].armor = 100;
      let spawn = players[socket.id].mode === 'pvp' ? { x: Math.random()*20-10, z: Math.random()*20-10 } : { x: 0, z: 0 };
      socket.emit('init', spawn);
    }
  });

  socket.on('disconnect', () => {
    delete players[socket.id];
    skipVotes.delete(socket.id);
  });
});

// Отдельная рассылка позиций игроков для каждой комнаты (чтобы режимы не видели друг друга)
setInterval(() => {
  let pvpPlayers = {};
  let coopPlayers = {};
  for(let id in players){
    if(players[id].mode === 'pvp') pvpPlayers[id] = players[id];
    else coopPlayers[id] = players[id];
  }
  io.to('mode_pvp').emit('updatePlayers', pvpPlayers);
  io.to('mode_coop').emit('updatePlayers', coopPlayers);
}, 1000 / 30);

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => { console.log(`Игровой сервер запущен на порту ${PORT}`); });
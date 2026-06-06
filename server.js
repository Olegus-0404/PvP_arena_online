const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

let currentMap = "arena"; 
let mapVotes = { arena: 0, maze: 0 };
let isVotingMode = false;
let votingTimeout = null;

class Player {
    constructor(id, nick) {
        this.id = id;
        this.nick = nick;
        this.hp = 100;
        this.armor = 100; 
        this.kills = 0;
        this.x = (Math.random() * 30) - 15;
        this.z = (Math.random() * 30) - 15;
        this.rotY = 0;
    }
    updatePosition(x, z, rotY) {
        if (this.hp > 0 && !isVotingMode) {
            this.x = x;
            this.z = z;
            this.rotY = rotY;
        }
    }
    takeDamage(zone) {
        if (this.hp <= 0 || isVotingMode) return false;
        
        let baseDamage = 20;
        let damage = (zone === 'head') ? Math.floor(baseDamage * 1.7) : baseDamage;
        
        if (this.armor > 0) {
            if (this.armor >= damage) {
                this.armor -= damage;
            } else {
                let remainingDamage = damage - this.armor;
                this.armor = 0;
                this.hp -= remainingDamage;
            }
        } else {
            this.hp -= damage;
        }

        if (this.hp < 0) this.hp = 0;
        return this.hp === 0; 
    }
    respawn() {
        this.hp = 100;
        this.armor = 100; 
        this.x = (Math.random() * 30) - 15;
        this.z = (Math.random() * 30) - 15;
        this.rotY = 0;
    }
}

let players = {};
let accounts = {}; 
const MATCH_DURATION = 180; 
let timeLeft = MATCH_DURATION;

setInterval(() => {
    if (isVotingMode) return;
    if (timeLeft > 0) {
        timeLeft--;
        io.emit('timerUpdate', { timeLeft, isVoting: false });
    } else {
        startMapVoting();
    }
}, 1000);

function startMapVoting() {
    isVotingMode = true;
    mapVotes = { arena: 0, maze: 0 };
    io.emit('startVoting', { maps: ['arena', 'maze'] });

    let voteTimeLeft = 10;
    let voteInterval = setInterval(() => {
        voteTimeLeft--;
        io.emit('timerUpdate', { timeLeft: voteTimeLeft, isVoting: true });
        if (voteTimeLeft <= 0) {
            clearInterval(voteInterval);
            endMapVoting();
        }
    }, 1000);
}

function endMapVoting() {
    isVotingMode = false;
    timeLeft = MATCH_DURATION;
    
    currentMap = (mapVotes.maze > mapVotes.arena) ? "maze" : "arena";
    
    for (let id in players) {
        if (players[id]) {
            players[id].kills = 0;
            players[id].respawn();
            io.to(id).emit('init', { x: players[id].x, z: players[id].z, map: currentMap });
        }
    }
    io.emit('endVoting', { winner: currentMap });
    io.emit('updatePlayers', players);
}

io.on('connection', (socket) => {
    socket.emit('timerUpdate', { timeLeft, isVoting: isVotingMode });
    if (isVotingMode) socket.emit('startVoting', { maps: ['arena', 'maze'] });

    socket.on('playerAuth', (data) => {
        try {
            if (!data) return;
            const nick = data.nick ? String(data.nick).trim() : "";
            const pass = data.pass ? String(data.pass).trim() : "";

            if (nick.length < 2 || pass.length < 3) {
                socket.emit('authFailed', "Слишком короткие данные!");
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
                if (players[id] && players[id].nick === nick) {
                    socket.emit('authFailed', "Ник уже в игре!");
                    return;
                }
            }

            players[socket.id] = new Player(socket.id, nick);
            
            socket.emit('authSuccess', { nick, pass });
            socket.emit('init', { x: players[socket.id].x, z: players[socket.id].z, map: currentMap });
            io.emit('updatePlayers', players);
        } catch (error) {
            socket.emit('authFailed', "Ошибка сервера.");
        }
    });

    socket.on('playerMove', (data) => {
        if (players[socket.id] && !isVotingMode) {
            players[socket.id].updatePosition(data.x, data.z, data.rotY);
            socket.broadcast.emit('updatePlayers', players);
        }
    });

    socket.on('submitVote', (mapName) => {
        if (isVotingMode && mapVotes[mapName] !== undefined) {
            mapVotes[mapName]++;
            io.emit('votesUpdated', mapVotes);
        }
    });

    socket.on('playerHit', (data) => {
        const shooter = players[socket.id];
        const target = players[data.targetId];
        if (!shooter || shooter.hp <= 0 || !target || target.hp <= 0 || isVotingMode) return;

        let isDead = target.takeDamage(data.zone);
        
        // Отправляем цели инфу о том, КТО в неё выстрелил, чтобы посчитать направление
        io.to(data.targetId).emit('damagedBy', { shooterX: shooter.x, shooterZ: shooter.z });

        if (isDead) {
            shooter.kills++;
        }
        io.emit('updatePlayers', players);
    });

    socket.on('requestRespawn', () => {
        if (players[socket.id] && players[socket.id].hp <= 0 && !isVotingMode) {
            players[socket.id].respawn();
            socket.emit('init', { x: players[socket.id].x, z: players[socket.id].z, map: currentMap });
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
server.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
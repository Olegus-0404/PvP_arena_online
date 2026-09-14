// ============================================================================
// NETWORK: socket.io — имена событий сверены с server.js
// ============================================================================

function connectToServer() {
    if (typeof io === 'undefined') return;
    const G = window.Game;

    G.socket = io(G.SERVER_URL, {
        transports: ['polling', 'websocket'],
        query: { nick: G.myNick, mode: G.currentGameMode, lobby: G.currentLobby }
    });

    G.socket.on('connect', () => { G.myId = G.socket.id; });

    G.socket.on('authSuccess', (data) => {
        G.currentGameMode = data.mode || G.currentGameMode;
    });

    G.socket.on('init', (spawnPos) => {
        if (G.yawObject) {
            G.yawObject.position.set(spawnPos.x || 0, 3.5, spawnPos.z || 30);
            G.playerVelocity.set(0, 0, 0);
        }
        G.hp = 100; G.armor = 100;
        updateHUD();
    });

    G.socket.on('playerState', (data) => {
        G.hp = Math.max(0, data.hp);
        G.armor = Math.max(0, data.armor ?? G.armor);
        G.kills = data.kills ?? G.kills;
        updateHUD();
        if (G.hp <= 0) showRespawnScreen();
    });

    G.socket.on('killfeed', (data) => {
        if (typeof window.showKillfeed === 'function') {
            window.showKillfeed(data.killer, data.weapon, data.victim);
        }
    });

    G.socket.on('damagedBy', () => {
        flashDamage();
    });

    G.socket.on('updatePlayers', (players) => {
        G.otherPlayers = players;
        if (typeof syncOtherPlayers === 'function') syncOtherPlayers(players);
    });

    G.socket.on('chatMessage', (data) => {
        const log = document.getElementById('chat-log');
        if (log) {
            const line = document.createElement('div');
            line.textContent = `${data.nick}: ${data.msg}`;
            log.appendChild(line);
            log.scrollTop = log.scrollHeight;
        }
    });
}

// Сервер ждёт позицию в 'playerMove' — раньше клиент её не отправлял вообще.
function sendPositionUpdate(now) {
    const G = window.Game;
    if (!G.socket || !G.socket.connected) return;
    if (now - G.lastMoveSentAt < 50) return; // ~20 раз/сек
    G.lastMoveSentAt = now;
    G.socket.emit('playerMove', {
        x: G.yawObject.position.x,
        z: G.yawObject.position.z,
        rotY: G.yawObject.rotation.y
    });
}
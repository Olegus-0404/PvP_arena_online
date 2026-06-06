// ВСТАВЬ СЮДА СВОЙ URL ИЗ ПАНЕЛИ RENDER (ОБЯЗАТЕЛЬНО БЕЗ СЛЭША НА КОНЦЕ!)
const SERVER_URL = "https://pvp-arena-online.onrender.com"; 
let socket = null;

let myId = null, myNick = "", myPass = "", currentGameMode = "coop";
let hp = 100, armor = 100, ammo = 30, reserveAmmo = 120, kills = 0, isReloading = false;

let scene, camera, renderer, weaponMesh;
let yawObject = new THREE.Object3D(), pitchObject = new THREE.Object3D();
let remotePlayers = {}, remoteBots = {}, mapObjects = [];
let moveDirection = { forward: 0, right: 0 };
let playerVelocity = new THREE.Vector3();
let isGrounded = true;

const GRAVITY = 28; const JUMP_FORCE = 11; let moveSpeed = 14;
let colliders = [];

let joystickTouchId = null, lookTouchId = null;
let lastLookX = 0, lastLookY = 0;
let fireIntervalId = null;
let isCrouching = false, isCustomizing = false;

let lastRadarPingTime = 0;
const RADAR_PING_INTERVAL = 2500;

window.gameSettings = { sensitivity: 0.0035, hudScale: 1.0 };

window.selectGameMode = function(mode) {
    currentGameMode = mode;
    document.getElementById('mode-coop-select').classList.toggle('active', mode === 'coop');
    document.getElementById('mode-pvp-select').classList.toggle('active', mode === 'pvp');
};

function createCharacterLabel(text, hp, armor, isEnemy) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 110; 
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!isEnemy) {
        ctx.fillStyle = '#38bdf8'; 
        ctx.beginPath(); ctx.moveTo(128, 5); ctx.lineTo(118, 20); ctx.lineTo(138, 20); ctx.closePath(); ctx.fill();
    }

    const textY = isEnemy ? 24 : 45;
    const barY = isEnemy ? 34 : 55;
    const armorY = isEnemy ? 56 : 77;

    ctx.font = 'Bold 22px sans-serif';
    ctx.fillStyle = isEnemy ? '#ef4444' : '#ffffff';
    ctx.textAlign = 'center'; ctx.fillText(text, 128, textY);

    const barX = 28; const barW = 200;

    ctx.fillStyle = '#1e293b'; ctx.fillRect(barX, barY, barW, 18);
    ctx.fillStyle = '#10b981'; let hpPercent = Math.max(0, Math.min(100, hp)) / 100; ctx.fillRect(barX, barY, barW * hpPercent, 18);

    ctx.font = 'Bold 13px sans-serif'; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
    ctx.fillText(`${Math.max(0, hp)} HP`, 128, barY + 14);

    ctx.fillStyle = '#1e293b'; ctx.fillRect(barX, armorY, barW, 8);
    ctx.fillStyle = '#3b82f6'; let armorPercent = Math.max(0, Math.min(100, armor)) / 100; ctx.fillRect(barX, armorY, barW * armorPercent, 8);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ 
        map: texture,
        depthTest: isEnemy ? true : false,
        depthWrite: isEnemy ? true : false,
        transparent: true
    });
    
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.5, 0.644, 1); 
    return sprite;
}

function initSocket() {
    const statusText = document.getElementById('auth-status');
    const authBtn = document.getElementById('btn-auth');

    if(statusText) statusText.innerText = "Стучимся в WebSocket-туннель...";
    if(authBtn) { authBtn.disabled = true; authBtn.style.background = '#475569'; authBtn.innerText = "ПИНГУЕМ СЕРВЕР..."; }

    socket = io(SERVER_URL, {
        transports: ['websocket'],
        upgrade: false,
        forceNew: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 2000
    });

    socket.on('connect', () => { 
        if(statusText) statusText.innerText = "Сервер онлайн! Входите в бой."; 
        if(authBtn) { authBtn.disabled = false; authBtn.style.background = '#ec4899'; authBtn.innerText = "ПОДКЛЮЧИТЬСЯ"; }
    });

    socket.on('connect_error', () => {
        if(statusText) statusText.innerText = "Сервер спит (загрузка Render ~1 мин)...";
    });
    
    socket.on('authSuccess', (data) => { 
        localStorage.setItem('n', data.nick); localStorage.setItem('p', data.pass);
        currentGameMode = data.mode;
        document.getElementById('auth-screen').style.display = 'none'; 
        myId = socket.id; 
    });
    
    socket.on('init', (spawnPos) => { 
        if (yawObject) yawObject.position.set(spawnPos.x, 1.7, spawnPos.z);
        hp = 100; armor = 100; ammo = 30; reserveAmmo = 120; updateHUD(); 
        document.getElementById('respawn-screen').style.display = 'none'; 
        if(spawnPos.map) buildMap(spawnPos.map);
    });
    
    socket.on('timerUpdate', (data) => { 
        const timerText = document.getElementById('val-timer');
        const skipBtn = document.getElementById('btn-skip-break');
        if (!timerText) return;

        if (currentGameMode === 'coop') {
            if (data.isBreak) {
                timerText.innerHTML = `ПЕРЕРЫВ<br>${data.timeLeft}с`;
                if(skipBtn) { skipBtn.style.display = 'block'; document.getElementById('skip-votes-count').innerText = data.votes || 0; }
            } else {
                timerText.innerHTML = `ВОЛНА ${data.wave}<br>БОТОВ: ${data.timeLeft}`;
                if(skipBtn) skipBtn.style.display = 'none';
            }
        } else {
            timerText.innerHTML = `МАТЧ (PvP)<br>ИГРА ИДЕТ`;
            if(skipBtn) skipBtn.style.display = 'none';
        }
    });

    socket.on('waveCleared', () => { stopAutofire(); hp = 100; armor = 100; reserveAmmo = 120; updateHUD(); });
    socket.on('damagedBy', (data) => { triggerDamageFlash(); if (data && data.shooterX !== undefined) createDamageArrow(data.shooterX, data.shooterZ); });

    socket.on('updatePlayers', (serverPlayers) => {
        if (!scene) return;
        if (myId && serverPlayers[myId]) {
            kills = serverPlayers[myId].kills;
            let oldHp = hp; hp = serverPlayers[myId].hp; armor = serverPlayers[myId].armor;
            if (hp <= 0 && oldHp > 0) { stopAutofire(); document.getElementById('respawn-screen').style.display = 'flex'; }
            updateHUD();
        }
        
        for (let id in serverPlayers) {
            if (id === socket.id) continue;
            let pData = serverPlayers[id];
            let isEnemyPlayer = (currentGameMode === 'pvp');
            
            if (!remotePlayers[id] && pData.hp > 0) {
                let group = new THREE.Group();
                let color = isEnemyPlayer ? 0xff0055 : 0x3b82f6;
                let torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.4), new THREE.MeshStandardMaterial({ color: color }));
                torso.position.y = 0.9; torso.userData = { targetId: id, zone: 'body' }; group.add(torso);
                let head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }));
                head.position.y = 1.5; head.userData = { targetId: id, zone: 'head' }; group.add(head);

                let label = createCharacterLabel(pData.nick, pData.hp, pData.armor, isEnemyPlayer);
                label.position.y = 2.2; label.name = "player_label"; group.add(label);
                scene.add(group); remotePlayers[id] = group;
            }
            if (remotePlayers[id]) {
                if (pData.hp <= 0) { scene.remove(remotePlayers[id]); delete remotePlayers[id]; } 
                else { 
                    remotePlayers[id].position.set(pData.x, 0, pData.z); remotePlayers[id].rotation.y = pData.rotY;
                    let oldLabel = remotePlayers[id].getObjectByName("player_label"); if (oldLabel) remotePlayers[id].remove(oldLabel);
                    let newLabel = createCharacterLabel(pData.nick, pData.hp, pData.armor, isEnemyPlayer);
                    newLabel.position.y = 2.2; newLabel.name = "player_label"; remotePlayers[id].add(newLabel);
                }
            }
        }
        updateMinimap(serverPlayers, remoteBots);
    });

    socket.on('updateBots', (serverBots) => {
        if (!scene || currentGameMode !== 'coop') return;
        for (let id in serverBots) {
            let bData = serverBots[id];
            if (!remoteBots[id]) {
                let group = new THREE.Group();
                let torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.4), new THREE.MeshStandardMaterial({ color: 0xef4444 }));
                torso.position.y = 0.9; torso.userData = { targetId: id, zone: 'body' }; group.add(torso);
                let head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), new THREE.MeshStandardMaterial({ color: 0x10b981 }));
                head.position.y = 1.5; head.userData = { targetId: id, zone: 'head' }; group.add(head);

                let label = createCharacterLabel("ЗОМБИ БОТ", bData.hp, 0, true);
                label.position.y = 2.0; label.name = "bot_label"; group.add(label);
                scene.add(group); remoteBots[id] = group;
            }
            if (remoteBots[id]) {
                remoteBots[id].position.set(bData.x, 0, bData.z); remoteBots[id].rotation.y = bData.rotY;
                let oldLabel = remoteBots[id].getObjectByName("bot_label"); if (oldLabel) remoteBots[id].remove(oldLabel);
                let newLabel = createCharacterLabel("ЗОМБИ БОТ", bData.hp, 0, true);
                newLabel.position.y = 2.0; newLabel.name = "bot_label"; remoteBots[id].add(newLabel);
            }
        }
        for (let id in remoteBots) { if (!serverBots[id]) { scene.remove(remoteBots[id]); delete remoteBots[id]; } }
    });
}

function updateMinimap(serverPlayers, currentBots) {
    const radar = document.getElementById('minimap-radar'); if (!radar || !yawObject) return;
    document.querySelectorAll('.radar-dot:not(.dot-me)').forEach(el => el.remove());
    const radarRadius = 55; const mapScale = 1.6;
    let myX = yawObject.position.x; let myZ = yawObject.position.z; let myRot = yawObject.rotation.y;
    let doEnemyPing = false; if (Date.now() - lastRadarPingTime > RADAR_PING_INTERVAL) { doEnemyPing = true; lastRadarPingTime = Date.now(); }

    for (let id in serverPlayers) {
        if (id === socket.id || serverPlayers[id].hp <= 0) continue;
        let className = currentGameMode === 'pvp' ? 'dot-enemy' : 'dot-teammate';
        let dot = createRadarDot(serverPlayers[id].x, serverPlayers[id].z, myX, myZ, myRot, radarRadius, mapScale, className, radar);
        if(dot && currentGameMode === 'pvp') { dot.style.opacity = '1'; setTimeout(() => { if(dot) dot.style.opacity = '0'; }, 1800); }
    }
    if (currentGameMode === 'coop') {
        for (let id in currentBots) {
            let botPos = currentBots[id].position;
            let dot = createRadarDot(botPos.x, botPos.z, myX, myZ, myRot, radarRadius, mapScale, 'dot-enemy', radar);
            if (dot && doEnemyPing) { dot.style.opacity = '1'; setTimeout(() => { if(dot) dot.style.opacity = '0'; }, 1800); }
        }
    }
}

function createRadarDot(objX, objZ, myX, myZ, myRot, radarRadius, mapScale, className, radarContainer) {
    let dx = objX - myX, dz = objZ - myZ;
    let rotX = dx * Math.cos(-myRot) - dz * Math.sin(-myRot); let rotY = dx * Math.sin(-myRot) + dz * Math.cos(-myRot);
    let pixelX = radarRadius + rotX * mapScale, pixelY = radarRadius + rotY * mapScale;
    let dist = Math.sqrt((pixelX - radarRadius)**2 + (pixelY - radarRadius)**2);
    if (dist < radarRadius - 4) {
        let dot = document.createElement('div'); dot.className = `radar-dot ${className}`;
        dot.style.position = 'absolute'; dot.style.width = '4px'; dot.style.height = '4px'; dot.style.borderRadius = '50%';
        if(className==='dot-teammate') dot.style.background = '#3b82f6'; else dot.style.background = '#ef4444';
        dot.style.left = pixelX + 'px'; dot.style.top = pixelY + 'px';
        radarContainer.appendChild(dot); return dot;
    }
    return null;
}

function triggerDamageFlash() { let flash = document.getElementById('damage-flash'); if (flash) { flash.style.opacity = '0.4'; setTimeout(() => flash.style.opacity = '0', 150); } }

function createDamageArrow(shooterX, shooterZ) {
    const container = document.getElementById('damage-indicators-container'); if (!container || !yawObject) return;
    const arrow = document.createElement('div'); arrow.className = 'damage-arrow'; arrow.style.position = 'absolute'; arrow.style.width = '0'; arrow.style.height = '0'; arrow.style.borderLeft = '8px solid transparent'; arrow.style.borderRight = '8px solid transparent'; arrow.style.borderBottom = '20px solid #ef4444'; container.appendChild(arrow);
    function updateArrow() {
        if (!arrow.parentNode) return;
        let angle = Math.atan2(shooterX - yawObject.position.x, shooterZ - yawObject.position.z);
        let finalAngle = angle - yawObject.rotation.y + Math.PI;
        arrow.style.transform = `translate(-50%, -50%) translate(${Math.sin(finalAngle)*70}px, ${Math.cos(finalAngle)*70}px) rotate(${-finalAngle}rad)`;
    }
    let interval = setInterval(updateArrow, 16); updateArrow();
    setTimeout(() => { arrow.style.opacity = '0'; setTimeout(() => { clearInterval(interval); arrow.remove(); }, 800); }, 800);
}

window.addEventListener('DOMContentLoaded', () => {
    initEngine(); initSocket(); setupControls(); loadHUDPositions();
    let savedScale = localStorage.getItem('game_hud_scale');
    if (savedScale) { window.gameSettings.hudScale = parseFloat(savedScale); document.getElementById('scale-slider').value = savedScale; applyHUDScale(savedScale); }
    if(localStorage.getItem('n') && localStorage.getItem('p')) {
        document.getElementById('input-nick').value = localStorage.getItem('n'); document.getElementById('input-pass').value = localStorage.getItem('p');
    }
});

function applyHUDScale(scale) { document.getElementById('hud-scalable-wrapper').style.transform = `scale(${scale})`; }

function initEngine() {
    const container = document.getElementById('canvas-container'); if (!container) return;
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x05070f); scene.fog = new THREE.FogExp2(0x05070f, 0.02);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    pitchObject.add(camera); yawObject.add(pitchObject); scene.add(yawObject);
    renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    let dirLight = new THREE.DirectionalLight(0x38bdf8, 0.7); dirLight.position.set(10, 30, 10); scene.add(dirLight);
    buildMap(); createWeapon(); animate();
}

function createWeapon() {
    if (!camera) return;
    let weaponGroup = new THREE.Group();
    let barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5), new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness:0.7 })); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0, -0.25); weaponGroup.add(barrel);
    weaponGroup.position.set(0.2, -0.18, -0.4); camera.add(weaponGroup); weaponMesh = weaponGroup;
}

function buildMap() {
    mapObjects.forEach(obj => scene.remove(obj)); mapObjects = []; colliders = [];
    let floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x0f172a })); floor.rotation.x = -Math.PI / 2; scene.add(floor); mapObjects.push(floor);
    let grid = new THREE.GridHelper(80, 40, 0x1e40af, 0x1e293b); grid.position.y = 0.01; scene.add(grid); mapObjects.push(grid);
    createObstacle(0, 3, -40, 80, 6, 2, 0x1e293b); createObstacle(0, 3, 40, 80, 6, 2, 0x1e293b);
    createObstacle(-40, 3, 0, 2, 6, 80, 0x1e293b); createObstacle(40, 3, 0, 2, 6, 80, 0x1e293b);
    createObstacle(-10, 2, -10, 4, 4, 4, 0x334155); createObstacle(10, 2, 10, 4, 4, 4, 0x334155);
}

function createObstacle(x, y, z, w, h, d, color) {
    let mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: color })); mesh.position.set(x, y, z); scene.add(mesh); mapObjects.push(mesh); colliders.push(new THREE.Box3().setFromObject(mesh));
}

function checkWallCollisions(newPos) {
    let pr = 0.4;
    let playerBox = new THREE.Box3(new THREE.Vector3(newPos.x - pr, newPos.y - 1.6, newPos.z - pr), new THREE.Vector3(newPos.x + pr, newPos.y + 0.2, newPos.z + pr));
    for (let i = 0; i < colliders.length; i++) { if (playerBox.intersectsBox(colliders[i])) return true; }
    return false;
}

document.getElementById('btn-auth').addEventListener('click', () => {
    let nickname = document.getElementById('input-nick').value.trim(); let password = document.getElementById('input-pass').value.trim();
    if(nickname.length < 2 || !socket || !socket.connected) return;
    myNick = nickname; myPass = password;
    socket.emit('playerAuth', { nick: nickname, pass: password, mode: currentGameMode });
});

function performShot() {
    if (isReloading || hp <= 0 || !myId || isCustomizing) return;
    if (ammo <= 0) { stopAutofire(); startReload(); return; }
    ammo--; updateHUD();
    if(weaponMesh) { weaponMesh.position.z = -0.33; setTimeout(() => weaponMesh.position.z = -0.4, 40); }
    let raycaster = new THREE.Raycaster(); raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    let targets = [];
    if (currentGameMode === 'coop') { for (let id in remoteBots) { targets.push(...remoteBots[id].children); } } 
    else { for (let id in remotePlayers) { targets.push(...remotePlayers[id].children); } }
    
    let intersects = raycaster.intersectObjects(targets);
    if (intersects.length > 0 && socket) {
        let hitObj = intersects[0].object;
        if (hitObj.userData && hitObj.userData.targetId) { socket.emit('playerHit', { targetId: hitObj.userData.targetId, zone: hitObj.userData.zone }); }
    }
}

function startAutofire() { if (fireIntervalId !== null) return; performShot(); fireIntervalId = setInterval(performShot, 110); }
function stopAutofire() { if (fireIntervalId !== null) { clearInterval(fireIntervalId); fireIntervalId = null; } }

function startReload() {
    if (isReloading || ammo === 30 || reserveAmmo <= 0) return;
    isReloading = true; updateHUD();
    setTimeout(() => { let needed = 30 - ammo; let transfer = Math.min(needed, reserveAmmo); ammo += transfer; reserveAmmo -= transfer; isReloading = false; updateHUD(); }, 1200);
}

function updateHUD() {
    if(document.getElementById('val-hp')) document.getElementById('val-hp').innerText = hp;
    if(document.getElementById('val-armor')) document.getElementById('val-armor').innerText = armor;
    if(document.getElementById('val-ammo')) document.getElementById('val-ammo').innerText = isReloading ? `RELOAD...` : `${ammo} / ${reserveAmmo}`;
    if(document.getElementById('val-kills')) document.getElementById('val-kills').innerText = kills;
}

document.getElementById('btn-respawn').addEventListener('click', () => { if(socket) socket.emit('requestRespawn'); });
document.getElementById('btn-skip-break').addEventListener('click', () => { if(socket && socket.connected) socket.emit('skipBreakVote'); });

function setupControls() {
    const jZone = document.getElementById('joystick-zone'), stick = document.getElementById('joystick-stick');
    const menuTrigger = document.getElementById('btn-menu-trigger'), customMenu = document.getElementById('customizer-menu');

    document.getElementById('scale-slider').addEventListener('input', (e) => {
        let val = e.target.value; window.gameSettings.hudScale = parseFloat(val); applyHUDScale(val); localStorage.setItem('game_hud_scale', val);
    });

    menuTrigger.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation(); if (isCustomizing) return; 
        isCustomizing = true; stopAutofire(); 
        document.getElementById('menu-user-nick').innerText = myNick || "Боец";
        const modeBadge = document.getElementById('menu-user-mode');
        if (currentGameMode === 'coop') { modeBadge.innerText = "РЕЖИМ: ЗАЧИСТКА ВОЛН"; modeBadge.style.color = "#10b981"; } 
        else { modeBadge.innerText = "РЕЖИМ: КОМАНДНЫЙ БОЙ"; modeBadge.style.color = "#ef4444"; }
        document.body.classList.add('edit-mode'); customMenu.style.display = 'block';
    });

    document.getElementById('btn-save-hud').addEventListener('click', () => { isCustomizing = false; document.body.classList.remove('edit-mode'); customMenu.style.display = 'none'; saveHUDPositions(); });

    // ИСПРАВЛЕННЫЙ ВАРИАНТ: ТЕПЕРЬ НА ТАЧЕ (TOUCHSTART) ДЛЯ МОМЕНТАЛЬНОГО ОБХОДА БЛОКИРОВОК СМАРТФОНОВ
    document.getElementById('btn-fullscreen-toggle').addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const docEl = document.documentElement;
        const isFullscreen = document.fullscreenElement || 
                             document.webkitFullscreenElement || 
                             document.mozFullScreenElement || 
                             document.msFullscreenElement;

        if (!isFullscreen) {
            if (docEl.requestFullscreen) {
                docEl.requestFullscreen().catch(err => console.log(err));
            } else if (docEl.webkitRequestFullscreen) {
                docEl.webkitRequestFullscreen();
            } else if (docEl.mozRequestFullScreen) {
                docEl.mozRequestFullScreen();
            } else if (docEl.msRequestFullscreen) {
                docEl.msRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            } else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            } else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
        
        setTimeout(() => {
            if (camera && renderer) {
                camera.aspect = window.innerWidth / window.innerHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(window.innerWidth, window.innerHeight);
            }
        }, 300);
    }, { passive: false });

    document.getElementById('btn-menu-switch-coop').addEventListener('click', () => {
        if(currentGameMode === 'coop') return;
        isCustomizing = false; document.body.classList.remove('edit-mode'); customMenu.style.display = 'none';
        currentGameMode = 'coop'; if (socket && socket.connected) socket.emit('playerAuth', { nick: myNick, pass: myPass, mode: 'coop' });
    });

    document.getElementById('btn-menu-switch-pvp').addEventListener('click', () => {
        if(currentGameMode === 'pvp') return;
        isCustomizing = false; document.body.classList.remove('edit-mode'); customMenu.style.display = 'none';
        currentGameMode = 'pvp'; if (socket && socket.connected) socket.emit('playerAuth', { nick: myNick, pass: myPass, mode: 'pvp' });
    });

    document.getElementById('btn-logout').addEventListener('click', () => {
        isCustomizing = false; document.body.classList.remove('edit-mode'); customMenu.style.display = 'none';
        document.getElementById('auth-screen').style.display = 'flex'; if(socket) socket.disconnect();
        setTimeout(initSocket, 500);
    });

    document.getElementById('btn-fire').addEventListener('touchstart', (e) => { if(!isCustomizing){ e.preventDefault(); startAutofire(); } });
    document.getElementById('btn-fire').addEventListener('touchend', (e) => { if(!isCustomizing){ e.preventDefault(); stopAutofire(); } });
    document.getElementById('btn-reload').addEventListener('touchstart', (e) => { if(!isCustomizing){ e.preventDefault(); startReload(); } });
    document.getElementById('btn-jump').addEventListener('touchstart', (e) => { if(!isCustomizing){ e.preventDefault(); if(isGrounded) playerVelocity.y = JUMP_FORCE; } });
    document.getElementById('btn-crouch').addEventListener('touchstart', (e) => { 
        if(!isCustomizing){ e.preventDefault(); isCrouching = !isCrouching; moveSpeed = isCrouching ? 6 : 14; document.getElementById('btn-crouch').style.backgroundColor = isCrouching ? "rgba(59, 130, 246, 0.6)" : "rgba(30, 58, 138, 0.3)"; }
    });

    jZone.addEventListener('touchstart', (e) => { if(!isCustomizing){ e.stopPropagation(); let t = e.targetTouches[0]; joystickTouchId = t.identifier; updateJoystick(t); } });
    jZone.addEventListener('touchmove', (e) => { if(!isCustomizing){ e.stopPropagation(); for(let t of e.touches) { if(t.identifier === joystickTouchId) updateJoystick(t); } } });
    jZone.addEventListener('touchend', () => { if(!isCustomizing){ joystickTouchId = null; stick.style.transform = `translate(0px, 0px)`; moveDirection.forward = 0; moveDirection.right = 0; } });

    function updateJoystick(touch) {
        let rect = jZone.getBoundingClientRect(); let dx = touch.clientX - (rect.left + rect.width / 2), dy = touch.clientY - (rect.top + rect.height / 2);
        let dist = Math.sqrt(dx*dx + dy*dy); if (dist > 40) { dx = (dx / dist) * 40; dy = (dy / dist) * 40; }
        stick.style.transform = `translate(${dx}px, ${dy}px)`; moveDirection.forward = -(dy / 40); moveDirection.right = (dx / 40);
    }

    window.addEventListener('touchstart', (e) => {
        if (isCustomizing || e.target.closest('#customizer-menu') || e.target.closest('.overlay')) return;
        for(let t of e.changedTouches) { if(lookTouchId === null) { lookTouchId = t.identifier; lastLookX = t.clientX; lastLookY = t.clientY; } }
    });
    window.addEventListener('touchmove', (e) => {
        if (isCustomizing) return;
        for(let t of e.changedTouches) {
            if(t.identifier === lookTouchId) {
                let dx = t.clientX - lastLookX, dy = t.clientY - lastLookY; let sens = window.gameSettings.sensitivity;
                yawObject.rotation.y -= dx * sens; pitchObject.rotation.x -= dy * sens;
                pitchObject.rotation.x = Math.max(-Math.PI/2.2, Math.min(Math.PI/2.2, pitchObject.rotation.x));
                lastLookX = t.clientX; lastLookY = t.clientY;
            }
        }
    });
    window.addEventListener('touchend', (e) => { for(let t of e.changedTouches) { if(t.identifier === lookTouchId) lookTouchId = null; } });

    let dragElement = null, dragOffsetX = 0, dragOffsetY = 0;
    document.querySelectorAll('.hud-element').forEach(el => {
        el.addEventListener('touchstart', (e) => {
            if (!isCustomizing || el.id === "btn-menu-trigger") return; 
            dragElement = el; let touch = e.touches[0]; let rect = el.getBoundingClientRect();
            dragOffsetX = touch.clientX - rect.left; dragOffsetY = touch.clientY - rect.top; el.style.transform = "none";
        });
    });
    window.addEventListener('touchmove', (e) => {
        if (!isCustomizing || !dragElement) return;
        let touch = e.touches[0]; let x = (touch.clientX - dragOffsetX) / window.gameSettings.hudScale; let y = (touch.clientY - dragOffsetY) / window.gameSettings.hudScale;
        dragElement.style.left = x + 'px'; dragElement.style.top = y + 'px'; dragElement.style.bottom = 'auto'; dragElement.style.right = 'auto';
    });
    window.addEventListener('touchend', () => { dragElement = null; });
}

function saveHUDPositions() { let layout = {}; document.querySelectorAll('.hud-element').forEach(el => { layout[el.id] = { left: el.style.left, top: el.style.top }; }); localStorage.setItem('hud_layout_universal', JSON.stringify(layout)); }
function loadHUDPositions() {
    let saved = localStorage.getItem('hud_layout_universal'); if (!saved) return;
    let layout = JSON.parse(saved);
    for (let id in layout) { let el = document.getElementById(id); if (el && layout[id].left) { el.style.left = layout[id].left; el.
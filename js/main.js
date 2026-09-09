// ============================================================================
// GAME CLIENT CORE: WebGL Mobile FPS (Zone Survival & PvP Arena)
// Карта ЧАЭС из графа + Режим "Выживание без зомби"
// ============================================================================

const SERVER_URL = "https://pvp-arena-online.onrender.com"; 
let socket = null;

let myId = null, myNick = "", myPass = "", currentGameMode = "survival"; // Режим по умолчанию: Выживание
let hp = 100, armor = 100, ammo = 30, reserveAmmo = 120, kills = 0, isReloading = false;

let scene, camera, renderer, weaponMesh;
let yawObject = new THREE.Object3D(), pitchObject = new THREE.Object3D();
let remotePlayers = {}, remoteBots = {}, mapObjects = [];
let moveDirection = { forward: 0, right: 0 };
let playerVelocity = new THREE.Vector3();
let isGrounded = true;

const GRAVITY = 38;      
const JUMP_FORCE = 8.5;  
let moveSpeed = 5.5;     
let crouchSpeed = 1.8;   

let colliders = [];
let lootItems = []; 

let joystickTouchId = null, lookTouchId = null;
let lastLookX = 0, lastLookY = 0;
let fireIntervalId = null;
let isCrouching = false, isCustomizing = false;

let lastRadarPingTime = 0;
const RADAR_PING_INTERVAL = 2500;

window.gameSettings = { sensitivity: 0.0035, hudScale: 1.0 };

// Выбор режимов (Добавлен 'survival')
window.selectGameMode = function(mode) {
    currentGameMode = mode;
    const btnCoop = document.getElementById('mode-coop-select');
    const btnPvp = document.getElementById('mode-pvp-select');
    const btnSurv = document.getElementById('mode-survival-select');

    if (btnCoop) btnCoop.classList.toggle('active', mode === 'coop');
    if (btnPvp) btnPvp.classList.toggle('active', mode === 'pvp');
    if (btnSurv) btnSurv.classList.toggle('active', mode === 'survival');
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
        depthTest: false,
        depthWrite: false,
        transparent: true
    });
    
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.5, 0.644, 1); 
    return sprite;
}

function initSocket() {
    const statusText = document.getElementById('auth-status');
    const authBtn = document.getElementById('btn-auth');

    if(statusText) statusText.innerText = "Устанавливаем соединение с сервером...";
    if(authBtn) { authBtn.disabled = true; authBtn.style.background = '#475569'; authBtn.innerText = "ПОДКЛЮЧЕНИЕ..."; }

    socket = io(SERVER_URL, {
        transports: ['polling', 'websocket'],
        forceNew: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        timeout: 20000
    });

    socket.on('connect', () => { 
        if(statusText) statusText.innerText = "Сервер онлайн! Входите в ЧЗО."; 
        if(authBtn) { authBtn.disabled = false; authBtn.style.background = '#ec4899'; authBtn.innerText = "ВОЙТИ В ИГРУ"; }
        
        setTimeout(() => {
            const timerText = document.getElementById('hud-timer');
            if (timerText && timerText.innerText === "ЗАГРУЗКА...") {
                timerText.style.display = "none";
            }
        }, 1500);
    });

    socket.on('connect_error', (error) => {
        if(statusText) statusText.innerText = `Ошибка связи: ${error.message}.`;
    });
    
    socket.on('authSuccess', (data) => { 
        localStorage.setItem('n', data.nick); localStorage.setItem('p', data.pass);
        currentGameMode = data.mode || currentGameMode;
        document.getElementById('auth-screen').style.display = 'none'; 
        myId = socket.id; 
        buildMap();
    });
    
    socket.on('init', (spawnPos) => { 
        if (yawObject) yawObject.position.set(spawnPos.x || 0, 1.7, spawnPos.z || 30);
        hp = 100; armor = 100; ammo = 30; reserveAmmo = 120; updateHUD(); 
        document.getElementById('respawn-screen').style.display = 'none'; 
        buildMap();
    });

    socket.on('chatMessage', (data) => {
        const log = document.getElementById('chat-log');
        if (log) {
            log.innerHTML += `<div><span style="color: #38bdf8; font-weight:bold;">${data.nick}:</span> ${data.msg}</div>`;
            log.scrollTop = log.scrollHeight; 
        }
    });
    
    socket.on('timerUpdate', (data) => { 
        const timerText = document.getElementById('hud-timer');
        const skipBtn = document.getElementById('btn-skip-break');
        if (!timerText) return;
        timerText.style.display = "block";

        if (currentGameMode === 'coop') {
            if (data.isBreak) {
                timerText.innerHTML = `ПЕРЕРЫВ<br>${data.timeLeft}с`;
                if(skipBtn) { skipBtn.style.display = 'block'; document.getElementById('skip-votes-count').innerText = data.votes || 0; }
            } else {
                timerText.innerHTML = `ВОЛНА ${data.wave}<br>БОТОВ: ${data.timeLeft}`;
                if(skipBtn) skipBtn.style.display = 'none';
            }
        } else if (currentGameMode === 'survival') {
            timerText.innerHTML = `ВЫЖИВАНИЕ<br>ИССЛЕДОВАНИЕ`;
            if(skipBtn) skipBtn.style.display = 'none';
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

    // Обработка ботов: В режиме ВЫЖИВАНИЯ (survival) боты полностью очищаются!
    socket.on('updateBots', (serverBots) => {
        if (!scene) return;

        // Если режим "Выживание без зомби" — удаляем всех имеющихся ботов и выходим
        if (currentGameMode === 'survival') {
            for (let id in remoteBots) {
                scene.remove(remoteBots[id]);
                delete remoteBots[id];
            }
            return;
        }

        for (let id in serverBots) {
            let bData = serverBots[id];
            if (bData.x === undefined || bData.z === undefined) continue;

            if (!remoteBots[id]) {
                let group = new THREE.Group();
                let torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.8), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
                torso.position.y = 1.0; torso.userData = { targetId: id, zone: 'body' }; group.add(torso);
                
                let head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
                head.position.y = 2.0; head.userData = { targetId: id, zone: 'head' }; group.add(head);

                let label = createCharacterLabel("ЗОМБИ", bData.hp || 100, 0, true);
                label.position.y = 2.8; label.name = "bot_label"; group.add(label);
                
                scene.add(group); remoteBots[id] = group;
            }
            
            if (remoteBots[id]) {
                remoteBots[id].position.set(bData.x, 0, bData.z); 
                if (bData.rotY) remoteBots[id].rotation.y = bData.rotY;
                
                let oldLabel = remoteBots[id].getObjectByName("bot_label"); 
                if (oldLabel) remoteBots[id].remove(oldLabel);
                
                let newLabel = createCharacterLabel("ЗОМБИ", bData.hp || 100, 0, true);
                newLabel.position.y = 2.8; newLabel.name = "bot_label"; remoteBots[id].add(newLabel);
            }
        }
        
        for (let id in remoteBots) { 
            if (!serverBots[id]) { scene.remove(remoteBots[id]); delete remoteBots[id]; } 
        }
    });
}

function updateMinimap(serverPlayers, currentBots) {
    const radar = document.getElementById('minimap-radar'); if (!radar || !yawObject) return;
    document.querySelectorAll('.radar-dot:not(.dot-me)').forEach(el => el.remove());
    const radarRadius = 55; const mapScale = 1.0;
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
    initEngine(); 
    initSocket(); 
    setupControls(); 
    fixJoystickPosition(); 
    loadHUDPositions(); 
    loadCrosshairSettings();
    
    setInterval(() => { checkLootPickups(); }, 100);

    let savedScale = localStorage.getItem('game_hud_scale');
    if (savedScale) { window.gameSettings.hudScale = parseFloat(savedScale); document.getElementById('scale-slider').value = savedScale; applyHUDScale(savedScale); }
    if(localStorage.getItem('n') && localStorage.getItem('p')) {
        document.getElementById('input-nick').value = localStorage.getItem('n'); document.getElementById('input-pass').value = localStorage.getItem('p');
    }
});

function applyHUDScale(scale) { document.getElementById('hud-scalable-wrapper').style.transform = `scale(${scale})`; }

function fixJoystickPosition() {
    const jZone = document.getElementById('joystick-zone');
    if (jZone) {
        jZone.style.position = 'absolute'; jZone.style.bottom = '40px'; jZone.style.left = '40px';
        jZone.style.top = 'auto'; jZone.style.right = 'auto'; jZone.style.transform = 'none';
    }
}

function initEngine() {
    const container = document.getElementById('canvas-container'); if (!container) return;
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x05070f); scene.fog = new THREE.FogExp2(0x05070f, 0.015);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    pitchObject.add(camera); yawObject.add(pitchObject); scene.add(yawObject);
    renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    let dirLight = new THREE.DirectionalLight(0xff9500, 0.8); dirLight.position.set(20, 50, 20); scene.add(dirLight);
    buildMap(); createWeapon(); animate();
}

function createWeapon() {
    if (!camera) return;
    let weaponGroup = new THREE.Group();
    let barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5), new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness:0.7 })); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0, -0.25); weaponGroup.add(barrel);
    weaponGroup.position.set(0.2, -0.18, -0.4); camera.add(weaponGroup); weaponMesh = weaponGroup;
}

// ============================================================================
// ПОЛНОЦЕННАЯ 3D-КАРТА ЧАЭС ПО ВАШЕМУ MERMAID-ГРАФУ
// ============================================================================
function buildMap() {
    mapObjects.forEach(obj => scene.remove(obj)); mapObjects = []; colliders = [];
    lootItems.forEach(item => scene.remove(item.mesh)); lootItems = [];

    // Земля Зоны
    let floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ color: 0x0f172a })); 
    floor.rotation.x = -Math.PI / 2; scene.add(floor); mapObjects.push(floor);
    let grid = new THREE.GridHelper(240, 60, 0xff9500, 0x1e293b); grid.position.y = 0.01; scene.add(grid); mapObjects.push(grid);
    
    // Внешний периметр (Граница Зоны)
    createObstacle(0, 4, -120, 240, 8, 2, 0x2b0a0a); createObstacle(0, 4, 120, 240, 8, 2, 0x2b0a0a);
    createObstacle(-120, 4, 0, 2, 8, 240, 0x2b0a0a); createObstacle(120, 4, 0, 2, 8, 240, 0x2b0a0a);

    // 1. CNPP (ЧАЭС — 4-й Энергоблок в центре)
    createObstacle(0, 8, 0, 24, 16, 24, 0x3d1f00); 
    let sarco = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 10), new THREE.MeshBasicMaterial({ color: 0xff9500, wireframe: true }));
    sarco.position.set(0, 19, 0); scene.add(sarco); mapObjects.push(sarco);

    // 2. PRIPYAT (Припять — Город-призрак на севере)
    createObstacle(0, 6, -50, 12, 12, 12, 0x0d1b2a);
    createObstacle(-16, 5, -55, 10, 10, 10, 0x0d1b2a);
    createObstacle(16, 7, -55, 10, 14, 10, 0x0d1b2a);

    // 3. REDFOREST (Красный Лес на западе)
    for(let i = 0; i < 8; i++) {
        let rx = -45 + (i % 3) * 8; let rz = -10 + Math.floor(i / 3) * 10;
        createObstacle(rx, 3, rz, 3, 6, 3, 0x6b0a0a);
    }

    // 4. DUGA (Радар "Русановка" / Дуга РЛС на юго-западе)
    createObstacle(-50, 15, 45, 40, 30, 3, 0x1a0d2e);

    // 5. LABX (Лаборатория X-18 на юго-востоке)
    createObstacle(40, 3, 40, 16, 6, 16, 0x1a0d1a);

    // 6. SWAMP (Болота) & CHISTOGAL (Чистогаловка)
    createObstacle(45, 0.2, -10, 30, 0.4, 30, 0x0d1f0d); // Болотная зона
    createObstacle(45, 2, -10, 6, 4, 6, 0x1a1a1a);       // Чистогаловка

    // 7. Деревни KOPACHI & ZALESYE
    createObstacle(-35, 1.5, -45, 5, 3, 5, 0x1a1a1a); // Залесье
    createObstacle(25, 1.5, -45, 5, 3, 5, 0x1a1a1a);  // Копачи

    // 8. ХОЛМЫ (HILLS1, HILLS2, HILLS3)
    createObstacle(20, 2.5, 15, 12, 5, 12, 0x0d1f0d);
    createObstacle(-20, 2.5, 20, 12, 5, 12, 0x0d1f0d);

    // СПАВН ЛУТА ПО КАРТЕ ЧЗО
    spawnLoot(0, 0.4, -25, 'medkit', 0x10b981);    // Дорога в Припять
    spawnLoot(-45, 0.4, 40, 'ammo', 0xf59e0b);     // Около Радара Дуга
    spawnLoot(40, 0.4, 30, 'armor', 0x3b82f6);     // Бункер X-18
    spawnLoot(-40, 0.4, -10, 'medkit', 0x10b981);  // Красный Лес
    spawnLoot(45, 0.4, -10, 'ammo', 0xf59e0b);     // Болота
}

function createObstacle(x, y, z, w, h, d, color) {
    let mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: color })); 
    mesh.position.set(x, y, z); scene.add(mesh); mapObjects.push(mesh); colliders.push(new THREE.Box3().setFromObject(mesh));
}

function spawnLoot(x, y, z, type, colorHex) {
    let geo = new THREE.BoxGeometry(0.7, 0.7, 0.7);
    let mat = new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 0.4, metalness: 0.2 });
    let mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); scene.add(mesh);
    lootItems.push({ mesh: mesh, type: type, x: x, y: y, z: z, baseHeight: y, seed: Math.random() * 100 });
}

function checkWallCollisions(newPos) {
    let pr = 0.4;
    let playerBox = new THREE.Box3(new THREE.Vector3(newPos.x - pr, newPos.y - 1.6, newPos.z - pr), new THREE.Vector3(newPos.x + pr, newPos.y + 0.2, newPos.z + pr));
    for (let i = 0; i < colliders.length; i++) { if (playerBox.intersectsBox(colliders[i])) return true; }
    return false;
}

function checkLootPickups() {
    if (!yawObject || hp <= 0) return;
    let pPos = yawObject.position;
    
    for (let i = lootItems.length - 1; i >= 0; i--) {
        let item = lootItems[i];
        let dist = pPos.distanceTo(item.mesh.position);
        
        if (dist < 1.5) { 
            let pickedUp = false;
            if (item.type === 'medkit' && hp < 100) { hp = 100; pickedUp = true; } 
            else if (item.type === 'armor' && armor < 100) { armor = 100; pickedUp = true; } 
            else if (item.type === 'ammo' && reserveAmmo < 120) { reserveAmmo = 120; pickedUp = true; }
            
            if (pickedUp) {
                updateHUD();
                let pickedMesh = item.mesh; scene.remove(pickedMesh);
                lootItems.splice(i, 1);
                
                setTimeout(() => {
                    if (scene) { scene.add(pickedMesh); lootItems.push(item); }
                }, 12000);
            }
        }
    }
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

function setupChatControls() {
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && chatInput.value.trim() !== '') {
                if (socket && socket.connected) { socket.emit('sendChatMessage', { msg: chatInput.value.trim() }); }
                chatInput.value = ''; chatInput.blur(); 
            }
        });
    }
}

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
if(document.getElementById('btn-skip-break')) document.getElementById('btn-skip-break').addEventListener('click', () => { if(socket && socket.connected) socket.emit('skipBreakVote'); });

function loadCrosshairSettings() {
    const crosshair = document.getElementById('game-crosshair'); if(!crosshair) return;
    let color = localStorage.getItem('ch_color') || '#00ff00';
    let size = localStorage.getItem('ch_size') || '6';
    let shape = localStorage.getItem('ch_shape') || '50%';

    crosshair.style.background = color;
    crosshair.style.width = size + 'px'; crosshair.style.height = size + 'px';
    crosshair.style.borderRadius = shape;

    if(document.getElementById('crosshair-color')) document.getElementById('crosshair-color').value = color;
    if(document.getElementById('crosshair-size')) document.getElementById('crosshair-size').value = size;
    if(document.getElementById('crosshair-size-val')) document.getElementById('crosshair-size-val').innerText = size + 'px';
    if(document.getElementById('crosshair-shape')) document.getElementById('crosshair-shape').value = shape;
}

function setupControls() {
    const jZone = document.getElementById('joystick-zone'), stick = document.getElementById('joystick-stick');
    const menuTrigger = document.getElementById('btn-menu-trigger'), customMenu = document.getElementById('customizer-menu');

    setupChatControls();

    if(document.getElementById('scale-slider')) {
        document.getElementById('scale-slider').addEventListener('input', (e) => {
            let val = e.target.value; window.gameSettings.hudScale = parseFloat(val); applyHUDScale(val); localStorage.setItem('game_hud_scale', val);
        });
    }

    const crosshair = document.getElementById('game-crosshair');
    if(document.getElementById('crosshair-color')) {
        document.getElementById('crosshair-color').addEventListener('input', (e) => { if(crosshair) crosshair.style.background = e.target.value; });
    }
    if(document.getElementById('crosshair-size')) {
        document.getElementById('crosshair-size').addEventListener('input', (e) => { if(crosshair) { crosshair.style.width = e.target.value+'px'; crosshair.style.height = e.target.value+'px'; document.getElementById('crosshair-size-val').innerText = e.target.value+'px'; } });
    }
    if(document.getElementById('crosshair-shape')) {
        document.getElementById('crosshair-shape').addEventListener('change', (e) => { if(crosshair) crosshair.style.borderRadius = e.target.value; });
    }

    menuTrigger.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation(); if (isCustomizing) return; 
        isCustomizing = true; stopAutofire(); 
        if(document.getElementById('menu-user-nick')) document.getElementById('menu-user-nick').innerText = myNick || "Сталкер";
        const modeBadge = document.getElementById('menu-user-mode');
        if (modeBadge) {
            if (currentGameMode === 'coop') { modeBadge.innerText = "РЕЖИМ: ЗАЧИСТКА ЗОМБИ"; modeBadge.style.color = "#10b981"; } 
            else if (currentGameMode === 'survival') { modeBadge.innerText = "РЕЖИМ: ВЫЖИВАНИЕ (БЕЗ ЗОМБИ)"; modeBadge.style.color = "#f59e0b"; }
            else { modeBadge.innerText = "РЕЖИМ: КОМАНДНЫЙ БОЙ"; modeBadge.style.color = "#ef4444"; }
        }
        document.body.classList.add('edit-mode'); if(customMenu) customMenu.style.display = 'block';
    });

    if(document.getElementById('btn-save-hud')) {
        document.getElementById('btn-save-hud').addEventListener('click', () => { 
            isCustomizing = false; document.body.classList.remove('edit-mode'); if(customMenu) customMenu.style.display = 'none'; 
            saveHUDPositions(); fixJoystickPosition();
            if(document.getElementById('crosshair-color')) localStorage.setItem('ch_color', document.getElementById('crosshair-color').value);
            if(document.getElementById('crosshair-size')) localStorage.setItem('ch_size', document.getElementById('crosshair-size').value);
            if(document.getElementById('crosshair-shape')) localStorage.setItem('ch_shape', document.getElementById('crosshair-shape').value);
        });
    }

    if(document.getElementById('btn-fullscreen-toggle')) {
        document.getElementById('btn-fullscreen-toggle').addEventListener('touchstart', (e) => {
            e.preventDefault(); e.stopPropagation();
            const docEl = document.documentElement;
            const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
            if (!isFullscreen) {
                if (docEl.requestFullscreen) docEl.requestFullscreen().catch(err => console.log(err));
                else if (docEl.webkitRequestFullscreen) docEl.webkitRequestFullscreen();
            } else {
                if (document.exitFullscreen) document.exitFullscreen();
            }
            setTimeout(() => { if (camera && renderer) { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); } }, 300);
        }, { passive: false });
    }

    // Переключение режимов через меню
    if(document.getElementById('btn-menu-switch-coop')) {
        document.getElementById('btn-menu-switch-coop').addEventListener('click', () => {
            if(currentGameMode === 'coop') return;
            isCustomizing = false; document.body.classList.remove('edit-mode'); if(customMenu) customMenu.style.display = 'none';
            currentGameMode = 'coop'; if (socket && socket.connected) socket.emit('playerAuth', { nick: myNick, pass: myPass, mode: 'coop' });
            buildMap();
        });
    }

    if(document.getElementById('btn-menu-switch-pvp')) {
        document.getElementById('btn-menu-switch-pvp').addEventListener('click', () => {
            if(currentGameMode === 'pvp') return;
            isCustomizing = false; document.body.classList.remove('edit-mode'); if(customMenu) customMenu.style.display = 'none';
            currentGameMode = 'pvp'; if (socket && socket.connected) socket.emit('playerAuth', { nick: myNick, pass: myPass, mode: 'pvp' });
            buildMap();
        });
    }

    // Переключатель для выживания
    let btnSurvMenu = document.getElementById('btn-menu-switch-survival');
    if(btnSurvMenu) {
        btnSurvMenu.addEventListener('click', () => {
            if(currentGameMode === 'survival') return;
            isCustomizing = false; document.body.classList.remove('edit-mode'); if(customMenu) customMenu.style.display = 'none';
            currentGameMode = 'survival'; if (socket && socket.connected) socket.emit('playerAuth', { nick: myNick, pass: myPass, mode: 'survival' });
            buildMap();
        });
    }

    if(document.getElementById('btn-logout')) {
        document.getElementById('btn-logout').addEventListener('click', () => {
            isCustomizing = false; document.body.classList.remove('edit-mode'); if(customMenu) customMenu.style.display = 'none';
            document.getElementById('auth-screen').style.display = 'flex'; if(socket) socket.disconnect();
            setTimeout(initSocket, 500);
        });
    }

    document.getElementById('btn-fire').addEventListener('touchstart', (e) => { if(!isCustomizing){ e.preventDefault(); startAutofire(); } });
    document.getElementById('btn-fire').addEventListener('touchend', (e) => { if(!isCustomizing){ e.preventDefault(); stopAutofire(); } });
    document.getElementById('btn-reload').addEventListener('touchstart', (e) => { if(!isCustomizing){ e.preventDefault(); startReload(); } });
    document.getElementById('btn-jump').addEventListener('touchstart', (e) => { if(!isCustomizing){ e.preventDefault(); if(isGrounded) playerVelocity.y = JUMP_FORCE; } });
    document.getElementById('btn-crouch').addEventListener('touchstart', (e) => { 
        if(!isCustomizing){ e.preventDefault(); isCrouching = !isCrouching; document.getElementById('btn-crouch').style.backgroundColor = isCrouching ? "rgba(59, 130, 246, 0.6)" : "rgba(30, 58, 138, 0.3)"; }
    });

    jZone.addEventListener('touchstart', (e) => { if(!isCustomizing){ e.stopPropagation(); let t = e.targetTouches[0]; joystickTouchId = t.identifier; updateJoystick(t); } });
    jZone.addEventListener('touchmove', (e) => { if(!isCustomizing){ e.stopPropagation(); for(let t of e.touches) { if(t.identifier === joystickTouchId) updateJoystick(t); } } });
    jZone.addEventListener('touchend', () => { if(!isCustomizing){ joystickTouchId = null; stick.style.transform = `translate(0px, 0px)`; moveDirection.forward = 0; moveDirection.right = 0; } });

    function updateJoystick(touch) {
        let rect = jZone.getBoundingClientRect(); 
        let dx = touch.clientX - (rect.left + rect.width / 2);
        let dy = touch.clientY - (rect.top + rect.height / 2);
        let dist = Math.sqrt(dx*dx + dy*dy); 
        if (dist > 40) { dx = (dx / dist) * 40; dy = (dy / dist) * 40; }
        stick.style.transform = `translate(${dx}px, ${dy}px)`; 
        moveDirection.forward = -(dy / 40); 
        moveDirection.right = (dx / 40);
    }

    window.addEventListener('touchstart', (e) => { 
        if (isCustomizing || e.target.closest('#customizer-menu') || e.target.closest('.overlay') || e.target.closest('#game-chat') || e.target.closest('button') || e.target.closest('input')) return; 
        for(let t of e.changedTouches) { if(lookTouchId === null) { lookTouchId = t.identifier; lastLookX = t.clientX; lastLookY = t.clientY; } } 
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        if (isCustomizing) return;
        for(let t of e.changedTouches) { 
            if(t.identifier === lookTouchId) { 
                let dx = t.clientX - lastLookX, dy = t.clientY - lastLookY; 
                let sens = window.gameSettings.sensitivity; 
                yawObject.rotation.y -= dx * sens; 
                pitchObject.rotation.x -= dy * sens; 
                pitchObject.rotation.x = Math.max(-Math.PI/2.2, Math.min(Math.PI/2.2, pitchObject.rotation.x)); 
                lastLookX = t.clientX; lastLookY = t.clientY; 
            } 
        }
    }, { passive: true });

    window.addEventListener('touchend', (e) => { for(let t of e.changedTouches) { if(t.identifier === lookTouchId) lookTouchId = null; } });

    let dragElement = null, dragOffsetX = 0, dragOffsetY = 0;
    document.querySelectorAll('.hud-element').forEach(el => {
        if (el.id === "game-crosshair" || el.id === "joystick-zone") return; 
        el.addEventListener('touchstart', (e) => { 
            if (!isCustomizing || el.id === "btn-menu-trigger") return; 
            dragElement = el; let touch = e.touches[0]; let rect = el.getBoundingClientRect(); 
            dragOffsetX = touch.clientX - rect.left; dragOffsetY = touch.clientY - rect.top; 
            el.style.transform = "none"; 
        });
    });
    window.addEventListener('touchmove', (e) => { 
        if (!isCustomizing || !dragElement) return; 
        let touch = e.touches[0]; 
        let x = (touch.clientX - dragOffsetX) / window.gameSettings.hudScale; 
        let y = (touch.clientY - dragOffsetY) / window.gameSettings.hudScale; 
        dragElement.style.left = x + 'px'; dragElement.style.top = y + 'px'; 
        dragElement.style.bottom = 'auto'; dragElement.style.right = 'auto'; 
    });
    window.addEventListener('touchend', () => { dragElement = null; });
}

function saveHUDPositions() { let layout = {}; document.querySelectorAll('.hud-element').forEach(el => { if(el.id!=="game-crosshair" && el.id!=="joystick-zone") layout[el.id] = { left: el.style.left, top: el.style.top }; }); localStorage.setItem('hud_layout_universal', JSON.stringify(layout)); }
function loadHUDPositions() { let saved = localStorage.getItem('hud_layout_universal'); if (!saved) return; let layout = JSON.parse(saved); for (let id in layout) { let el = document.getElementById(id); if (el && layout[id].left) { el.style.left = layout[id].left; el.style.top = layout[id].top; el.style.right = 'auto'; el.style.bottom = 'auto'; el.style.transform = 'none'; } } }

let clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate); if (!renderer || !scene || !camera) return;
    let delta = clock.getDelta(); if (delta > 0.1) delta = 0.1;
    lootItems.forEach(item => { item.mesh.rotation.y += 1.2 * delta; item.mesh.rotation.x += 0.4 * delta; item.mesh.position.y = item.baseHeight + Math.sin(Date.now() * 0.003 + item.seed) * 0.12; });

    if (myId && hp > 0 && !isCustomizing) {
        playerVelocity.y -= GRAVITY * delta; let currentSpeed = isCrouching ? crouchSpeed : moveSpeed;
        let forwardVector = new THREE.Vector3(0, 0, -1).applyQuaternion(yawObject.quaternion);
        let sideVector = new THREE.Vector3(1, 0, 0).applyQuaternion(yawObject.quaternion);
        let moveX = (forwardVector.x * moveDirection.forward + sideVector.x * moveDirection.right) * currentSpeed * delta;
        let moveZ = (forwardVector.z * moveDirection.forward + sideVector.z * moveDirection.right) * currentSpeed * delta;
        
        let targetPos = yawObject.position.clone(); targetPos.x += moveX; if (!checkWallCollisions(targetPos)) yawObject.position.x = targetPos.x;
        targetPos = yawObject.position.clone(); targetPos.z += moveZ; if (!checkWallCollisions(targetPos)) yawObject.position.z = targetPos.z;
        
        yawObject.position.y += playerVelocity.y * delta;
        let targetHeight = isCrouching ? 0.9 : 1.7;
        if (yawObject.position.y <= targetHeight) { playerVelocity.y = 0; yawObject.position.y = targetHeight; isGrounded = true; } else { isGrounded = false; }
        
        if(socket && socket.connected) socket.emit('playerMove', { x: yawObject.position.x, z: yawObject.position.z, rotY: yawObject.rotation.y });
    }
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => { if(camera && renderer) { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); } });
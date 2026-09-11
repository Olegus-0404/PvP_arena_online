// ============================================================================
// GAME CLIENT CORE: S.T.A.L.K.E.R. Zone Atmosphere Edition (Full Drag & Drop HUD Fix)
// ============================================================================

const DEFAULT_SERVER_URL = "https://pvp-arena-online.onrender.com"; 
let SERVER_URL = DEFAULT_SERVER_URL;
let socket = null;

let myId = null, myNick = "", currentGameMode = "survival";
let currentLobbyId = null;
let hp = 100, armor = 100, kills = 0, isReloading = false;
let playerAvatarData = localStorage.getItem('stalker_avatar') || '';

// Арсенал и оружие
const WEAPONS = {
    knife: { name: "Нож", damage: 35, fireRate: 500, ammo: Infinity, maxReserve: 0, range: 2.0 },
    pistol: { name: "ПМ", damage: 25, fireRate: 300, ammo: 8, maxReserve: 32, range: 50 },
    rifle: { name: "АК-47", damage: 45, fireRate: 110, ammo: 30, maxReserve: 120, range: 100 }
};
let currentWeaponKey = 'rifle';
let ammo = WEAPONS['rifle'].ammo;
let reserveAmmo = WEAPONS['rifle'].maxReserve;
let weaponState = {
    knife: { ammo: Infinity, reserve: 0 },
    pistol: { ammo: 8, reserve: 32 },
    rifle: { ammo: 30, reserve: 120 }
};

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

let fireIntervalId = null;
let isCrouching = false, isCustomizing = false;

// Drag & Drop HUD переменные
let draggedElement = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

window.gameSettings = { sensitivity: 0.0035, hudScale: 1.0 };

window.selectGameMode = function(mode) {
    currentGameMode = mode;
    const btnCoop = document.getElementById('menu-mode-coop');
    const btnPvp = document.getElementById('menu-mode-pvp');
    const btnSurv = document.getElementById('menu-mode-surv');

    if (btnCoop) btnCoop.style.background = mode === 'coop' ? '#386641' : '#2b3a28';
    if (btnPvp) btnPvp.style.background = mode === 'pvp' ? '#bc6c25' : '#2b3a28';
    if (btnSurv) btnSurv.style.background = mode === 'survival' ? '#386641' : '#2b3a28';
};

window.switchWeapon = function(weaponKey) {
    if (!WEAPONS[weaponKey]) return;
    weaponState[currentWeaponKey].ammo = ammo;
    weaponState[currentWeaponKey].reserve = reserveAmmo;

    currentWeaponKey = weaponKey;
    ammo = weaponState[weaponKey].ammo;
    reserveAmmo = weaponState[weaponKey].reserve;
    
    ['knife', 'pistol', 'rifle'].forEach(w => {
        let el = document.getElementById(`slot-${w}`);
        if(el) el.style.border = w === weaponKey ? '2px solid #d4a359' : '1px solid #333931';
    });

    updateHUD();
    updateWeaponMesh(weaponKey);
};

// ТЕКСТУРЫ И МОДЕЛИ ОРУЖИЯ
function updateWeaponMesh(key) {
    if (!camera || !weaponMesh) return;
    while(weaponMesh.children.length > 0) { 
        weaponMesh.remove(weaponMesh.children[0]); 
    }
    
    let metalMat = new THREE.MeshStandardMaterial({ color: 0x2b2d2f, roughness: 0.4, metalness: 0.85 });
    let woodMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.7, metalness: 0.1 });
    let darkMat = new THREE.MeshStandardMaterial({ color: 0x111311, roughness: 0.9, metalness: 0.2 });

    if (key === 'knife') {
        let handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.04), woodMat);
        handle.position.set(0, -0.05, 0);
        let blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.01), metalMat);
        blade.position.set(0, 0.1, 0);
        weaponMesh.add(handle); weaponMesh.add(blade);
    } else if (key === 'pistol') {
        let body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.22), metalMat);
        body.position.set(0, -0.04, -0.1);
        let handle = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.14, 0.07), darkMat);
        handle.rotation.x = 0.2;
        handle.position.set(0, -0.14, -0.02);
        weaponMesh.add(body); weaponMesh.add(handle);
    } else {
        let receiver = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.45), metalMat);
        receiver.position.set(0, 0, -0.2);
        
        let handguard = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.07, 0.25), woodMat);
        handguard.position.set(0, -0.01, -0.38);

        let mag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.22, 0.08), darkMat);
        mag.rotation.x = -0.3;
        mag.position.set(0, -0.15, -0.25);

        let stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.3), woodMat);
        stock.position.set(0, -0.02, 0.15);

        weaponMesh.add(receiver);
        weaponMesh.add(handguard);
        weaponMesh.add(mag);
        weaponMesh.add(stock);
    }
}

function createStalkerModel(isEnemy) {
    let group = new THREE.Group();
    let baseColor = isEnemy ? 0x8c2b2b : 0x3d5a80;
    
    let torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.35), new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.9 }));
    torso.position.y = 0.85; torso.userData = { zone: 'body' }; group.add(torso);

    let backpack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.2), new THREE.MeshStandardMaterial({ color: 0x3b332b, roughness: 1.0 }));
    backpack.position.set(0, 0.85, -0.25); group.add(backpack);

    let head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 16), new THREE.MeshStandardMaterial({ color: 0x6c757d, roughness: 0.8 }));
    head.position.y = 1.45; head.userData = { zone: 'head' }; group.add(head);

    return group;
}

function createCharacterLabel(text, hp, armor, isEnemy) {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 110; 
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!isEnemy) {
        ctx.fillStyle = '#4dabf7'; 
        ctx.beginPath(); ctx.moveTo(128, 5); ctx.lineTo(118, 20); ctx.lineTo(138, 20); ctx.closePath(); ctx.fill();
    }

    const textY = isEnemy ? 24 : 45;
    const barY = isEnemy ? 34 : 55;
    const armorY = isEnemy ? 56 : 77;

    ctx.font = 'Bold 20px monospace';
    ctx.fillStyle = isEnemy ? '#ff6b6b' : '#e6dfcc';
    ctx.textAlign = 'center'; ctx.fillText(text, 128, textY);

    const barX = 28; const barW = 200;

    ctx.fillStyle = '#1a1c1a'; ctx.fillRect(barX, barY, barW, 18);
    ctx.fillStyle = '#51cf66'; let hpPercent = Math.max(0, Math.min(100, hp)) / 100; ctx.fillRect(barX, barY, barW * hpPercent, 18);

    ctx.font = 'Bold 13px monospace'; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
    ctx.fillText(`${Math.max(0, hp)} HP`, 128, barY + 14);

    ctx.fillStyle = '#1a1c1a'; ctx.fillRect(barX, armorY, barW, 8);
    ctx.fillStyle = '#4dabf7'; let armorPercent = Math.max(0, Math.min(100, armor)) / 100; ctx.fillRect(barX, armorY, barW * armorPercent, 8);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, transparent: true });
    
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.5, 0.644, 1); 
    return sprite;
}

function initAuthScreen() {
    const authScreen = document.getElementById('auth-screen');
    if (!authScreen) return;

    authScreen.innerHTML = `
        <div class="auth-wrapper" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: linear-gradient(rgba(10,12,10,0.88), rgba(10,12,10,0.96)), #111; display: flex; justify-content: center; align-items: center; z-index: 9999; font-family: monospace; color: #e6dfcc;">
            <div class="auth-container" style="background: rgba(18, 20, 18, 0.95); padding: 30px; border-radius: 10px; border: 1px solid #434c3e; width: 400px; box-shadow: 0 10px 30px rgba(0,0,0,0.8);">
                <h1 style="margin-top: 0; color: #d4a359; text-align: center; letter-spacing: 3px; font-size: 22px;">S.T.A.L.K.E.R: ЧЗО</h1>
                <div style="font-size: 11px; text-align: center; color: #8d99ae; margin-bottom: 20px; letter-spacing: 1px;">PVP ARENA & COOP SURVIVAL</div>
                
                <div style="margin-bottom: 12px;">
                    <label style="font-size: 11px; color: #a3b18a; display: block; margin-bottom: 4px;">ПОЗЫВНОЙ СТАЛКЕРА</label>
                    <input type="text" id="input-nick" placeholder="Введите позывной..." maxlength="15" style="width: 100%; padding: 10px; background: #111311; border: 1px solid #333931; color: #fff; border-radius: 5px; box-sizing: border-box; font-size: 14px;">
                </div>

                <div style="margin-bottom: 12px;">
                    <label style="font-size: 11px; color: #a3b18a; display: block; margin-bottom: 4px;">ВЫБОР СЕРВЕРА</label>
                    <select id="select-server" style="width: 100%; padding: 10px; background: #111311; border: 1px solid #333931; color: #fff; border-radius: 5px; box-sizing: border-box; font-size: 13px;">
                        <option value="https://pvp-arena-online.onrender.com">Основной Сервер (Render RU)</option>
                        <option value="https://pvp-arena-backup.onrender.com">Резервный Сервер</option>
                    </select>
                </div>

                <div style="margin-bottom: 15px; background: rgba(0,0,0,0.4); padding: 10px; border-radius: 5px; border: 1px solid #2a2e28;">
                    <label style="font-size: 11px; color: #d4a359; font-weight: bold; display: block; margin-bottom: 4px;">ОТРЯД И ДРУЗЬЯ</label>
                    <input type="text" id="input-lobby" placeholder="ID Лобби (оставьте пустым)" style="width: 100%; padding: 8px; background: #111311; border: 1px solid #333931; color: #fff; border-radius: 4px; box-sizing: border-box; font-size: 12px;">
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="font-size: 11px; color: #a3b18a; display: block; margin-bottom: 4px;">РЕЖИМ ИГРЫ</label>
                    <div style="display: flex; gap: 6px;">
                        <button type="button" id="menu-mode-surv" onclick="window.selectGameMode('survival')" style="flex: 1; padding: 8px; background: #386641; border: none; color: #fff; border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: bold;">Выживание</button>
                        <button type="button" id="menu-mode-coop" onclick="window.selectGameMode('coop')" style="flex: 1; padding: 8px; background: #2b3a28; border: none; color: #a3b18a; border-radius: 4px; cursor: pointer; font-size: 10px;">Мутанты</button>
                        <button type="button" id="menu-mode-pvp" onclick="window.selectGameMode('pvp')" style="flex: 1; padding: 8px; background: #2b3a28; border: none; color: #a3b18a; border-radius: 4px; cursor: pointer; font-size: 10px;">PvP Бой</button>
                    </div>
                </div>

                <button id="btn-auth" style="width: 100%; padding: 13px; background: #bc6c25; color: white; border: none; font-weight: bold; border-radius: 5px; cursor: pointer; letter-spacing: 1.5px; font-size: 14px; box-shadow: 0 4px 10px rgba(0,0,0,0.3);">ВОЙТИ В ЗОНУ</button>
                <div id="auth-status" style="margin-top: 10px; font-size: 11px; color: #8d99ae; text-align: center;">Готово к подключению КПК</div>
            </div>
        </div>
    `;

    document.getElementById('btn-auth').addEventListener('click', () => {
        let nickname = document.getElementById('input-nick').value.trim();
        let serverUrl = document.getElementById('select-server').value;
        let lobbyId = document.getElementById('input-lobby').value.trim();

        if (nickname.length < 2) {
            alert("Позывной должен содержать минимум 2 символа!");
            return;
        }

        myNick = nickname;
        localStorage.setItem('stalker_nick', myNick);

        const docEl = document.documentElement;
        if (docEl.requestFullscreen) {
            docEl.requestFullscreen().catch(err => console.log("Fullscreen blocked:", err));
        }

        SERVER_URL = serverUrl;
        connectToServer(lobbyId);
    });
}

function connectToServer(lobbyId) {
    const statusText = document.getElementById('auth-status');
    const authBtn = document.getElementById('btn-auth');

    if(statusText) statusText.innerText = "Подключение к КПК Зоны...";
    if(authBtn) { authBtn.disabled = true; authBtn.innerText = "УСТАНОВКА СВЯЗИ..."; }

    if (socket) socket.disconnect();

    socket = io(SERVER_URL, {
        transports: ['polling', 'websocket'],
        forceNew: true,
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        timeout: 20000,
        query: { nick: myNick, lobby: lobbyId || '', mode: currentGameMode }
    });

    socket.on('connect', () => { if(statusText) statusText.innerText = "Сигнал получен. Инициализация мира..."; });

    socket.on('connect_error', (error) => {
        if(statusText) statusText.innerText = `Ошибка КПК: ${error.message}`;
        if(authBtn) { authBtn.disabled = false; authBtn.innerText = "ВОЙТИ В ЗОНУ"; }
    });
    
    socket.on('authSuccess', (data) => { 
        currentGameMode = data.mode || currentGameMode;
        currentLobbyId = data.lobbyId || lobbyId;
        document.getElementById('auth-screen').style.display = 'none'; 
        myId = socket.id; 
        buildMap();
    });
    
    socket.on('init', (spawnPos) => { 
        if (yawObject) {
            yawObject.position.set(spawnPos.x || 0, 3.0, spawnPos.z || 30);
            playerVelocity.set(0, 0, 0);
        }
        hp = 100; armor = 100; 
        ammo = WEAPONS[currentWeaponKey].ammo; 
        reserveAmmo = WEAPONS[currentWeaponKey].maxReserve; 
        updateHUD(); 
        document.getElementById('respawn-screen').style.display = 'none'; 
        buildMap();
    });

    socket.on('chatMessage', (data) => {
        const log = document.getElementById('chat-log');
        if (log) {
            log.innerHTML += `<div><span style="color: #d4a359; font-weight:bold;">${data.nick}:</span> ${data.msg}</div>`;
            log.scrollTop = log.scrollHeight; 
        }
    });

    socket.on('damagedBy', (data) => { 
        triggerDamageFlash(); 
        if (data && data.shooterX !== undefined) createDamageArrow(data.shooterX, data.shooterZ); 
    });

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
                let group = createStalkerModel(isEnemyPlayer);
                let label = createCharacterLabel(pData.nick, pData.hp, pData.armor, isEnemyPlayer);
                label.position.y = 2.2; label.name = "player_label"; group.add(label);
                
                group.traverse(child => { if(child.userData) child.userData.targetId = id; });

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
        if (!scene || currentGameMode === 'survival') return;
        for (let id in serverBots) {
            let bData = serverBots[id];
            if (bData.x === undefined || bData.z === undefined) continue;

            if (!remoteBots[id]) {
                let group = new THREE.Group();
                let torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.2, 0.8), new THREE.MeshStandardMaterial({ color: 0x3a2e2b, roughness: 1.0 }));
                torso.position.y = 1.0; group.add(torso);
                
                let head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16), new THREE.MeshStandardMaterial({ color: 0x212529, roughness: 1.0 }));
                head.position.y = 2.0; group.add(head);

                let label = createCharacterLabel("МУТАНТ", bData.hp || 100, 0, true);
                label.position.y = 2.8; label.name = "bot_label"; group.add(label);
                
                group.traverse(child => { if(!child.userData) child.userData = {}; child.userData.targetId = id; });
                scene.add(group); remoteBots[id] = group;
            }
            if (remoteBots[id]) {
                remoteBots[id].position.set(bData.x, 0, bData.z); 
                if (bData.rotY) remoteBots[id].rotation.y = bData.rotY;
                let oldLabel = remoteBots[id].getObjectByName("bot_label"); 
                if (oldLabel) remoteBots[id].remove(oldLabel);
                let newLabel = createCharacterLabel("МУТАНТ", bData.hp || 100, 0, true);
                newLabel.position.y = 2.8; newLabel.name = "bot_label"; remoteBots[id].add(newLabel);
            }
        }
        for (let id in remoteBots) { if (!serverBots[id]) { scene.remove(remoteBots[id]); delete remoteBots[id]; } }
    });
}

function updateMinimap(serverPlayers, currentBots) {
    const radar = document.getElementById('minimap-radar'); if (!radar || !yawObject) return;
    document.querySelectorAll('.radar-dot:not(.dot-me)').forEach(el => el.remove());
    const radarRadius = 55; const mapScale = 1.0;
    let myX = yawObject.position.x; let myZ = yawObject.position.z; let myRot = yawObject.rotation.y;

    for (let id in serverPlayers) {
        if (id === socket.id || serverPlayers[id].hp <= 0) continue;
        let className = currentGameMode === 'pvp' ? 'dot-enemy' : 'dot-teammate';
        createRadarDot(serverPlayers[id].x, serverPlayers[id].z, myX, myZ, myRot, radarRadius, mapScale, className, radar);
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
        dot.style.background = className === 'dot-teammate' ? '#4dabf7' : '#ff6b6b';
        dot.style.left = pixelX + 'px'; dot.style.top = pixelY + 'px';
        radarContainer.appendChild(dot); return dot;
    }
    return null;
}

function triggerDamageFlash() { let flash = document.getElementById('damage-flash'); if (flash) { flash.style.opacity = '0.4'; setTimeout(() => flash.style.opacity = '0', 150); } }

function createDamageArrow(shooterX, shooterZ) {
    const container = document.getElementById('damage-indicators-container'); if (!container || !yawObject) return;
    const arrow = document.createElement('div'); arrow.className = 'damage-arrow'; arrow.style.position = 'absolute'; arrow.style.width = '0'; arrow.style.height = '0'; arrow.style.borderLeft = '8px solid transparent'; arrow.style.borderRight = '8px solid transparent'; arrow.style.borderBottom = '20px solid #c92a2a'; container.appendChild(arrow);
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
    injectMissingHUDUI();
    initAuthScreen();
    initEngine(); 
    setupControls(); 
    loadHUDPositions(); 
    
    let savedNick = localStorage.getItem('stalker_nick');
    if (savedNick && document.getElementById('input-nick')) {
        document.getElementById('input-nick').value = savedNick;
    }
    
    setInterval(() => { checkLootPickups(); }, 100);

    let savedScale = localStorage.getItem('game_hud_scale');
    if (savedScale) { window.gameSettings.hudScale = parseFloat(savedScale); if (document.getElementById('scale-slider')) document.getElementById('scale-slider').value = savedScale; applyHUDScale(savedScale); }
});

function injectMissingHUDUI() {
    const wrapper = document.getElementById('hud-scalable-wrapper') || document.body;
    
    if (!document.getElementById('cs-top-scoreboard')) {
        const topBoard = document.createElement('div');
        topBoard.id = 'cs-top-scoreboard';
        topBoard.className = 'hud-element';
        topBoard.style.cssText = 'position: fixed; top: 10px; left: 50%; transform: translateX(-50%); background: rgba(18,20,18,0.85); border: 1px solid #333931; padding: 6px 15px; border-radius: 4px; display: flex; gap: 20px; align-items: center; color: #e6dfcc; font-family: monospace; font-size: 13px; z-index: 1000; cursor: move;';
        topBoard.innerHTML = `
            <div>ЗОНА: <span id="val-mode" style="color: #d4a359; font-weight: bold;">ПВП АРЕНА</span></div>
            <div style="border-left: 1px solid #444; padding-left: 15px;">УБИЙСТВА: <span id="val-kills" style="color: #51cf66; font-weight: bold;">0</span></div>
        `;
        wrapper.appendChild(topBoard);
    }

    if (!document.getElementById('weapon-slots-bar')) {
        const weaponBar = document.createElement('div');
        weaponBar.id = 'weapon-slots-bar';
        weaponBar.className = 'hud-element';
        weaponBar.style.cssText = 'position: fixed; top: 10px; right: 20px; display: flex; gap: 8px; z-index: 1000; font-family: monospace; cursor: move;';
        weaponBar.innerHTML = `
            <div id="slot-knife" onclick="window.switchWeapon('knife')" style="background: rgba(18,20,18,0.8); border: 1px solid #333931; padding: 6px 10px; border-radius: 4px; color: #a3b18a; font-size: 11px; cursor: pointer;">НОЖ</div>
            <div id="slot-pistol" onclick="window.switchWeapon('pistol')" style="background: rgba(18,20,18,0.8); border: 1px solid #333931; padding: 6px 10px; border-radius: 4px; color: #a3b18a; font-size: 11px; cursor: pointer;">ПМ</div>
            <div id="slot-rifle" onclick="window.switchWeapon('rifle')" style="background: rgba(18,20,18,0.8); border: 2px solid #d4a359; padding: 6px 10px; border-radius: 4px; color: #e6dfcc; font-size: 11px; cursor: pointer;">АК-47</div>
        `;
        wrapper.appendChild(weaponBar);
    }

    if (!document.getElementById('btn-menu-trigger')) {
        const menuBtn = document.createElement('div');
        menuBtn.id = 'btn-menu-trigger';
        menuBtn.className = 'hud-element';
        menuBtn.style.cssText = 'position: fixed; top: 10px; left: 20px; background: rgba(18,20,18,0.8); border: 1px solid #333931; width: 36px; height: 36px; border-radius: 4px; display: flex; justify-content: center; align-items: center; color: #d4a359; font-size: 18px; cursor: pointer; z-index: 1000; font-family: monospace;';
        menuBtn.innerHTML = '⚙️';
        wrapper.appendChild(menuBtn);

        menuBtn.addEventListener('click', () => {
            const modal = document.getElementById('game-settings-modal');
            if (modal) {
                const nickDisplay = document.getElementById('profile-nick-display');
                if (nickDisplay) nickDisplay.innerText = myNick || "Сталкер";
                modal.style.display = 'flex';
                if (document.pointerLockElement) document.exitPointerLock();
            }
        });
    }

    if (!document.getElementById('game-settings-modal')) {
        const modal = document.createElement('div');
        modal.id = 'game-settings-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); display: none; justify-content: center; align-items: center; z-index: 99999; font-family: monospace; color: #e6dfcc;';
        modal.innerHTML = `
            <div style="background: rgba(18,20,18,0.98); border: 1px solid #434c3e; padding: 25px; border-radius: 8px; width: 420px; max-height: 90vh; overflow-y: auto;">
                <h2 style="color: #d4a359; margin-top: 0; text-align: center; font-size: 18px; letter-spacing: 2px;">КПК СТАЛКЕРА: НАСТРОЙКИ</h2>
                
                <div style="background: rgba(0,0,0,0.4); padding: 12px; border-radius: 6px; margin-bottom: 15px; border: 1px solid #2a2e28; display: flex; gap: 12px; align-items: center;">
                    <div id="profile-avatar-preview" style="width: 55px; height: 55px; border-radius: 50%; background: #222; border: 2px solid #d4a359; background-size: cover; background-position: center; ${playerAvatarData ? 'background-image: url(' + playerAvatarData + ');' : ''}"></div>
                    <div style="flex: 1;">
                        <div style="font-size: 12px; color: #8d99ae;">ПРОФИЛЬ БОЙЦА</div>
                        <div id="profile-nick-display" style="font-weight: bold; font-size: 15px; color: #fff; margin-bottom: 4px;">Сталкер</div>
                        <label style="font-size: 10px; background: #bc6c25; color: #fff; padding: 4px 8px; border-radius: 4px; cursor: pointer; display: inline-block;">
                            Сменить фото <input type="file" id="input-avatar-file" accept="image/*" style="display: none;">
                        </label>
                    </div>
                </div>

                <div style="margin-bottom: 15px;">
                    <label style="font-size: 11px; color: #a3b18a; display: block; margin-bottom: 5px;">МАСШТАБ HUD И ИНТЕРФЕЙСА</label>
                    <input type="range" id="scale-slider" min="0.7" max="1.3" step="0.05" value="1.0" style="width: 100%; cursor: pointer;">
                </div>

                <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 20px;">
                    <button id="btn-edit-hud-pos" style="padding: 10px; background: #386641; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 12px;">Настроить позиции HUD (Перетаскивание)</button>
                    <button id="btn-return-menu" style="padding: 10px; background: #7f4f24; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 12px;">Выйти в главное меню</button>
                    <button id="btn-close-modal" style="padding: 10px; background: #333931; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 12px;">Закрыть настройки</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('input-avatar-file').addEventListener('change', (e) => {
            let file = e.target.files[0];
            if (file) {
                let reader = new FileReader();
                reader.onload = function(event) {
                    playerAvatarData = event.target.result;
                    localStorage.setItem('stalker_avatar', playerAvatarData);
                    document.getElementById('profile-avatar-preview').style.backgroundImage = `url(${playerAvatarData})`;
                };
                reader.readAsDataURL(file);
            }
        });

        document.getElementById('scale-slider').addEventListener('input', (e) => {
            let val = e.target.value;
            window.gameSettings.hudScale = parseFloat(val);
            localStorage.setItem('game_hud_scale', val);
            applyHUDScale(val);
        });

        document.getElementById('btn-edit-hud-pos').addEventListener('click', () => {
            document.getElementById('game-settings-modal').style.display = 'none';
            isCustomizing = true;
            stopAutofire();
            document.body.classList.add('edit-mode');
            const exitBtn = document.getElementById('btn-exit-edit');
            if (exitBtn) exitBtn.style.display = 'block';
            if (document.pointerLockElement) document.exitPointerLock();
        });

        document.getElementById('btn-return-menu').addEventListener('click', () => {
            if (socket) socket.disconnect();
            location.reload();
        });

        document.getElementById('btn-close-modal').addEventListener('click', () => {
            document.getElementById('game-settings-modal').style.display = 'none';
            document.body.requestPointerLock();
        });
    }
}

function applyHUDScale(scale) { 
    const el = document.getElementById('hud-scalable-wrapper');
    if(el) el.style.transform = `scale(${scale})`; 
}

function initEngine() {
    const container = document.getElementById('canvas-container'); if (!container) return;
    scene = new THREE.Scene(); 
    
    scene.background = new THREE.Color(0x3a403b); 
    scene.fog = new THREE.FogExp2(0x3a403b, 0.012);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    pitchObject.add(camera); yawObject.add(pitchObject); scene.add(yawObject);
    
    renderer = new THREE.WebGLRenderer({ antialias: true }); 
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    
    scene.add(new THREE.HemisphereLight(0xddeeff, 0x334422, 0.7));
    let dirLight = new THREE.DirectionalLight(0xfff5e6, 0.9); 
    dirLight.position.set(40, 80, 40); 
    dirLight.castShadow = true;
    scene.add(dirLight);
    
    buildMap(); createWeapon(); animate();
}

function createWeapon() {
    if (!camera) return;
    let weaponGroup = new THREE.Group();
    updateWeaponMesh(currentWeaponKey);
    weaponGroup.position.set(0.2, -0.18, -0.4); 
    camera.add(weaponGroup); 
    weaponMesh = weaponGroup;
}

function createObstacle(x, y, z, w, h, d, color) {
    let mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: color, roughness: 0.8 }));
    mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh); mapObjects.push(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
}

function spawnLoot(x, z, type) {
    let color = type === 'medkit' ? 0xe63946 : 0xf4a261;
    let mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.5), new THREE.MeshStandardMaterial({ color: color, roughness: 0.5 }));
    mesh.position.set(x, 0.15, z);
    scene.add(mesh);
    lootItems.push({ mesh: mesh, type: type, x: x, z: z });
}

function checkLootPickups() {
    if (!yawObject) return;
    let px = yawObject.position.x;
    let pz = yawObject.position.z;

    for (let i = lootItems.length - 1; i >= 0; i--) {
        let item = lootItems[i];
        let dist = Math.sqrt((px - item.x)**2 + (pz - item.z)**2);
        if (dist < 1.5) {
            if (item.type === 'medkit') {
                hp = Math.min(100, hp + 40);
            } else if (item.type === 'ammo') {
                reserveAmmo += 60;
                weaponState[currentWeaponKey].reserve += 60;
            }
            updateHUD();
            scene.remove(item.mesh);
            lootItems.splice(i, 1);
        }
    }
}

function buildMap() {
    mapObjects.forEach(obj => scene.remove(obj)); mapObjects = []; colliders = [];
    lootItems.forEach(item => scene.remove(item.mesh)); lootItems = [];

    let floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ color: 0x2b3028, roughness: 0.9 })); 
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    scene.add(floor); mapObjects.push(floor);
    
    createObstacle(0, 4, -120, 240, 8, 2, 0x262a24); createObstacle(0, 4, 120, 240, 8, 2, 0x262a24);
    createObstacle(-120, 4, 0, 2, 8, 240, 0x262a24); createObstacle(120, 4, 0, 2, 8, 240, 0x262a24);

    createObstacle(0, 8, 0, 24, 16, 24, 0x454842); 
    createObstacle(0, 6, -50, 12, 12, 12, 0x383b35);
    createObstacle(40, 4, 30, 15, 8, 15, 0x383b35);
    createObstacle(-40, 4, -30, 15, 8, 15, 0x383b35);

    spawnLoot(10, 10, 'medkit');
    spawnLoot(-10, -10, 'ammo');
}

function updateHUD() {
    let hpEl = document.getElementById('val-hp');
    let armorEl = document.getElementById('val-armor');
    let ammoEl = document.getElementById('val-ammo');
    let killsEl = document.getElementById('val-kills');
    let modeEl = document.getElementById('val-mode');

    if (hpEl) hpEl.innerText = Math.max(0, hp);
    if (armorEl) armorEl.innerText = Math.max(0, armor);
    if (ammoEl) ammoEl.innerText = currentWeaponKey === 'knife' ? '∞' : `${ammo} / ${reserveAmmo}`;
    if (killsEl) killsEl.innerText = kills;
    if (modeEl) modeEl.innerText = currentGameMode.toUpperCase();
}

function setupControls() {
    window.addEventListener('keydown', (e) => {
        if (e.code === 'KeyW') moveDirection.forward = 1;
        if (e.code === 'KeyS') moveDirection.forward = -1;
        if (e.code === 'KeyA') moveDirection.right = -1;
        if (e.code === 'KeyD') moveDirection.right = 1;
        if (e.code === 'Space' && isGrounded) { playerVelocity.y = JUMP_FORCE; isGrounded = false; }
        if (e.code === 'KeyR') reloadWeapon();
        if (e.code === 'Digit1') window.switchWeapon('knife');
        if (e.code === 'Digit2') window.switchWeapon('pistol');
        if (e.code === 'Digit3') window.switchWeapon('rifle');
    });

    window.addEventListener('keyup', (e) => {
        if (e.code === 'KeyW' || e.code === 'KeyS') moveDirection.forward = 0;
        if (e.code === 'KeyA' || e.code === 'KeyD') moveDirection.right = 0;
    });

    window.addEventListener('mousedown', (e) => {
        if (e.button === 0 && !isCustomizing) startAutofire();
    });
    window.addEventListener('mouseup', () => stopAutofire());

    window.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement === document.body && !isCustomizing) {
            yawObject.rotation.y -= e.movementX * window.gameSettings.sensitivity;
            pitchObject.rotation.x -= e.movementY * window.gameSettings.sensitivity;
            pitchObject.rotation.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitchObject.rotation.x));
        }
    });

    if (renderer && renderer.domElement) {
        renderer.domElement.addEventListener('click', () => {
            if (!isCustomizing && document.getElementById('game-settings-modal').style.display !== 'flex') {
                document.body.requestPointerLock();
            }
        });
    }
}

function startAutofire() {
    if (fireIntervalId || isReloading) return;
    shoot();
    let rate = WEAPONS[currentWeaponKey].fireRate;
    fireIntervalId = setInterval(shoot, rate);
}

function stopAutofire() {
    if (fireIntervalId) { clearInterval(fireIntervalId); fireIntervalId = null; }
}

function reloadWeapon() {
    if (isReloading || currentWeaponKey === 'knife' || reserveAmmo <= 0 || ammo === WEAPONS[currentWeaponKey].ammo) return;
    isReloading = true;
    setTimeout(() => {
        let needed = WEAPONS[currentWeaponKey].ammo - ammo;
        let took = Math.min(needed, reserveAmmo);
        ammo += took;
        reserveAmmo -= took;
        weaponState[currentWeaponKey].ammo = ammo;
        weaponState[currentWeaponKey].reserve = reserveAmmo;
        isReloading = false;
        updateHUD();
    }, 1500);
}

function shoot() {
    if (hp <= 0 || isReloading) return;
    if (currentWeaponKey !== 'knife' && ammo <= 0) { reloadWeapon(); return; }

    if (currentWeaponKey !== 'knife') {
        ammo--;
        weaponState[currentWeaponKey].ammo = ammo;
        updateHUD();
    }

    if (weaponMesh) {
        weaponMesh.position.z += 0.05;
        setTimeout(() => { if (weaponMesh) weaponMesh.position.z -= 0.05; }, 50);
    }

    let raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

    let targets = [];
    for (let id in remotePlayers) remotePlayers[id].traverse(c => { if(c.isMesh) targets.push(c); });
    for (let id in remoteBots) remoteBots[id].traverse(c => { if(c.isMesh) targets.push(c); });

    let intersects = raycaster.intersectObjects(targets);
    if (intersects.length > 0) {
        let hit = intersects[0];
        let targetGroup = hit.object;
        while (targetGroup.parent && !targetGroup.userData.targetId) {
            targetGroup = targetGroup.parent;
        }
        let targetId = targetGroup.userData ? targetGroup.userData.targetId : null;
        if (targetId && socket) {
            let isHead = hit.object.userData && hit.object.userData.zone === 'head';
            let dmg = WEAPONS[currentWeaponKey].damage * (isHead ? 2 : 1);
            socket.emit('shootHit', { targetId: targetId, damage: dmg });
        }
    }
}

function animate() {
    requestAnimationFrame(animate);

    let delta = 0.016;
    
    // Физика и движение
    playerVelocity.y -= GRAVITY * delta;
    
    let moveVector = new THREE.Vector3(moveDirection.right, 0, -moveDirection.forward).normalize();
    moveVector.applyQuaternion(yawObject.quaternion);
    
    let speed = isCrouching ? crouchSpeed : moveSpeed;
    yawObject.position.x += moveVector.x * speed * delta;
    yawObject.position.z += moveVector.z * speed * delta;
    yawObject.position.y += playerVelocity.y * delta;

    if (yawObject.position.y <= 3.0) {
        yawObject.position.y = 3.0;
        playerVelocity.y = 0;
        isGrounded = true;
    }

    if (socket && socket.connected) {
        socket.emit('playerMove', {
            x: yawObject.position.x,
            y: yawObject.position.y,
            z: yawObject.position.z,
            rotY: yawObject.rotation.y,
            pitch: pitchObject.rotation.x
        });
    }

    renderer.render(scene, camera);
}

// ----------------------------------------------------------------------------
// РЕЖИМ ПЕРЕТАСКИВАНИЯ (DRAG & DROP) И СОХРАНЕНИЕ POSITIONS
// ----------------------------------------------------------------------------

function loadHUDPositions() {
    if (!document.getElementById('btn-exit-edit')) {
        const exitEditBtn = document.createElement('div');
        exitEditBtn.id = 'btn-exit-edit';
        exitEditBtn.innerHTML = '💾 СОХРАНИТЬ И ВЫЙТИ';
        exitEditBtn.style.cssText = 'position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #bc6c25; color: white; padding: 12px 24px; border-radius: 5px; font-family: monospace; font-weight: bold; font-size: 15px; cursor: pointer; display: none; z-index: 100000; border: 2px solid #fff; box-shadow: 0 0 10px rgba(0,0,0,0.8);';
        document.body.appendChild(exitEditBtn);

        exitEditBtn.addEventListener('click', () => {
            isCustomizing = false;
            document.body.classList.remove('edit-mode');
            exitEditBtn.style.display = 'none';
            document.body.requestPointerLock();
        });
    }

    document.querySelectorAll('.hud-element').forEach(el => {
        let savedPos = localStorage.getItem('hud_pos_' + el.id);
        if (savedPos) {
            try {
                let coords = JSON.parse(savedPos);
                el.style.left = coords.left;
                el.style.top = coords.top;
                el.style.right = 'auto';
                el.style.bottom = 'auto';
            } catch(e) {}
        }
    });

    window.addEventListener('mousedown', (e) => {
        if (!isCustomizing) return;
        let target = e.target.closest('.hud-element');
        if (target) {
            draggedElement = target;
            let rect = draggedElement.getBoundingClientRect();
            dragOffsetX = e.clientX - rect.left;
            dragOffsetY = e.clientY - rect.top;
            draggedElement.style.right = 'auto';
            draggedElement.style.bottom = 'auto';
        }
    });

    window.addEventListener('mousemove', (e) => {
        if (!isCustomizing || !draggedElement) return;
        let newX = e.clientX - dragOffsetX;
        let newY = e.clientY - dragOffsetY;
        draggedElement.style.left = newX + 'px';
        draggedElement.style.top = newY + 'px';
    });

    window.addEventListener('mouseup', () => {
        if (draggedElement) {
            if (draggedElement.id) {
                localStorage.setItem('hud_pos_' + draggedElement.id, JSON.stringify({
                    left: draggedElement.style.left,
                    top: draggedElement.style.top
                }));
            }
            draggedElement = null;
        }
    });
}
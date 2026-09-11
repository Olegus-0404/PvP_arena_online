// ============================================================================
// GAME CLIENT CORE: S.T.A.L.K.E.R. Zone Atmosphere Edition (Fixed HUD & Weapons)
// ============================================================================

const DEFAULT_SERVER_URL = "https://pvp-arena-online.onrender.com"; 
let SERVER_URL = DEFAULT_SERVER_URL;
let socket = null;

let myId = null, myNick = "", currentGameMode = "survival";
let currentLobbyId = null;
let hp = 100, armor = 100, kills = 0, isReloading = false;

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

let joystickTouchId = null, lookTouchId = null;
let lastLookX = 0, lastLookY = 0;
let fireIntervalId = null;
let isCrouching = false, isCustomizing = false;

let lastRadarPingTime = 0;
const RADAR_PING_INTERVAL = 2500;

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
    
    // Подсветка активного оружия в интерфейсе
    ['knife', 'pistol', 'rifle'].forEach(w => {
        let el = document.getElementById(`slot-${w}`);
        if(el) el.style.border = w === weaponKey ? '2px solid #d4a359' : '1px solid #333931';
    });

    updateHUD();
    updateWeaponMesh(weaponKey);
};

function updateWeaponMesh(key) {
    if (!camera || !weaponMesh) return;
    while(weaponMesh.children.length > 0) { 
        weaponMesh.remove(weaponMesh.children[0]); 
    }
    
    let mat = new THREE.MeshStandardMaterial({ color: 0x111311, roughness: 0.8, metalness: 0.6 });
    if (key === 'knife') {
        let blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.2, 0.05), mat);
        blade.position.set(0, 0, -0.2);
        weaponMesh.add(blade);
    } else if (key === 'pistol') {
        let p = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.25), mat);
        p.position.set(0, -0.05, -0.2);
        weaponMesh.add(p);
    } else {
        let barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5), mat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0, -0.25);
        weaponMesh.add(barrel);
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

// Полноценное главное меню при входе
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

        // Автоматический полноэкранный режим при входе
        const docEl = document.documentElement;
        if (docEl.requestFullscreen) {
            docEl.requestFullscreen().catch(err => console.log("Fullscreen request blocked:", err));
        } else if (docEl.webkitRequestFullscreen) {
            docEl.webkitRequestFullscreen();
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
        if (yawObject) yawObject.position.set(spawnPos.x || 0, 1.7, spawnPos.z || 30);
        hp = 100; armor = 100; ammo = WEAPONS[currentWeaponKey].ammo; reserveAmmo = WEAPONS[currentWeaponKey].maxReserve; updateHUD(); 
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

// Автоматическая инъекция недостающих кнопок интерфейса прямо в DOM при запуске
window.addEventListener('DOMContentLoaded', () => {
    injectMissingHUDUI();
    initAuthScreen();
    initEngine(); 
    setupControls(); 
    loadHUDPositions(); 
    loadCrosshairSettings();
    
    let savedNick = localStorage.getItem('stalker_nick');
    if (savedNick && document.getElementById('input-nick')) {
        document.getElementById('input-nick').value = savedNick;
    }
    
    setInterval(() => { checkLootPickups(); }, 100);

    let savedScale = localStorage.getItem('game_hud_scale');
    if (savedScale) { window.gameSettings.hudScale = parseFloat(savedScale); document.getElementById('scale-slider').value = savedScale; applyHUDScale(savedScale); }
});

// Добавляет панели оружия сверху по центру (как счетчик килов в CS) и кнопку меню настроек
function injectMissingHUDUI() {
    const wrapper = document.getElementById('hud-scalable-wrapper') || document.body;
    
    if (!document.getElementById('cs-top-scoreboard')) {
        const topBoard = document.createElement('div');
        topBoard.id = 'cs-top-scoreboard';
        topBoard.className = 'hud-element';
        topBoard.style.cssText = 'position: fixed; top: 10px; left: 50%; transform: translateX(-50%); background: rgba(18,20,18,0.85); border: 1px solid #333931; padding: 6px 15px; border-radius: 4px; display: flex; gap: 20px; align-items: center; color: #e6dfcc; font-family: monospace; font-size: 13px; z-index: 1000;';
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
        weaponBar.style.cssText = 'position: fixed; top: 10px; right: 20px; display: flex; gap: 8px; z-index: 1000; font-family: monospace;';
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

function buildMap() {
    mapObjects.forEach(obj => scene.remove(obj)); mapObjects = []; colliders = [];
    lootItems.forEach(item => scene.remove(item.mesh)); lootItems = [];

    let floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), new THREE.MeshStandardMaterial({ color: 0x2b3028, roughness: 0.9 })); 
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;
    scene.add(floor); mapObjects.push(floor);
    
    createObstacle(0, 4, -120, 240, 8, 2, 0x262a24); createObstacle(0, 4, 120, 240, 8, 2, 0x262a24);
    createObstacle(-120, 4, 0, 2, 8, 240, 0x262a24); createObstacle(120, 4, 0, 2, 8, 240, 0x262a24);

    createObstacle(0, 8, 0, 24, 16, 24, 0x454842); 
    let sarco = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 10), new THREE.MeshStandardMaterial({ color: 0x5a4836, roughness: 0.8 }));
    sarco.position.set(0, 19, 0); scene.add(sarco); mapObjects.push(sarco); colliders.push(new THREE.Box3().setFromObject(sarco));

    createObstacle(0, 6, -50, 12, 12, 12, 0x383b35);
    createObstacle(-16, 5, -55, 10, 10, 10, 0x383b35);
    createObstacle(16, 7, -55, 10, 14, 10, 0x383b35);

    spawnLoot(0, 0.4, -25, 'medkit', 0x51cf66);    
    spawnLoot(-45, 0.4, 40, 'ammo', 0xd4a359);     
    spawnLoot(40, 0.4, 30, 'armor', 0x4dabf7);     
}

function createObstacle(x, y, z, w, h, d, color) {
    let mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: color, roughness: 0.8 })); 
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh); mapObjects.push(mesh); colliders.push(new THREE.Box3().setFromObject(mesh));
}

function spawnLoot(x, y, z, type, colorHex) {
    let geo = new THREE.BoxGeometry(0.6, 0.4, 0.6);
    let mat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.4 });
    let mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, y, z); scene.add(mesh);
    lootItems.push({ mesh: mesh, type: type, x: x, y: y, z: z, baseHeight: y, seed: Math.random() * 100 });
}

function checkWallCollisions(newPos) {
    let pr = 0.4;
    let playerBox = new THREE.Box3(
        new THREE.Vector3(newPos.x - pr, newPos.y - 1.6, newPos.z - pr), 
        new THREE.Vector3(newPos.x + pr, newPos.y + 0.2, newPos.z + pr)
    );
    for (let i = 0; i < colliders.length; i++) { 
        if (playerBox.intersectsBox(colliders[i])) return true; 
    }
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
            else if (item.type === 'ammo' && reserveAmmo < WEAPONS[currentWeaponKey].maxReserve) { 
                reserveAmmo = WEAPONS[currentWeaponKey].maxReserve; 
                pickedUp = true; 
            }
            
            if (pickedUp) {
                updateHUD();
                let pickedMesh = item.mesh; scene.remove(pickedMesh);
                lootItems.splice(i, 1);
                setTimeout(() => { if (scene) { scene.add(pickedMesh); lootItems.push(item); } }, 12000);
            }
        }
    }
}

function performShot() {
    if (isReloading || hp <= 0 || !myId || isCustomizing) return;
    let weapon = WEAPONS[currentWeaponKey];
    if (ammo <= 0 && weapon.ammo !== Infinity) { stopAutofire(); startReload(); return; }
    
    if (weapon.ammo !== Infinity) ammo--;
    updateHUD();

    if(weaponMesh) { 
        weaponMesh.position.z = -0.33; 
        setTimeout(() => weaponMesh.position.z = -0.4, 40); 
    }

    let raycaster = new THREE.Raycaster(); 
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    let targets = [];
    if (currentGameMode === 'coop') { 
        for (let id in remoteBots) { targets.push(...remoteBots[id].children); } 
    } else { 
        for (let id in remotePlayers) { targets.push(...remotePlayers[id].children); } 
    }
    
    let intersects = raycaster.intersectObjects(targets);
    if (intersects.length > 0 && socket) {
        let hitObj = intersects[0].object;
        if (hitObj.userData && hitObj.userData.targetId) { 
            socket.emit('playerHit', { targetId: hitObj.userData.targetId, zone: hitObj.userData.zone || 'body' }); 
        }
    }
}

function startAutofire() { 
    if (fireIntervalId !== null) return; 
    performShot(); 
    fireIntervalId = setInterval(performShot, WEAPONS[currentWeaponKey].fireRate); 
}
function stopAutofire() { if (fireIntervalId !== null) { clearInterval(fireIntervalId); fireIntervalId = null; } }

function startReload() {
    let weapon = WEAPONS[currentWeaponKey];
    if (isReloading || weapon.ammo === Infinity || ammo === weapon.ammo || reserveAmmo <= 0) return;
    isReloading = true; updateHUD();
    setTimeout(() => { 
        let needed = weapon.ammo - ammo; 
        let transfer = Math.min(needed, reserveAmmo); 
        ammo += transfer; 
        reserveAmmo -= transfer; 
        isReloading = false; 
        updateHUD(); 
    }, 1200);
}

function updateHUD() {
    if(document.getElementById('val-hp')) document.getElementById('val-hp').innerText = hp;
    if(document.getElementById('val-armor')) document.getElementById('val-armor').innerText = armor;
    if(document.getElementById('val-ammo')) {
        let weapon = WEAPONS[currentWeaponKey];
        document.getElementById('val-ammo').innerText = isReloading ? `ПЕРЕЗАРЯДКА` : (weapon.ammo === Infinity ? `БЕСКОНЕЧНО` : `${ammo} / ${reserveAmmo}`);
    }
    if(document.getElementById('val-kills')) document.getElementById('val-kills').innerText = kills;
}

document.getElementById('btn-respawn')?.addEventListener('click', () => { if(socket) socket.emit('requestRespawn'); });

function loadCrosshairSettings() {
    const crosshair = document.getElementById('game-crosshair'); if(!crosshair) return;
    let color = localStorage.getItem('ch_color') || '#ffffff';
    let size = localStorage.getItem('ch_size') || '5';
    let shape = localStorage.getItem('ch_shape') || '50%';

    crosshair.style.background = color;
    crosshair.style.width = size + 'px'; crosshair.style.height = size + 'px';
    crosshair.style.borderRadius = shape;
}

function setupControls() {
    const jZone = document.getElementById('joystick-zone'), stick = document.getElementById('joystick-stick');
    const customMenu = document.getElementById('customizer-menu');

    // Навешиваем клик на кнопку шестеренки для открытия настроек HUD
    document.addEventListener('click', (e) => {
        if (e.target && e.target.id === 'btn-menu-trigger') {
            if (isCustomizing) return; 
            isCustomizing = true; stopAutofire(); 
            if(customMenu) customMenu.style.display = 'block';
            document.body.classList.add('edit-mode');
        }
    });

    if(document.getElementById('btn-save-hud')) {
        document.getElementById('btn-save-hud').addEventListener('click', () => { 
            isCustomizing = false; document.body.classList.remove('edit-mode'); if(customMenu) customMenu.style.display = 'none'; 
            saveHUDPositions();
        });
    }

    if(document.getElementById('btn-fullscreen-toggle')) {
        document.getElementById('btn-fullscreen-toggle').addEventListener('click', () => {
            const docEl = document.documentElement;
            if (!document.fullscreenElement) {
                if (docEl.requestFullscreen) docEl.requestFullscreen().catch(err => console.log(err));
            } else {
                if (document.exitFullscreen) document.exitFullscreen();
            }
        });
    }

    document.getElementById('btn-fire')?.addEventListener('touchstart', (e) => { if(!isCustomizing){ e.preventDefault(); startAutofire(); } });
    document.getElementById('btn-fire')?.addEventListener('touchend', (e) => { if(!isCustomizing){ e.preventDefault(); stopAutofire(); } });
    document.getElementById('btn-reload')?.addEventListener('touchstart', (e) => { if(!isCustomizing){ e.preventDefault(); startReload(); } });
    document.getElementById('btn-jump')?.addEventListener('touchstart', (e) => { if(!isCustomizing){ e.preventDefault(); if(isGrounded) playerVelocity.y = JUMP_FORCE; } });
    document.getElementById('btn-crouch')?.addEventListener('touchstart', (e) => { 
        if(!isCustomizing){ e.preventDefault(); isCrouching = !isCrouching; }
    });

    if (jZone) {
        jZone.addEventListener('touchstart', (e) => { if(!isCustomizing){ e.stopPropagation(); let t = e.targetTouches[0]; joystickTouchId = t.identifier; updateJoystick(t); } });
        jZone.addEventListener('touchmove', (e) => { if(!isCustomizing){ e.stopPropagation(); for(let t of e.touches) { if(t.identifier === joystickTouchId) updateJoystick(t); } } });
        jZone.addEventListener('touchend', () => { if(!isCustomizing){ joystickTouchId = null; if(stick) stick.style.transform = `translate(0px, 0px)`; moveDirection.forward = 0; moveDirection.right = 0; } });
    }

    function updateJoystick(touch) {
        let rect = jZone.getBoundingClientRect(); 
        let dx = touch.clientX - (rect.left + rect.width / 2);
        let dy = touch.clientY - (rect.top + rect.height / 2);
        let dist = Math.sqrt(dx*dx + dy*dy); 
        if (dist > 40) { dx = (dx / dist) * 40; dy = (dy / dist) * 40; }
        if (stick) stick.style.transform = `translate(${dx}px, ${dy}px)`; 
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
}

function saveHUDPositions() { let layout = {}; document.querySelectorAll('.hud-element').forEach(el => { if(el.id!=="game-crosshair" && el.id!=="joystick-zone") layout[el.id] = { left: el.style.left, top: el.style.top }; }); localStorage.setItem('hud_layout_universal', JSON.stringify(layout)); }
function loadHUDPositions() { let saved = localStorage.getItem('hud_layout_universal'); if (!saved) return; let layout = JSON.parse(saved); for (let id in layout) { let el = document.getElementById(id); if (el && layout[id].left) { el.style.left = layout[id].left; el.style.top = layout[id].top; el.style.right = 'auto'; el.style.bottom = 'auto'; el.style.transform = 'none'; } } }

let clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate); if (!renderer || !scene || !camera) return;
    let delta = clock.getDelta(); if (delta > 0.1) delta = 0.1;
    lootItems.forEach(item => { item.mesh.rotation.y += 1.0 * delta; item.mesh.position.y = item.baseHeight + Math.sin(Date.now() * 0.002 + item.seed) * 0.08; });

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
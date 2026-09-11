// ============================================================================
// GAME CLIENT CORE: S.T.A.L.K.E.R. Zone Atmosphere Edition (Fixed Physics & Drag)
// ============================================================================

const DEFAULT_SERVER_URL = "https://pvp-arena-online.onrender.com"; 
let SERVER_URL = DEFAULT_SERVER_URL;
let socket = null;

let myId = null, myNick = "", currentGameMode = "survival";
let currentLobbyId = null;
let hp = 100, armor = 100, kills = 0, isReloading = false;
let playerAvatarData = localStorage.getItem('stalker_avatar') || '';

const WEAPONS = {
    knife: { name: "Нож", damage: 35, fireRate: 500, ammo: Infinity, maxReserve: 0 },
    pistol: { name: "ПМ", damage: 25, fireRate: 300, ammo: 8, maxReserve: 32 },
    rifle: { name: "АК-47", damage: 45, fireRate: 110, ammo: 30, maxReserve: 120 }
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
let moveSpeed = 6.0;     
let crouchSpeed = 2.0;   

let fireIntervalId = null;
let isCrouching = false, isCustomizing = false;

let draggedElement = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

window.gameSettings = { sensitivity: 0.0035, hudScale: 1.0 };

window.selectGameMode = function(mode) {
    currentGameMode = mode;
    ['coop', 'pvp', 'surv'].forEach(m => {
        let btn = document.getElementById(`menu-mode-${m}`);
        if (btn) btn.style.background = (mode === m || (mode==='survival' && m==='surv')) ? '#386641' : '#2b3a28';
    });
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

function updateWeaponMesh(key) {
    if (!camera || !weaponMesh) return;
    while(weaponMesh.children.length > 0) weaponMesh.remove(weaponMesh.children[0]);
    
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
        weaponMesh.add(receiver); weaponMesh.add(handguard); weaponMesh.add(mag); weaponMesh.add(stock);
    }
}

function initAuthScreen() {
    const authScreen = document.getElementById('auth-screen');
    if (!authScreen) return;

    authScreen.innerHTML = `
        <div class="auth-wrapper" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: linear-gradient(rgba(10,12,10,0.88), rgba(10,12,10,0.96)), #111; display: flex; justify-content: center; align-items: center; z-index: 9999; font-family: monospace; color: #e6dfcc;">
            <div class="auth-container" style="background: rgba(18, 20, 18, 0.95); padding: 30px; border-radius: 10px; border: 1px solid #434c3e; width: 400px;">
                <h1 style="margin-top: 0; color: #d4a359; text-align: center; letter-spacing: 3px; font-size: 22px;">S.T.A.L.K.E.R: ЧЗО</h1>
                
                <div style="margin-bottom: 12px;">
                    <label style="font-size: 11px; color: #a3b18a; display: block; margin-bottom: 4px;">ПОЗЫВНОЙ</label>
                    <input type="text" id="input-nick" placeholder="Введите позывной..." maxlength="15" style="width: 100%; padding: 10px; background: #111311; border: 1px solid #333931; color: #fff; border-radius: 5px; box-sizing: border-box;">
                </div>

                <div style="margin-bottom: 12px;">
                    <label style="font-size: 11px; color: #a3b18a; display: block; margin-bottom: 4px;">СЕРВЕР</label>
                    <select id="select-server" style="width: 100%; padding: 10px; background: #111311; border: 1px solid #333931; color: #fff; border-radius: 5px; box-sizing: border-box;">
                        <option value="https://pvp-arena-online.onrender.com">Основной Сервер</option>
                    </select>
                </div>

                <button id="btn-auth" style="width: 100%; padding: 13px; background: #bc6c25; color: white; border: none; font-weight: bold; border-radius: 5px; cursor: pointer; font-size: 14px; margin-top: 15px;">ВОЙТИ В ЗОНУ</button>
            </div>
        </div>
    `;

    document.getElementById('btn-auth').addEventListener('click', () => {
        let nickname = document.getElementById('input-nick').value.trim();
        if (nickname.length < 2) return alert("Позывной слишком короткий!");
        myNick = nickname;
        localStorage.setItem('stalker_nick', myNick);
        document.getElementById('auth-screen').style.display = 'none';
        connectToServer();
        document.body.requestPointerLock();
    });
}

function connectToServer() {
    socket = io(SERVER_URL, {
        transports: ['polling', 'websocket'],
        query: { nick: myNick, mode: currentGameMode }
    });

    socket.on('connect', () => { myId = socket.id; });
    socket.on('init', (spawnPos) => { 
        if (yawObject) {
            yawObject.position.set(spawnPos.x || 0, 3.5, spawnPos.z || 30);
            playerVelocity.set(0, 0, 0);
        }
        hp = 100; armor = 100;
        updateHUD(); 
    });
}

window.addEventListener('DOMContentLoaded', () => {
    injectMissingHUDUI();
    initAuthScreen();
    initEngine(); 
    setupControls(); 
    loadHUDPositions(); 
});

function injectMissingHUDUI() {
    // Внедряем стили для запрета выделения текста и правильного клика
    const style = document.createElement('style');
    style.innerHTML = `
        .hud-element {
            user-select: none !important;
            -webkit-user-select: none !important;
            touch-action: none;
        }
        body.edit-mode .hud-element {
            outline: 2px dashed #d4a359 !important;
            cursor: move !important;
        }
    `;
    document.head.appendChild(style);

    const wrapper = document.getElementById('hud-scalable-wrapper') || document.body;
    
    // Помечаем существующие элементы HUD как перетаскиваемые
    document.querySelectorAll('#hud-hp-box, #hud-ammo-box, #minimap-container').forEach(el => {
        el.classList.add('hud-element');
    });

    if (!document.getElementById('btn-exit-edit')) {
        const exitEditBtn = document.createElement('div');
        exitEditBtn.id = 'btn-exit-edit';
        exitEditBtn.innerHTML = '💾 СОХРАНИТЬ И ВЫЙТИ';
        exitEditBtn.style.cssText = 'position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: #bc6c25; color: white; padding: 14px 28px; border-radius: 6px; font-family: monospace; font-weight: bold; font-size: 16px; cursor: pointer; display: none; z-index: 100000; border: 2px solid #fff; box-shadow: 0 0 15px rgba(0,0,0,0.9);';
        document.body.appendChild(exitEditBtn);

        exitEditBtn.addEventListener('click', () => {
            isCustomizing = false;
            document.body.classList.remove('edit-mode');
            exitEditBtn.style.display = 'none';
            document.body.requestPointerLock();
        });
    }

    if (!document.getElementById('game-settings-modal')) {
        const modal = document.createElement('div');
        modal.id = 'game-settings-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); display: none; justify-content: center; align-items: center; z-index: 99999; font-family: monospace; color: #e6dfcc;';
        modal.innerHTML = `
            <div style="background: rgba(18,20,18,0.98); border: 1px solid #434c3e; padding: 25px; border-radius: 8px; width: 380px;">
                <h3 style="color: #d4a359; margin-top: 0; text-align: center;">НАСТРОЙКИ ИНТЕРФЕЙСА</h3>
                <button id="btn-edit-hud-pos" style="width: 100%; padding: 12px; background: #386641; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; margin-bottom: 10px;">Настроить позиции HUD (Перетаскивание)</button>
                <button id="btn-close-modal" style="width: 100%; padding: 10px; background: #333931; color: white; border: none; border-radius: 4px; cursor: pointer;">Вернуться в игру</button>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('btn-edit-hud-pos').addEventListener('click', () => {
            document.getElementById('game-settings-modal').style.display = 'none';
            isCustomizing = true;
            document.body.classList.add('edit-mode');
            document.getElementById('btn-exit-edit').style.display = 'block';
            if (document.pointerLockElement) document.exitPointerLock();
        });

        document.getElementById('btn-close-modal').addEventListener('click', () => {
            document.getElementById('game-settings-modal').style.display = 'none';
            document.body.requestPointerLock();
        });
    }
}

function initEngine() {
    const container = document.getElementById('canvas-container') || document.body;
    scene = new THREE.Scene(); 
    scene.background = new THREE.Color(0x3a403b); 

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    pitchObject.add(camera); 
    yawObject.add(pitchObject); 
    
    // Спавним на безопасной высоте
    yawObject.position.set(0, 3.5, 0);
    scene.add(yawObject);
    
    renderer = new THREE.WebGLRenderer({ antialias: true }); 
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);
    
    scene.add(new THREE.HemisphereLight(0xddeeff, 0x334422, 0.8));
    
    buildMap(); 
    createWeapon(); 
    animate();
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
    let floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x2b3028 })); 
    floor.rotation.x = -Math.PI / 2; 
    scene.add(floor);
}

function updateHUD() {
    let hpEl = document.getElementById('val-hp');
    let ammoEl = document.getElementById('val-ammo');
    if (hpEl) hpEl.innerText = Math.max(0, hp);
    if (ammoEl) ammoEl.innerText = currentWeaponKey === 'knife' ? '∞' : `${ammo} / ${reserveAmmo}`;
}

function setupControls() {
    window.addEventListener('keydown', (e) => {
        if (isCustomizing) return;
        if (e.code === 'KeyW') moveDirection.forward = 1;
        if (e.code === 'KeyS') moveDirection.forward = -1;
        if (e.code === 'KeyA') moveDirection.right = -1;
        if (e.code === 'KeyD') moveDirection.right = 1;
        if (e.code === 'Space' && isGrounded) { playerVelocity.y = JUMP_FORCE; isGrounded = false; }
    });

    window.addEventListener('keyup', (e) => {
        if (e.code === 'KeyW' || e.code === 'KeyS') moveDirection.forward = 0;
        if (e.code === 'KeyA' || e.code === 'KeyD') moveDirection.right = 0;
    });

    window.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement === document.body && !isCustomizing) {
            yawObject.rotation.y -= e.movementX * window.gameSettings.sensitivity;
            pitchObject.rotation.x -= e.movementY * window.gameSettings.sensitivity;
            pitchObject.rotation.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitchObject.rotation.x));
        }
    });

    // Восстановление управления мышью по клику на игровой экран
    window.addEventListener('click', (e) => {
        if (!isCustomizing && document.getElementById('game-settings-modal').style.display !== 'flex') {
            if (document.pointerLockElement !== document.body) {
                document.body.requestPointerLock();
            }
        }
    });
}

function animate() {
    requestAnimationFrame(animate);

    let delta = 0.016;
    
    // Физика гравитации и перемещения
    playerVelocity.y -= GRAVITY * delta;
    
    let moveVector = new THREE.Vector3(moveDirection.right, 0, -moveDirection.forward).normalize();
    moveVector.applyQuaternion(yawObject.quaternion);
    
    yawObject.position.x += moveVector.x * moveSpeed * delta;
    yawObject.position.z += moveVector.z * moveSpeed * delta;
    yawObject.position.y += playerVelocity.y * delta;

    // Выталкивание из текстуры пола
    if (yawObject.position.y <= 3.0) {
        yawObject.position.y = 3.0;
        playerVelocity.y = 0;
        isGrounded = true;
    }

    renderer.render(scene, camera);
}

function loadHUDPositions() {
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
            e.preventDefault();
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
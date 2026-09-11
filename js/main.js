// ============================================================================
// GAME CLIENT CORE: S.T.A.L.K.E.R. Zone Mobile & PC Universal Edition
// ============================================================================

const DEFAULT_SERVER_URL = "https://pvp-arena-online.onrender.com"; 
let SERVER_URL = DEFAULT_SERVER_URL;
let socket = null;

const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

let myId = null, myNick = "", currentGameMode = "survival";
let hp = 100, armor = 100, kills = 0, isReloading = false;

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
let remotePlayers = {}, remoteBots = [];
let moveDirection = { forward: 0, right: 0 };
let playerVelocity = new THREE.Vector3();
let isGrounded = true;

const GRAVITY = 38;      
const JUMP_FORCE = 8.5;  
let moveSpeed = 6.0;     

let fireIntervalId = null;
let isCustomizing = false;

// Drag & Drop
let draggedElement = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

window.gameSettings = { sensitivity: isMobile ? 0.005 : 0.0035 };

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
    
    let metalMat = new THREE.MeshStandardMaterial({ color: 0x2b2d2f, roughness: 0.4 });
    let woodMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.7 });

    if (key === 'knife') {
        let blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.01), metalMat);
        blade.position.set(0, 0.1, 0);
        weaponMesh.add(blade);
    } else {
        let receiver = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.45), metalMat);
        receiver.position.set(0, 0, -0.2);
        let handguard = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.07, 0.25), woodMat);
        handguard.position.set(0, -0.01, -0.38);
        weaponMesh.add(receiver); weaponMesh.add(handguard);
    }
}

function initAuthScreen() {
    const authScreen = document.getElementById('auth-screen');
    if (!authScreen) return;

    authScreen.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: #111; display: flex; justify-content: center; align-items: center; z-index: 9999; font-family: monospace; color: #e6dfcc;">
            <div style="background: rgba(18, 20, 18, 0.95); padding: 20px; border-radius: 10px; border: 1px solid #434c3e; width: 90%; max-width: 360px; text-align: center;">
                <h2 style="color: #d4a359; margin-top: 0;">S.T.A.L.K.E.R: ЧЗО</h2>
                
                <input type="text" id="input-nick" placeholder="Ваш позывной..." maxlength="15" style="width: 100%; padding: 12px; background: #111311; border: 1px solid #333931; color: #fff; border-radius: 5px; box-sizing: border-box; font-size: 16px; margin-bottom: 15px;">

                <button id="btn-auth" style="width: 100%; padding: 14px; background: #bc6c25; color: white; border: none; font-weight: bold; border-radius: 5px; cursor: pointer; font-size: 16px;">ВОЙТИ В ЗОНУ</button>
            </div>
        </div>
    `;

    document.getElementById('btn-auth').addEventListener('click', () => {
        let nickname = document.getElementById('input-nick').value.trim();
        if (nickname.length < 2) return alert("Введите позывной!");
        myNick = nickname;
        localStorage.setItem('stalker_nick', myNick);
        document.getElementById('auth-screen').style.display = 'none';
        connectToServer();
        
        if (!isMobile) {
            document.body.requestPointerLock?.();
        }
    });
}

function connectToServer() {
    if (typeof io === 'undefined') return;
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
    const style = document.createElement('style');
    style.innerHTML = `
        .hud-element {
            user-select: none !important;
            -webkit-user-select: none !important;
            touch-action: none !important;
        }
        body.edit-mode .hud-element {
            outline: 2px dashed #d4a359 !important;
        }
        .mobile-btn {
            position: fixed; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.4);
            color: white; border-radius: 50%; display: flex; justify-content: center; align-items: center;
            font-family: monospace; font-weight: bold; user-select: none; touch-action: none; z-index: 9000;
        }
    `;
    document.head.appendChild(style);

    // Добавляем мобильные кнопки управления
    if (isMobile) {
        // Кнопка стрельбы
        const fireBtn = document.createElement('div');
        fireBtn.className = 'mobile-btn';
        fireBtn.style.cssText += 'bottom: 80px; right: 20px; width: 65px; height: 65px; background: rgba(188, 108, 37, 0.7); font-size: 22px;';
        fireBtn.innerHTML = '🔥';
        document.body.appendChild(fireBtn);

        fireBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startAutofire(); });
        fireBtn.addEventListener('touchend', (e) => { e.preventDefault(); stopAutofire(); });

        // Кнопка прыжка
        const jumpBtn = document.createElement('div');
        jumpBtn.className = 'mobile-btn';
        jumpBtn.style.cssText += 'bottom: 160px; right: 20px; width: 55px; height: 55px; font-size: 18px;';
        jumpBtn.innerHTML = '⬆️';
        document.body.appendChild(jumpBtn);

        jumpBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (isGrounded) { playerVelocity.y = JUMP_FORCE; isGrounded = false; }
        });

        // Кнопка перезарядки
        const reloadBtn = document.createElement('div');
        reloadBtn.className = 'mobile-btn';
        reloadBtn.style.cssText += 'bottom: 225px; right: 25px; width: 45px; height: 45px; font-size: 14px;';
        reloadBtn.innerHTML = '🔄';
        document.body.appendChild(reloadBtn);

        reloadBtn.addEventListener('touchstart', (e) => { e.preventDefault(); reloadWeapon(); });
    }

    // Кнопка Сохранить и Выйти для HUD
    if (!document.getElementById('btn-exit-edit')) {
        const exitEditBtn = document.createElement('div');
        exitEditBtn.id = 'btn-exit-edit';
        exitEditBtn.innerHTML = '💾 СОХРАНИТЬ И ВЫЙТИ';
        exitEditBtn.style.cssText = 'position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%); background: #bc6c25; color: white; padding: 14px 24px; border-radius: 6px; font-family: monospace; font-weight: bold; font-size: 15px; cursor: pointer; display: none; z-index: 100000; border: 2px solid #fff; box-shadow: 0 0 15px rgba(0,0,0,0.9);';
        document.body.appendChild(exitEditBtn);

        const handleExit = (e) => {
            if (e) e.preventDefault();
            isCustomizing = false;
            document.body.classList.remove('edit-mode');
            exitEditBtn.style.display = 'none';
            if (!isMobile) document.body.requestPointerLock?.();
        };

        exitEditBtn.addEventListener('click', handleExit);
        exitEditBtn.addEventListener('touchstart', handleExit);
    }

    // Настройки
    if (!document.getElementById('game-settings-modal')) {
        const modal = document.createElement('div');
        modal.id = 'game-settings-modal';
        modal.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.85); display: none; justify-content: center; align-items: center; z-index: 99999; font-family: monospace; color: #e6dfcc;';
        modal.innerHTML = `
            <div style="background: rgba(18,20,18,0.98); border: 1px solid #434c3e; padding: 20px; border-radius: 8px; width: 90%; max-width: 320px; text-align: center;">
                <h3 style="color: #d4a359; margin-top: 0;">НАСТРОЙКИ HUD</h3>
                <button id="btn-edit-hud-pos" style="width: 100%; padding: 12px; background: #386641; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; margin-bottom: 10px; font-size: 14px;">Двигать HUD (Перетаскивание)</button>
                <button id="btn-close-modal" style="width: 100%; padding: 10px; background: #333931; color: white; border: none; border-radius: 4px; cursor: pointer;">Закрыть</button>
            </div>
        `;
        document.body.appendChild(modal);

        const openEdit = () => {
            document.getElementById('game-settings-modal').style.display = 'none';
            isCustomizing = true;
            document.body.classList.add('edit-mode');
            document.getElementById('btn-exit-edit').style.display = 'block';
            if (!isMobile && document.pointerLockElement) document.exitPointerLock();
        };

        document.getElementById('btn-edit-hud-pos').addEventListener('click', openEdit);
        document.getElementById('btn-close-modal').addEventListener('click', () => {
            document.getElementById('game-settings-modal').style.display = 'none';
            if (!isMobile) document.body.requestPointerLock?.();
        });
    }

    // Инициализация существующих блоков HUD
    setTimeout(() => {
        document.querySelectorAll('#hud-hp-box, #hud-ammo-box, #minimap-container, #cs-top-scoreboard, #weapon-slots-bar, #btn-menu-trigger').forEach(el => {
            el.classList.add('hud-element');
        });
    }, 500);
}

function initEngine() {
    const container = document.getElementById('canvas-container') || document.body;
    scene = new THREE.Scene(); 
    scene.background = new THREE.Color(0x3a403b); 

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    pitchObject.add(camera); 
    yawObject.add(pitchObject); 
    
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
    weaponGroup.position.set(0.18, -0.15, -0.35); 
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
    // Клавиатура (для ПК)
    window.addEventListener('keydown', (e) => {
        if (isCustomizing) return;
        if (e.code === 'KeyW') moveDirection.forward = 1;
        if (e.code === 'KeyS') moveDirection.forward = -1;
        if (e.code === 'KeyA') moveDirection.right = -1;
        if (e.code === 'KeyD') moveDirection.right = 1;
        if (e.code === 'Space' && isGrounded) { playerVelocity.y = JUMP_FORCE; isGrounded = false; }
        if (e.code === 'KeyR') reloadWeapon();
    });

    window.addEventListener('keyup', (e) => {
        if (e.code === 'KeyW' || e.code === 'KeyS') moveDirection.forward = 0;
        if (e.code === 'KeyA' || e.code === 'KeyD') moveDirection.right = 0;
    });

    // Мышь (для ПК)
    window.addEventListener('mousemove', (e) => {
        if (!isMobile && document.pointerLockElement === document.body && !isCustomizing) {
            yawObject.rotation.y -= e.movementX * window.gameSettings.sensitivity;
            pitchObject.rotation.x -= e.movementY * window.gameSettings.sensitivity;
            pitchObject.rotation.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitchObject.rotation.x));
        }
    });

    // Мобильное управление (Тачскрин / Сенсор)
    let touchLookId = null;
    let touchLookLastX = 0, touchLookLastY = 0;

    let joystickTouchId = null;
    let joystickStartX = 0, joystickStartY = 0;

    window.addEventListener('touchstart', (e) => {
        if (isCustomizing) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
            let t = e.changedTouches[i];
            
            // Если касание в левой половине экрана — Джойстик ходьбы
            if (t.clientX < window.innerWidth / 2 && joystickTouchId === null) {
                joystickTouchId = t.identifier;
                joystickStartX = t.clientX;
                joystickStartY = t.clientY;
            } 
            // Если в правой половине — Вращение камеры
            else if (t.clientX >= window.innerWidth / 2 && touchLookId === null) {
                touchLookId = t.identifier;
                touchLookLastX = t.clientX;
                touchLookLastY = t.clientY;
            }
        }
    });

    window.addEventListener('touchmove', (e) => {
        if (isCustomizing) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
            let t = e.changedTouches[i];

            // Джойстик
            if (t.identifier === joystickTouchId) {
                let dx = t.clientX - joystickStartX;
                let dy = t.clientY - joystickStartY;
                moveDirection.right = Math.max(-1, Math.min(1, dx / 40));
                moveDirection.forward = Math.max(-1, Math.min(1, -dy / 40));
            }

            // Камера
            if (t.identifier === touchLookId) {
                let dx = t.clientX - touchLookLastX;
                let dy = t.clientY - touchLookLastY;
                
                yawObject.rotation.y -= dx * window.gameSettings.sensitivity;
                pitchObject.rotation.x -= dy * window.gameSettings.sensitivity;
                pitchObject.rotation.x = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitchObject.rotation.x));

                touchLookLastX = t.clientX;
                touchLookLastY = t.clientY;
            }
        }
    });

    const resetTouches = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            let t = e.changedTouches[i];
            if (t.identifier === joystickTouchId) {
                joystickTouchId = null;
                moveDirection.forward = 0;
                moveDirection.right = 0;
            }
            if (t.identifier === touchLookId) {
                touchLookId = null;
            }
        }
    };

    window.addEventListener('touchend', resetTouches);
    window.addEventListener('touchcancel', resetTouches);
}

function startAutofire() {
    if (fireIntervalId || isReloading) return;
    shoot();
    fireIntervalId = setInterval(shoot, WEAPONS[currentWeaponKey].fireRate);
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
}

function animate() {
    requestAnimationFrame(animate);

    let delta = 0.016;
    
    playerVelocity.y -= GRAVITY * delta;
    
    let moveVector = new THREE.Vector3(moveDirection.right, 0, -moveDirection.forward).normalize();
    moveVector.applyQuaternion(yawObject.quaternion);
    
    yawObject.position.x += moveVector.x * moveSpeed * delta;
    yawObject.position.z += moveVector.z * moveSpeed * delta;
    yawObject.position.y += playerVelocity.y * delta;

    if (yawObject.position.y <= 3.0) {
        yawObject.position.y = 3.0;
        playerVelocity.y = 0;
        isGrounded = true;
    }

    renderer.render(scene, camera);
}

// ----------------------------------------------------------------------------
// UNIVERSAL DRAG & DROP (Touch & Mouse Support)
// ----------------------------------------------------------------------------
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

    // Pointer Events работают одновременно для ПАЛЬЦЕВ и МЫШКИ
    window.addEventListener('pointerdown', (e) => {
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

    window.addEventListener('pointermove', (e) => {
        if (!isCustomizing || !draggedElement) return;
        let newX = e.clientX - dragOffsetX;
        let newY = e.clientY - dragOffsetY;
        draggedElement.style.left = newX + 'px';
        draggedElement.style.top = newY + 'px';
    });

    window.addEventListener('pointerup', () => {
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
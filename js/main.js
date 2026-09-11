// ============================================================================
// GAME CLIENT CORE: S.T.A.L.K.E.R. Zone (Custom UI Fix)
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
let moveDirection = { forward: 0, right: 0 };
let playerVelocity = new THREE.Vector3();
let isGrounded = true;

const GRAVITY = 38;      
const JUMP_FORCE = 8.5;  
let moveSpeed = 6.0;     

let fireIntervalId = null;

window.gameSettings = { sensitivity: isMobile ? 0.005 : 0.0035 };

window.switchWeapon = function(weaponKey) {
    if (!WEAPONS[weaponKey]) return;
    weaponState[currentWeaponKey].ammo = ammo;
    weaponState[currentWeaponKey].reserve = reserveAmmo;

    currentWeaponKey = weaponKey;
    ammo = weaponState[weaponKey].ammo;
    reserveAmmo = weaponState[weaponKey].reserve;
    updateWeaponMesh(weaponKey);
    updateHUD();
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

// Упрощенный авто-вход для теста
window.addEventListener('DOMContentLoaded', () => {
    myNick = localStorage.getItem('stalker_nick') || "Сталкер";
    connectToServer();
    initEngine(); 
    setupControls(); 
    
    // Пытаемся сделать фон страницы прозрачным принудительно
    document.body.style.background = "transparent";
    document.documentElement.style.background = "transparent";
    const container = document.getElementById('canvas-container');
    if (container) container.style.background = "transparent";
});

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

function initEngine() {
    const container = document.getElementById('canvas-container') || document.body;
    scene = new THREE.Scene(); 
    scene.background = new THREE.Color(0x3a403b); // Цвет неба/тумана

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    pitchObject.add(camera); 
    yawObject.add(pitchObject); 
    
    yawObject.position.set(0, 3.5, 0);
    scene.add(yawObject);
    
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); // Включаем прозрачность рендера
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    // ВАЖНО: Фиксируем 3D слой позади всех твоих кнопок
    renderer.domElement.style.position = 'fixed';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.zIndex = '-999';
    renderer.domElement.style.pointerEvents = 'none'; // Чтобы холст не блокировал тапы по кнопкам
    
    container.appendChild(renderer.domElement);
    
    scene.add(new THREE.HemisphereLight(0xddeeff, 0x334422, 0.8));
    
    let floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x2b3028 })); 
    floor.rotation.x = -Math.PI / 2; 
    scene.add(floor);
    
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

function updateHUD() {
    // Если найдет элементы по ID — обновит их
    let hpEl = document.getElementById('val-hp');
    let ammoEl = document.getElementById('val-ammo');
    if (hpEl) hpEl.innerText = Math.max(0, hp);
    if (ammoEl) ammoEl.innerText = currentWeaponKey === 'knife' ? '∞' : `${ammo} / ${reserveAmmo}`;
}

function setupControls() {
    // АВТО-БИНД ТВОИХ HTML КНОПОК ПО ТЕКСТУ ВНУТРИ
    const bindBtn = (text, startFn, endFn) => {
        const elements = Array.from(document.querySelectorAll('*')).filter(el => 
            el.textContent.trim().toUpperCase() === text && el.children.length === 0
        );
        elements.forEach(el => {
            el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); startFn(); });
            if (endFn) {
                el.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); endFn(); });
            }
        });
    };

    // Привязываем логику к кнопкам, которые видно на твоем скрине
    bindBtn('FIRE', startAutofire, stopAutofire);
    bindBtn('JUMP', () => { if (isGrounded) { playerVelocity.y = JUMP_FORCE; isGrounded = false; } });
    bindBtn('RELOAD', reloadWeapon);

    // Мобильное управление (Вращение камеры по экрану)
    let touchLookId = null;
    let touchLookLastX = 0, touchLookLastY = 0;
    
    // Если джойстик не перехватывает касания, это сработает как запасной вариант ходьбы
    let joystickTouchId = null;
    let joystickStartX = 0, joystickStartY = 0;

    window.addEventListener('touchstart', (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            let t = e.changedTouches[i];
            // Игнорируем тапы по кнопкам
            if (t.target.tagName === 'BUTTON' || t.target.closest('.button')) continue;

            if (t.clientX < window.innerWidth / 2 && joystickTouchId === null) {
                joystickTouchId = t.identifier;
                joystickStartX = t.clientX;
                joystickStartY = t.clientY;
            } else if (t.clientX >= window.innerWidth / 2 && touchLookId === null) {
                touchLookId = t.identifier;
                touchLookLastX = t.clientX;
                touchLookLastY = t.clientY;
            }
        }
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            let t = e.changedTouches[i];

            if (t.identifier === joystickTouchId) {
                let dx = t.clientX - joystickStartX;
                let dy = t.clientY - joystickStartY;
                moveDirection.right = Math.max(-1, Math.min(1, dx / 40));
                moveDirection.forward = Math.max(-1, Math.min(1, -dy / 40));
            }

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
    }, { passive: false });

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
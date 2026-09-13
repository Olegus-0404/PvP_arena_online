// ============================================================================
// GAME CLIENT CORE: Clean Stable Version (FIXED)
// ============================================================================

const DEFAULT_SERVER_URL = "https://pvp-arena-online.onrender.com";
let SERVER_URL = DEFAULT_SERVER_URL;

let socket = null;
let myId = null, myNick = "", currentGameMode = "survival", currentLobby = "";
let hp = 100, armor = 100, kills = 0, isReloading = false;
let isCrouching = false;

const WEAPONS = {
    knife:  { name: "Нож",   damage: 35, fireRate: 500, ammo: Infinity, maxReserve: 0 },
    pistol: { name: "ПМ",    damage: 25, fireRate: 300, ammo: 8,  maxReserve: 32 },
    rifle:  { name: "АК-47", damage: 45, fireRate: 110, ammo: 30, maxReserve: 120 }
};
let currentWeaponKey = 'rifle';
let ammo = WEAPONS['rifle'].ammo;
let reserveAmmo = WEAPONS['rifle'].maxReserve;
let lastShotTime = 0;
let firingHeld = false;

let scene, camera, renderer, weaponMesh;
let yawObject = new THREE.Object3D(), pitchObject = new THREE.Object3D();
let moveDirection = { forward: 0, right: 0 };
let playerVelocity = new THREE.Vector3();
let isGrounded = true;

const GRAVITY = 38;
const JUMP_FORCE = 8.5;
const NORMAL_SPEED = 6.0;
const CROUCH_SPEED = 2.5;
let moveSpeed = NORMAL_SPEED;

window.gameSettings = window.gameSettings || { sensitivity: 0.0035 };

window.switchWeapon = function (weaponKey) {
    if (!WEAPONS[weaponKey]) return;
    currentWeaponKey = weaponKey;
    ammo = WEAPONS[weaponKey].ammo;
    reserveAmmo = WEAPONS[weaponKey].maxReserve;
    updateHUD();
};

// ============================================================================
// BOOTSTRAP
// ============================================================================
window.addEventListener('DOMContentLoaded', () => {
    if (typeof initGameSettings === 'function') initGameSettings();

    initEngine();
    setupControls();
    setupTouchControls();
    setupAuthUI();
    setupRespawnUI();
    setupResize();

    // Автоматический коннект, если позывной уже сохранен
    let savedNick = localStorage.getItem('stalker_nick');
    if (savedNick) {
        myNick = savedNick;
        let authScreen = document.getElementById('auth-screen');
        if (authScreen) authScreen.style.display = 'none';
        connectToServer();
    }
});

// ============================================================================
// AUTH SCREEN (было полностью нерабочим — кнопка ничего не делала)
// ============================================================================
function setupAuthUI() {
    const btnAuth = document.getElementById('btn-auth');
    const inputEmail = document.getElementById('input-email');
    const inputServer = document.getElementById('input-server');
    const statusEl = document.getElementById('auth-status');
    if (!btnAuth) return;

    btnAuth.addEventListener('click', () => {
        const email = inputEmail ? inputEmail.value.trim() : "";
        if (!email) {
            if (statusEl) statusEl.innerText = "Укажите почту для сохранения профиля";
            return;
        }

        const customServer = inputServer ? inputServer.value.trim() : "";
        if (customServer) {
            SERVER_URL = customServer;
        }

        const inputLobby = document.getElementById('input-lobby');
        currentLobby = inputLobby ? inputLobby.value.trim() : "";

        myNick = email;
        localStorage.setItem('stalker_nick', myNick);

        const authScreen = document.getElementById('auth-screen');
        if (authScreen) authScreen.style.display = 'none';

        connectToServer();
    });
}

function setupRespawnUI() {
    const btnRespawn = document.getElementById('btn-respawn');
    if (!btnRespawn) return;

    btnRespawn.addEventListener('click', () => {
        const respawnScreen = document.getElementById('respawn-screen');
        if (respawnScreen) respawnScreen.style.display = 'none';

        if (socket) socket.emit('requestRespawn');
    });
}

function showRespawnScreen() {
    const respawnScreen = document.getElementById('respawn-screen');
    if (respawnScreen) respawnScreen.style.display = 'flex';
}

// ============================================================================
// NETWORK
// ============================================================================
// otherPlayers: снимок состояния остальных игроков от сервера.
// Пока НЕ отрисовывается в 3D — на это нужен отдельный слой рендера
// удалённых игроков (мешей), которого в текущем клиенте нет.
let otherPlayers = {};

function connectToServer() {
    if (typeof io === 'undefined') return;

    socket = io(SERVER_URL, {
        transports: ['polling', 'websocket'],
        query: { nick: myNick, mode: currentGameMode, lobby: currentLobby }
    });

    socket.on('connect', () => { myId = socket.id; });

    socket.on('authSuccess', (data) => {
        currentGameMode = data.mode || currentGameMode;
    });

    socket.on('init', (spawnPos) => {
        if (yawObject) {
            yawObject.position.set(spawnPos.x || 0, 3.5, spawnPos.z || 30);
            playerVelocity.set(0, 0, 0);
        }
        hp = 100; armor = 100;
        updateHUD();
    });

    socket.on('playerState', (data) => {
        hp = Math.max(0, data.hp);
        armor = Math.max(0, data.armor ?? armor);
        kills = data.kills ?? kills;
        updateHUD();
        if (hp <= 0) showRespawnScreen();
    });

    socket.on('killfeed', (data) => {
        if (typeof window.showKillfeed === 'function') {
            window.showKillfeed(data.killer, data.weapon, data.victim);
        }
    });

    socket.on('damagedBy', () => {
        flashDamage();
    });

    socket.on('updatePlayers', (players) => {
        otherPlayers = players;
        // TODO: отрисовка остальных игроков как мешей в scene —
        // отдельная фича, сейчас клиент их не рисует.
    });

    socket.on('chatMessage', (data) => {
        const log = document.getElementById('chat-log');
        if (log) {
            const line = document.createElement('div');
            line.textContent = `${data.nick}: ${data.msg}`;
            log.appendChild(line);
            log.scrollTop = log.scrollHeight;
        }
    });
}

// Простая вспышка урона на весь экран (если в разметке есть #damage-flash;
// если нет — просто ничего не делает, безопасно)
function flashDamage() {
    const flash = document.getElementById('damage-flash');
    if (!flash) return;
    flash.style.opacity = '1';
    setTimeout(() => { flash.style.opacity = '0'; }, 150);
}

// ============================================================================
// ENGINE
// ============================================================================
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
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xddeeff, 0x334422, 0.8));

    let floor = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200),
        new THREE.MeshStandardMaterial({ color: 0x2b3028 })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    animate();
}

// Раньше resize вообще не обрабатывался — отсюда чёрная зона на скрине,
// когда реальный размер окна на телефоне отличался от того, что было
// на момент первого рендера (скрытие адресной строки, поворот экрана).
function setupResize() {
    window.addEventListener('resize', onWindowResize);
    window.addEventListener('orientationchange', () => {
        setTimeout(onWindowResize, 200);
    });
}

function onWindowResize() {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function updateHUD() {
    let hpEl = document.getElementById('val-hp');
    let armorEl = document.getElementById('val-armor');
    let ammoEl = document.getElementById('val-ammo');
    if (hpEl) hpEl.innerText = Math.max(0, hp);
    if (armorEl) armorEl.innerText = Math.max(0, armor);
    if (ammoEl) ammoEl.innerText = currentWeaponKey === 'knife' ? '∞' : `${ammo} / ${reserveAmmo}`;
}

// ============================================================================
// KEYBOARD CONTROLS (как было)
// ============================================================================
function setupControls() {
    window.addEventListener('keydown', (e) => {
        if (e.code === 'KeyW') moveDirection.forward = 1;
        if (e.code === 'KeyS') moveDirection.forward = -1;
        if (e.code === 'KeyA') moveDirection.right = -1;
        if (e.code === 'KeyD') moveDirection.right = 1;
        if (e.code === 'Space' && isGrounded) { playerVelocity.y = JUMP_FORCE; isGrounded = false; }
        if (e.code === 'KeyR') reloadWeapon();
        if (e.code === 'ControlLeft' || e.code === 'KeyC') setCrouch(true);
    });
    window.addEventListener('keyup', (e) => {
        if (e.code === 'KeyW' || e.code === 'KeyS') moveDirection.forward = 0;
        if (e.code === 'KeyA' || e.code === 'KeyD') moveDirection.right = 0;
        if (e.code === 'ControlLeft' || e.code === 'KeyC') setCrouch(false);
    });
}

// ============================================================================
// TOUCH CONTROLS — отсутствовали полностью, кнопки были декорацией
// ============================================================================
function setupTouchControls() {
    setupJoystick();

    bindHold('btn-fire', () => { firingHeld = true; }, () => { firingHeld = false; });
    bindTap('btn-reload', reloadWeapon);
    bindTap('btn-jump', () => {
        if (isGrounded) { playerVelocity.y = JUMP_FORCE; isGrounded = false; }
    });
    bindHold('btn-crouch', () => setCrouch(true), () => setCrouch(false));
}

function bindTap(id, handler) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', (e) => { e.preventDefault(); handler(); }, { passive: false });
    el.addEventListener('mousedown', (e) => { e.preventDefault(); handler(); });
}

function bindHold(id, onStart, onEnd) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', (e) => { e.preventDefault(); onStart(); }, { passive: false });
    el.addEventListener('touchend', (e) => { e.preventDefault(); onEnd(); }, { passive: false });
    el.addEventListener('mousedown', (e) => { e.preventDefault(); onStart(); });
    el.addEventListener('mouseup', (e) => { e.preventDefault(); onEnd(); });
}

function setupJoystick() {
    const zone = document.getElementById('joystick-zone');
    const stick = document.getElementById('joystick-stick');
    if (!zone || !stick) return;

    const maxRadius = zone.clientWidth / 2;
    let activeTouchId = null;

    function updateStick(dx, dy) {
        const dist = Math.min(Math.hypot(dx, dy), maxRadius);
        const angle = Math.atan2(dy, dx);
        const sx = Math.cos(angle) * dist;
        const sy = Math.sin(angle) * dist;
        stick.style.transform = `translate(${sx}px, ${sy}px)`;

        moveDirection.right = Math.max(-1, Math.min(1, sx / maxRadius));
        moveDirection.forward = Math.max(-1, Math.min(1, -sy / maxRadius));
    }

    function resetStick() {
        stick.style.transform = 'translate(0px, 0px)';
        moveDirection.right = 0;
        moveDirection.forward = 0;
        activeTouchId = null;
    }

    zone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        activeTouchId = touch.identifier;
    }, { passive: false });

    zone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            if (touch.identifier !== activeTouchId) continue;
            const rect = zone.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            updateStick(touch.clientX - cx, touch.clientY - cy);
        }
    }, { passive: false });

    zone.addEventListener('touchend', (e) => {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            if (touch.identifier === activeTouchId) resetStick();
        }
    }, { passive: false });
}

function setCrouch(state) {
    isCrouching = state;
    moveSpeed = state ? CROUCH_SPEED : NORMAL_SPEED;
}

// ============================================================================
// WEAPONS
// ============================================================================
function reloadWeapon() {
    if (isReloading) return;
    const weapon = WEAPONS[currentWeaponKey];
    if (!weapon || weapon.ammo === Infinity) return;
    if (ammo >= weapon.ammo || reserveAmmo <= 0) return;

    isReloading = true;
    setTimeout(() => {
        const needed = weapon.ammo - ammo;
        const take = Math.min(needed, reserveAmmo);
        ammo += take;
        reserveAmmo -= take;
        isReloading = false;
        updateHUD();
    }, 1500);
}

function tryFire(now) {
    if (isReloading) return;
    const weapon = WEAPONS[currentWeaponKey];
    if (!weapon) return;
    if (now - lastShotTime < weapon.fireRate) return;

    if (weapon.ammo !== Infinity) {
        if (ammo <= 0) { reloadWeapon(); return; }
        ammo -= 1;
    }
    lastShotTime = now;
    updateHUD();

    if (socket) {
        const target = raycastOtherPlayers();
        if (target) {
            socket.emit('playerHit', { targetId: target.id, zone: target.zone });
        }
    }
}

// Клиент не рисует меши других игроков (это отдельная фича на будущее),
// но их координаты из 'updatePlayers' есть — этого достаточно для
// приблизительного рейкаста по точке, чтобы FIRE реально наносил урон.
function raycastOtherPlayers() {
    const origin = new THREE.Vector3();
    camera.getWorldPosition(origin);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);

    const HIT_RADIUS = 1.3;
    const MAX_DIST = 150;
    let closest = null;
    let closestDist = Infinity;

    for (const id in otherPlayers) {
        if (id === myId) continue;
        const p = otherPlayers[id];
        if (!p || p.hp <= 0) continue;

        const targetPos = new THREE.Vector3(p.x, 3.5, p.z);
        const toTarget = targetPos.clone().sub(origin);
        const along = toTarget.dot(dir);
        if (along <= 0 || along > MAX_DIST) continue;

        const closestPoint = origin.clone().add(dir.clone().multiplyScalar(along));
        const perpDist = closestPoint.distanceTo(targetPos);
        if (perpDist <= HIT_RADIUS && along < closestDist) {
            closestDist = along;
            closest = { id, zone: 'body' };
        }
    }
    return closest;
}

// ============================================================================
// LOOP
// ============================================================================
function animate() {
    requestAnimationFrame(animate);
    const delta = 0.016;
    const now = performance.now();

    if (firingHeld) tryFire(now);

    playerVelocity.y -= GRAVITY * delta;

    let moveVector = new THREE.Vector3(moveDirection.right, 0, -moveDirection.forward).normalize();
    moveVector.applyQuaternion(yawObject.quaternion);

    yawObject.position.x += moveVector.x * moveSpeed * delta;
    yawObject.position.z += moveVector.z * moveSpeed * delta;
    yawObject.position.y += playerVelocity.y * delta;

    const groundLevel = isCrouching ? 2.2 : 3.0;
    if (yawObject.position.y <= groundLevel) {
        yawObject.position.y = groundLevel;
        playerVelocity.y = 0;
        isGrounded = true;
    }

    sendPositionUpdate(now);

    renderer.render(scene, camera);
}

// Раньше клиент вообще не сообщал серверу свою позицию —
// сервер её ждёт в 'playerMove', но никто её не отправлял.
let lastMoveSentAt = 0;
function sendPositionUpdate(now) {
    if (!socket || !socket.connected) return;
    if (now - lastMoveSentAt < 50) return; // ~20 раз в секунду, серверу хватает при тикрейте 30Hz
    lastMoveSentAt = now;
    socket.emit('playerMove', {
        x: yawObject.position.x,
        z: yawObject.position.z,
        rotY: yawObject.rotation.y
    });
}
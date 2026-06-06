const SERVER_URL = "https://pvp-arena-online.onrender.com"; 
let socket;

let myId = null, myNick = "", myPass = "";
let hp = 100, armor = 100, ammo = 30, reserveAmmo = 120, kills = 0, isReloading = false;

let scene, camera, renderer, weaponMesh;
let yawObject = new THREE.Object3D(), pitchObject = new THREE.Object3D();
let remotePlayers = {}, mapObjects = [], supplyCrates = [];
let moveDirection = { forward: 0, right: 0 };
let playerVelocity = new THREE.Vector3();
let isGrounded = true;

const GRAVITY = 28; const JUMP_FORCE = 11; let moveSpeed = 14;
let colliders = [];

let joystickTouchId = null;
let lookTouchId = null;
let lastLookX = 0, lastLookY = 0;
let fireIntervalId = null;
let isCrouching = false;
let isCustomizing = false;

window.gameSettings = { sensitivity: 0.0035 };

function initSocket() {
    try { socket = io(SERVER_URL); } catch(e) { return; }

    socket.on('connect', () => { 
        document.getElementById('auth-status').innerText = "Сервер онлайн! Введите данные."; 
    });
    
    socket.on('authSuccess', (data) => { 
        localStorage.setItem('n', data.nick); localStorage.setItem('p', data.pass); 
        document.getElementById('auth-screen').style.display = 'none'; 
        myId = socket.id; 
    });
    
    socket.on('authFailed', (msg) => { 
        document.getElementById('btn-auth').innerText = "Войти"; 
        document.getElementById('auth-status').innerText = msg; 
    });
    
    socket.on('init', (spawnPos) => { 
        if (yawObject) { yawObject.position.set(spawnPos.x, 1.7, spawnPos.z); }
        hp = 100; armor = 100; ammo = 30; reserveAmmo = 120; 
        updateHUD(); 
        document.getElementById('respawn-screen').style.display = 'none'; 
        document.getElementById('voting-screen').style.display = 'none';
        if (spawnPos.map) { buildMap(spawnPos.map); }
    });
    
    socket.on('timerUpdate', (data) => { 
        const timerEl = document.getElementById('game-timer');
        if (timerEl) {
            timerEl.innerText = data.isVoting ? `Голосование: ${data.timeLeft}с` : `Матч: ${Math.floor(data.timeLeft/60)}:${data.timeLeft%60 < 10 ? '0'+data.timeLeft%60 : data.timeLeft%60}`;
        }
    });

    socket.on('startVoting', () => {
        stopAutofire();
        document.getElementById('voting-screen').style.display = 'flex';
    });

    socket.on('votesUpdated', (votes) => {
        document.getElementById('vote-arena-count').innerText = votes.arena;
        document.getElementById('vote-maze-count').innerText = votes.maze;
    });

    socket.on('endVoting', () => { document.getElementById('voting-screen').style.display = 'none'; });
    socket.on('damagedBy', (data) => { triggerDamageFlash(); });

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
            
            if (!remotePlayers[id] && pData.hp > 0) {
                let group = new THREE.Group();
                let torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.4), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
                torso.position.y = 0.9; torso.userData = { targetId: id, zone: 'body' }; group.add(torso);
                
                // ФИКС ХЕДШОТОВ: Вешаем userData напрямую на меши головы
                let head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }));
                head.position.y = 1.5; head.userData = { targetId: id, zone: 'head' }; group.add(head);
                
                let visor = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.06, 0.1), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
                visor.position.set(0, 1.5, -0.18); visor.userData = { targetId: id, zone: 'head' }; group.add(visor);
                
                let leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6), new THREE.MeshStandardMaterial({ color: 0xff0055 })); leftArm.position.set(-0.4, 0.9, 0); leftArm.userData = { targetId: id, zone: 'body' }; group.add(leftArm);
                let rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6), new THREE.MeshStandardMaterial({ color: 0xff0055 })); rightArm.position.set(0.4, 0.9, 0); rightArm.userData = { targetId: id, zone: 'body' }; group.add(rightArm);
                let leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5), new THREE.MeshStandardMaterial({ color: 0x0f172a })); leftLeg.position.set(-0.2, 0.25, 0); leftLeg.userData = { targetId: id, zone: 'body' }; group.add(leftLeg);
                let rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5), new THREE.MeshStandardMaterial({ color: 0x0f172a })); rightLeg.position.set(0.2, 0.25, 0); rightLeg.userData = { targetId: id, zone: 'body' }; group.add(rightLeg);

                scene.add(group); remotePlayers[id] = group;
            }
            if (remotePlayers[id]) {
                if (pData.hp <= 0) { scene.remove(remotePlayers[id]); delete remotePlayers[id]; } 
                else { remotePlayers[id].position.set(pData.x, 0, pData.z); remotePlayers[id].rotation.y = pData.rotY; }
            }
        }
    });
}

function triggerDamageFlash() {
    let flash = document.getElementById('damage-flash'); if (flash) { flash.style.opacity = '0.5'; setTimeout(() => { flash.style.opacity = '0'; }, 150); }
}

function checkPlayerCollisions(newPos) {
    for (let id in remotePlayers) {
        let pObj = remotePlayers[id];
        let dist = new THREE.Vector2(newPos.x - pObj.position.x, newPos.z - pObj.position.z).length();
        if (dist < 0.8) return true; 
    }
    return false;
}

window.voteMap = function(mapName) { if (socket) socket.emit('submitVote', mapName); };

window.addEventListener('DOMContentLoaded', () => {
    initEngine(); initSocket(); setupControls(); loadHUDPositions();
    if(localStorage.getItem('n') && localStorage.getItem('p')) {
        document.getElementById('input-nick').value = localStorage.getItem('n'); 
        document.getElementById('input-pass').value = localStorage.getItem('p');
    }
});

function initEngine() {
    const container = document.getElementById('canvas-container'); if (!container) return;
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x0a0f1d);
    scene.fog = new THREE.FogExp2(0x0a0f1d, 0.015);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    pitchObject.add(camera); yawObject.add(pitchObject); scene.add(yawObject);
    renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    let dirLight = new THREE.DirectionalLight(0x38bdf8, 0.8); dirLight.position.set(20, 40, 20); scene.add(dirLight);
    buildMap("arena"); createWeapon(); spawnCrates(); animate();
}

function createWeapon() {
    if (!camera) return;
    let weaponGroup = new THREE.Group();
    let barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.6, 8), new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8 })); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0, -0.3); weaponGroup.add(barrel);
    let bodyGen = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.45), new THREE.MeshStandardMaterial({ color: 0x1e293b })); bodyGen.position.set(0, -0.02, -0.1); weaponGroup.add(bodyGen);
    weaponGroup.position.set(0.22, -0.2, -0.45); camera.add(weaponGroup); weaponMesh = weaponGroup;
}

// ФИКС КАРТЫ ЛАБИРИНТ: Центр (0,0) полностью очищен от коробок
function buildMap(mapType = "arena") {
    if (!scene) return;
    mapObjects.forEach(obj => scene.remove(obj)); mapObjects = []; colliders = [];
    let floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 })); floor.rotation.x = -Math.PI / 2; scene.add(floor); mapObjects.push(floor);
    let grid = new THREE.GridHelper(100, 50, 0x38bdf8, 0x1f2937); grid.position.y = 0.01; scene.add(grid); mapObjects.push(grid);
    
    if (mapType === "maze") {
        createObstacle(0, 4, -45, 90, 8, 2, 0xec4899);
        createObstacle(0, 4, 45, 90, 8, 2, 0xec4899);
        createObstacle(-45, 4, 0, 2, 8, 90, 0xec4899);
        createObstacle(45, 4, 0, 2, 8, 90, 0xec4899);

        createObstacle(-18, 4, -18, 20, 8, 4, 0x3b82f6);
        createObstacle(18, 4, -18, 4, 8, 20, 0x3b82f6);
        createObstacle(-22, 4, 22, 4, 8, 20, 0x3b82f6);
        createObstacle(22, 4, 22, 20, 8, 4, 0x3b82f6);
    } else {
        createObstacle(0, 3, 0, 12, 6, 2, 0x334155); 
        createObstacle(-20, 4, 20, 6, 8, 6, 0x0284c7); 
        createObstacle(20, 4, -20, 6, 8, 6, 0x0284c7);
    }
}

function createObstacle(x, y, z, w, h, d, color) {
    let mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: color })); mesh.position.set(x, y, z); scene.add(mesh); mapObjects.push(mesh); colliders.push(new THREE.Box3().setFromObject(mesh));
}

function spawnCrates() {
    if (!scene) return;
    const cratePoints = [new THREE.Vector3(0, 0.5, 12), new THREE.Vector3(-15, 0.5, -12), new THREE.Vector3(15, 0.5, -12)];
    cratePoints.forEach((pos) => {
        let mesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), new THREE.MeshStandardMaterial({ color: 0xf59e0b })); mesh.position.copy(pos); scene.add(mesh); supplyCrates.push({ mesh: mesh, active: true, respawnTime: 0 });
    });
}

function checkWallCollisions(newPos) {
    let pr = 0.5;
    let playerBox = new THREE.Box3(
        new THREE.Vector3(newPos.x - pr, newPos.y - (isCrouching ? 0.9 : 1.7), newPos.z - pr),
        new THREE.Vector3(newPos.x + pr, newPos.y + 0.3, newPos.z + pr)
    );
    for (let i = 0; i < colliders.length; i++) { if (playerBox.intersectsBox(colliders[i])) return true; }
    return false;
}

const authBtn = document.getElementById('btn-auth');
if (authBtn) {
    authBtn.addEventListener('click', () => {
        let nickname = document.getElementById('input-nick').value.trim(); let password = document.getElementById('input-pass').value.trim();
        if(nickname.length < 2 || password.length < 3) return;
        authBtn.innerText = "Вход..."; myNick = nickname; myPass = password;
        if (socket && socket.connected) { socket.emit('playerAuth', { nick: nickname, pass: password }); }
    });
}

function performShot() {
    if (isReloading || hp <= 0 || !myId || isCustomizing) return;
    if (ammo <= 0) { stopAutofire(); startReload(); return; }
    ammo--; updateHUD();
    if(weaponMesh) { weaponMesh.position.z = -0.37; setTimeout(() => weaponMesh.position.z = -0.45, 40); }
    let raycaster = new THREE.Raycaster(); raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    
    let targets = []; for (let id in remotePlayers) { targets.push(...remotePlayers[id].children); }
    let intersects = raycaster.intersectObjects(targets);
    if (intersects.length > 0 && socket) {
        let hitObj = intersects[0].object;
        if (hitObj.userData && hitObj.userData.targetId) {
            socket.emit('playerHit', { targetId: hitObj.userData.targetId, zone: hitObj.userData.zone });
        }
    }
}

function startAutofire() { if (fireIntervalId !== null) return; performShot(); fireIntervalId = setInterval(performShot, 100); }
function stopAutofire() { if (fireIntervalId !== null) { clearInterval(fireIntervalId); fireIntervalId = null; } }

function startReload() {
    if (isReloading || ammo === 30 || reserveAmmo <= 0 || !myId) return;
    isReloading = true; updateHUD();
    setTimeout(() => {
        let needed = 30 - ammo; let transfer = Math.min(needed, reserveAmmo);
        ammo += transfer; reserveAmmo -= transfer; isReloading = false; updateHUD();
    }, 1200);
}

function updateHUD() {
    if(document.getElementById('hud-hp')) document.getElementById('hud-hp').innerText = `❤️ HP: ${hp}`;
    if(document.getElementById('hud-armor')) document.getElementById('hud-armor').innerText = `🛡️ Броня: ${armor}`;
    if(document.getElementById('hud-ammo')) document.getElementById('hud-ammo').innerText = isReloading ? `🔄 ЗАРЯДКА...` : `🔫 Патроны: ${ammo} / ${reserveAmmo}`;
    if(document.getElementById('kills-counter')) document.getElementById('kills-counter').innerText = `💀 Убийства: ${kills}`;
}

if(document.getElementById('btn-respawn')) document.getElementById('btn-respawn').addEventListener('click', () => { if(socket) socket.emit('requestRespawn'); });

// ГЛОБАЛЬНЫЙ МОДУЛЬ НАСТРОЕК И ПЕРЕМЕЩЕНИЯ ЭЛЕМЕНТОВ (HUD CUSTOMIZER)
function setupControls() {
    const jZone = document.getElementById('joystick-zone'), stick = document.getElementById('joystick-stick');
    const menuTrigger = document.getElementById('btn-menu-trigger'), customMenu = document.getElementById('customizer-menu');

    // Кнопка меню
    menuTrigger.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (isCustomizing) return; // В режиме редактирования кнопку можно перетаскивать
        isCustomizing = true;
        stopAutofire();
        document.body.classList.add('edit-mode');
        customMenu.style.display = 'block';
    });

    document.getElementById('btn-save-hud').addEventListener('click', () => {
        isCustomizing = false;
        document.body.classList.remove('edit-mode');
        customMenu.style.display = 'none';
        saveHUDPositions();
    });

    document.getElementById('btn-reset-hud').addEventListener('click', () => {
        localStorage.removeItem('hud_layout');
        location.reload();
    });

    document.getElementById('btn-exit-match').addEventListener('click', () => {
        location.reload();
    });

    // Обработка логики игровых кнопок
    document.getElementById('btn-fire').addEventListener('touchstart', (e) => { if(!isCustomizing){ e.preventDefault(); startAutofire(); } });
    document.getElementById('btn-fire').addEventListener('touchend', (e) => { if(!isCustomizing){ e.preventDefault(); stopAutofire(); } });
    document.getElementById('btn-reload').addEventListener('touchstart', (e) => { if(!isCustomizing){ e.preventDefault(); startReload(); } });
    document.getElementById('btn-jump').addEventListener('touchstart', (e) => { if(!isCustomizing){ e.preventDefault(); if(isGrounded) playerVelocity.y = JUMP_FORCE; } });
    document.getElementById('btn-crouch').addEventListener('touchstart', (e) => { 
        if(!isCustomizing){
            e.preventDefault(); isCrouching = !isCrouching;
            moveSpeed = isCrouching ? 6 : 14;
            document.getElementById('btn-crouch').style.backgroundColor = isCrouching ? "rgba(59, 130, 246, 0.6)" : "rgba(30, 58, 138, 0.3)";
        }
    });

    // Джойстик перемещения
    jZone.addEventListener('touchstart', (e) => { if(!isCustomizing){ e.stopPropagation(); let t = e.targetTouches[0]; joystickTouchId = t.identifier; updateJoystick(t); } });
    jZone.addEventListener('touchmove', (e) => { if(!isCustomizing){ e.stopPropagation(); for(let t of e.touches) { if(t.identifier === joystickTouchId) updateJoystick(t); } } });
    jZone.addEventListener('touchend', () => { if(!isCustomizing){ joystickTouchId = null; stick.style.transform = `translate(0px, 0px)`; moveDirection.forward = 0; moveDirection.right = 0; } });

    function updateJoystick(touch) {
        let rect = jZone.getBoundingClientRect();
        let dx = touch.clientX - (rect.left + rect.width / 2), dy = touch.clientY - (rect.top + rect.height / 2);
        let dist = Math.sqrt(dx*dx + dy*dy); if (dist > 40) { dx = (dx / dist) * 40; dy = (dy / dist) * 40; }
        stick.style.transform = `translate(${dx}px, ${dy}px)`; moveDirection.forward = -(dy / 40); moveDirection.right = (dx / 40);
    }

    // Движение камеры пальцем (ИГНОРИРУЕТСЯ В РЕЖИМЕ КАСТОМИЗАЦИИ)
    window.addEventListener('touchstart', (e) => {
        if (isCustomizing || e.target.closest('#customizer-menu') || e.target.closest('.overlay')) return;
        // Камера теперь вращается одновременно с нажатием на любые кнопки!
        for(let t of e.changedTouches) { if(lookTouchId === null) { lookTouchId = t.identifier; lastLookX = t.clientX; lastLookY = t.clientY; } }
    });
    window.addEventListener('touchmove', (e) => {
        if (isCustomizing) return;
        for(let t of e.changedTouches) {
            if(t.identifier === lookTouchId) {
                let dx = t.clientX - lastLookX, dy = t.clientY - lastLookY;
                let sens = window.gameSettings.sensitivity;
                yawObject.rotation.y -= dx * sens; pitchObject.rotation.x -= dy * sens;
                pitchObject.rotation.x = Math.max(-Math.PI/2.2, Math.min(Math.PI/2.2, pitchObject.rotation.x));
                lastLookX = t.clientX; lastLookY = t.clientY;
            }
        }
    });
    window.addEventListener('touchend', (e) => { for(let t of e.changedTouches) { if(t.identifier === lookTouchId) lookTouchId = null; } });

    // ЛОГИКА ДРАГ-ЭНД-ДРОПА ДЛЯ КАСТОМИЗАЦИИ ВСЕХ КНОПОК И ТЕКСТОВ
    let dragElement = null, dragOffsetX = 0, dragOffsetY = 0;

    document.querySelectorAll('.hud-element').forEach(el => {
        el.addEventListener('touchstart', (e) => {
            if (!isCustomizing) return;
            dragElement = el;
            let touch = e.touches[0];
            let rect = el.getBoundingClientRect();
            dragOffsetX = touch.clientX - rect.left;
            dragOffsetY = touch.clientY - rect.top;
            el.style.transform = "none"; // сбрасываем центрирование
        });
    });

    window.addEventListener('touchmove', (e) => {
        if (!isCustomizing || !dragElement) return;
        let touch = e.touches[0];
        let x = touch.clientX - dragOffsetX;
        let y = touch.clientY - dragOffsetY;
        
        // Ограничиваем рамками экрана
        x = Math.max(0, Math.min(window.innerWidth - dragElement.offsetWidth, x));
        y = Math.max(0, Math.min(window.innerHeight - dragElement.offsetHeight, y));

        dragElement.style.left = x + 'px';
        dragElement.style.top = y + 'px';
        dragElement.style.bottom = 'auto';
        dragElement.style.right = 'auto';
    });

    window.addEventListener('touchend', () => { dragElement = null; });
}

function saveHUDPositions() {
    let layout = {};
    document.querySelectorAll('.hud-element').forEach(el => {
        layout[el.id] = { left: el.style.left, top: el.style.top };
    });
    localStorage.setItem('hud_layout', JSON.stringify(layout));
}

function loadHUDPositions() {
    let saved = localStorage.getItem('hud_layout');
    if (!saved) return;
    let layout = JSON.parse(saved);
    for (let id in layout) {
        let el = document.getElementById(id);
        if (el && layout[id].left) {
            el.style.left = layout[id].left; el.style.top = layout[id].top;
            el.style.right = 'auto'; el.style.bottom = 'auto'; el.style.transform = 'none';
        }
    }
}

let clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    if (!renderer || !scene || !camera) return;
    let delta = clock.getDelta(); if (delta > 0.1) delta = 0.1;

    if (myId && hp > 0 && !isCustomizing) {
        playerVelocity.y -= GRAVITY * delta;
        let forwardVector = new THREE.Vector3(0, 0, -1).applyQuaternion(yawObject.quaternion);
        let sideVector = new THREE.Vector3(1, 0, 0).applyQuaternion(yawObject.quaternion);
        let moveX = (forwardVector.x * moveDirection.forward + sideVector.x * moveDirection.right) * moveSpeed * delta;
        let moveZ = (forwardVector.z * moveDirection.forward + sideVector.z * moveDirection.right) * moveSpeed * delta;

        let targetPos = yawObject.position.clone(); targetPos.x += moveX; 
        if (!checkWallCollisions(targetPos) && !checkPlayerCollisions(targetPos)) yawObject.position.x = targetPos.x;
        
        targetPos = yawObject.position.clone(); targetPos.z += moveZ; 
        if (!checkWallCollisions(targetPos) && !checkPlayerCollisions(targetPos)) yawObject.position.z = targetPos.z;

        yawObject.position.y += playerVelocity.y * delta;
        let targetHeight = isCrouching ? 0.9 : 1.7;
        if (yawObject.position.y <= targetHeight) { playerVelocity.y = 0; yawObject.position.y = targetHeight; isGrounded = true; } else { isGrounded = false; }

        supplyCrates.forEach(crate => {
            if (crate.active) {
                crate.mesh.rotation.y += 1.6 * delta;
                if (yawObject.position.distanceTo(crate.mesh.position) < 1.4) {
                    crate.active = false; crate.mesh.visible = false; crate.respawnTime = Date.now() + 12000;
                    hp = Math.min(100, hp + 30); armor = Math.min(100, armor + 20); reserveAmmo += 60; updateHUD();
                }
            } else if (Date.now() > crate.respawnTime) { crate.active = true; crate.mesh.visible = true; }
        });

        if(socket && socket.connected) socket.emit('playerMove', { x: yawObject.position.x, z: yawObject.position.z, rotY: yawObject.rotation.y });
    }
    renderer.render(scene, camera);
}
window.addEventListener('resize', () => { if(camera && renderer) { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); } });
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

window.gameSettings = {
    sensitivity: 0.0035
};

function initGameSettings() {
    console.log("Настройки управления успешно инициализированы");
}

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
        document.getElementById('btn-auth').innerText = "Войти / Создать"; 
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

    socket.on('endVoting', () => {
        document.getElementById('voting-screen').style.display = 'none';
    });

    socket.on('damagedBy', (data) => {
        triggerDamageFlash();
        showDamageIndicator(data.shooterX, data.shooterZ);
    });

    socket.on('updatePlayers', (serverPlayers) => {
        if (!scene) return;
        
        if (myId && serverPlayers[myId]) {
            kills = serverPlayers[myId].kills;
            let oldHp = hp;
            hp = serverPlayers[myId].hp;
            armor = serverPlayers[myId].armor;
            
            if (hp <= 0 && oldHp > 0) { 
                stopAutofire(); 
                document.getElementById('respawn-screen').style.display = 'flex'; 
            }
            updateHUD();
        }
        
        for (let id in serverPlayers) {
            if (id === socket.id) continue;
            let pData = serverPlayers[id];
            
            if (!remotePlayers[id] && pData.hp > 0) {
                let group = new THREE.Group();
                
                // ТОРС
                let torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.4), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
                torso.position.y = 0.9; torso.userData = { targetId: id, zone: 'body' }; group.add(torso);
                
                // ИСПРАВЛЕНИЕ РЕГИСТРАЦИИ ГОЛОВЫ: userData вешается прямо на Mesh элементов, без промежуточных групп
                let head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }));
                head.position.y = 1.5; head.userData = { targetId: id, zone: 'head' }; group.add(head);
                
                let visor = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.06, 0.1), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
                visor.position.set(0, 1.5, -0.18); visor.userData = { targetId: id, zone: 'head' }; group.add(visor);
                
                // РУКИ И НОГИ
                let leftArm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6), new THREE.MeshStandardMaterial({ color: 0xff0055 })); 
                leftArm.position.set(-0.4, 0.9, 0); leftArm.userData = { targetId: id, zone: 'body' }; group.add(leftArm);
                
                let rightArm = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.6), new THREE.MeshStandardMaterial({ color: 0xff0055 })); 
                rightArm.position.set(0.4, 0.9, 0); rightArm.userData = { targetId: id, zone: 'body' }; group.add(rightArm);
                
                let leftLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5), new THREE.MeshStandardMaterial({ color: 0x0f172a })); 
                leftLeg.position.set(-0.2, 0.25, 0); leftLeg.userData = { targetId: id, zone: 'body' }; group.add(leftLeg);
                
                let rightLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.5), new THREE.MeshStandardMaterial({ color: 0x0f172a })); 
                rightLeg.position.set(0.2, 0.25, 0); rightLeg.userData = { targetId: id, zone: 'body' }; group.add(rightLeg);
                
                let enemyGun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.5), new THREE.MeshStandardMaterial({ color: 0x475569 })); 
                enemyGun.position.set(0.3, 0.8, -0.2); enemyGun.rotation.x = Math.PI / 2; enemyGun.userData = { targetId: id, zone: 'body' }; group.add(enemyGun);

                scene.add(group); remotePlayers[id] = group;
            }
            
            if (remotePlayers[id]) {
                if (pData.hp <= 0) { scene.remove(remotePlayers[id]); delete remotePlayers[id]; } 
                else { remotePlayers[id].position.set(pData.x, 0, pData.z); remotePlayers[id].rotation.y = pData.rotY; }
            }
        }
        for (let id in remotePlayers) { if (!serverPlayers[id]) { scene.remove(remotePlayers[id]); delete remotePlayers[id]; } }
    });
}

function triggerDamageFlash() {
    let flash = document.getElementById('damage-flash');
    if (flash) { flash.style.opacity = '0.5'; setTimeout(() => { flash.style.opacity = '0'; }, 150); }
}

function showDamageIndicator(sX, sZ) {
    let ind = document.getElementById('damage-indicator');
    if (!ind || !yawObject) return;
    let pX = yawObject.position.x; let pZ = yawObject.position.z;
    let angleToShooter = Math.atan2(sX - pX, sZ - pZ);
    let camAngle = yawObject.rotation.y;
    let relativeAngle = angleToShooter - camAngle + Math.PI;
    ind.style.transform = `translate(-50%, -50%) rotate(${relativeAngle}rad)`;
    ind.style.opacity = '1';
    setTimeout(() => { ind.style.opacity = '0'; }, 600);
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
window.toggleFullScreen = function() {
    if (!document.fullscreenElement) { document.documentElement.requestFullscreen().catch(() => {}); } 
    else { document.exitFullscreen(); }
};

window.leaveMatch = function() {
    if (socket) socket.disconnect(); 
    myId = null; stopAutofire();
    if (scene) { for (let id in remotePlayers) { scene.remove(remotePlayers[id]); } }
    remotePlayers = {};
    document.getElementById('auth-screen').style.display = 'flex';
    initSocket();
};

window.addEventListener('DOMContentLoaded', () => {
    initEngine(); initSocket(); initGameSettings(); setupControls();
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
    let sight = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.02, 0.04), new THREE.MeshBasicMaterial({ color: 0x00ffcc })); sight.position.set(0, 0.035, -0.2); weaponGroup.add(sight);
    weaponGroup.position.set(0.22, -0.2, -0.45); camera.add(weaponGroup); weaponMesh = weaponGroup;
}

// ИСПРАВЛЕНИЕ КАРТЫ: Создан полноценный играбельный лабиринт со свободным центром
function buildMap(mapType = "arena") {
    if (!scene) return;
    mapObjects.forEach(obj => scene.remove(obj)); mapObjects = []; colliders = [];
    let floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 })); floor.rotation.x = -Math.PI / 2; scene.add(floor); mapObjects.push(floor);
    let grid = new THREE.GridHelper(100, 50, 0x38bdf8, 0x1f2937); grid.position.y = 0.01; scene.add(grid); mapObjects.push(grid);
    
    if (mapType === "maze") {
        // Внешние границы карты (стены)
        createObstacle(0, 4, -45, 90, 8, 2, 0xec4899);
        createObstacle(0, 4, 45, 90, 8, 2, 0xec4899);
        createObstacle(-45, 4, 0, 2, 8, 90, 0xec4899);
        createObstacle(45, 4, 0, 2, 8, 90, 0xec4899);

        // Внутренние стены лабиринта (центр 0,0 свободен для спавна!)
        createObstacle(-15, 4, -15, 20, 8, 3, 0x3b82f6);
        createObstacle(15, 4, -15, 3, 8, 20, 0x3b82f6);
        createObstacle(-20, 4, 15, 4, 8, 25, 0x3b82f6);
        createObstacle(20, 4, 20, 25, 8, 4, 0x3b82f6);
        createObstacle(-30, 4, -5, 15, 8, 3, 0x10b981);
        createObstacle(30, 4, 5, 3, 8, 15, 0x10b981);
    } else {
        createObstacle(0, 3, 0, 12, 6, 2, 0x334155); 
        createObstacle(-20, 4, 20, 6, 8, 6, 0x0284c7); 
        createObstacle(20, 4, -20, 6, 8, 6, 0x0284c7);
        createObstacle(25, 2, 15, 8, 4, 2, 0x475569); 
        createObstacle(-25, 2, -15, 8, 4, 2, 0x475569);
    }
}

function createObstacle(x, y, z, w, h, d, color) {
    let mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: color })); mesh.position.set(x, y, z); scene.add(mesh); mapObjects.push(mesh); colliders.push(new THREE.Box3().setFromObject(mesh));
}

function spawnCrates() {
    if (!scene) return;
    const cratePoints = [new THREE.Vector3(0, 0.5, 12), new THREE.Vector3(-15, 0.5, -12), new THREE.Vector3(15, 0.5, -12)];
    cratePoints.forEach((pos) => {
        let mesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), new THREE.MeshStandardMaterial({ color: 0xf59e0b }));
        mesh.position.copy(pos); scene.add(mesh); supplyCrates.push({ mesh: mesh, baseY: pos.y, active: true, respawnTime: 0 });
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
    authBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        let nickname = document.getElementById('input-nick').value.trim(); 
        let password = document.getElementById('input-pass').value.trim();
        if(nickname.length < 2 || password.length < 3) return;
        authBtn.innerText = "Вход..."; myNick = nickname; myPass = password;
        if (socket && socket.connected) { socket.emit('playerAuth', { nick: nickname, pass: password }); }
    });
}

function performShot() {
    if (isReloading || hp <= 0 || !myId) return;
    if (ammo <= 0) { stopAutofire(); startReload(); return; }
    ammo--; updateHUD();
    if(weaponMesh) { weaponMesh.position.z = -0.37; setTimeout(() => weaponMesh.position.z = -0.45, 40); }
    let raycaster = new THREE.Raycaster(); raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    
    // Ищем попадание по всем дочерним мешам игроков
    let targets = []; 
    for (let id in remotePlayers) { targets.push(...remotePlayers[id].children); }
    
    let intersects = raycaster.intersectObjects(targets);
    if (intersects.length > 0 && socket) {
        let hitObj = intersects[0].object;
        let data = hitObj.userData;
        if (data && data.targetId) {
            socket.emit('playerHit', { targetId: data.targetId, zone: data.zone });
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
    if(document.getElementById('hud-ammo')) document.getElementById('hud-ammo').innerText = isReloading ? `🔄 RE-LOADING...` : `🔫 Патроны: ${ammo} / ${reserveAmmo}`;
    if(document.getElementById('kills-counter')) document.getElementById('kills-counter').innerText = `💀 Убийства: ${kills}`;
}

if(document.getElementById('btn-respawn')) document.getElementById('btn-respawn').addEventListener('click', (e) => { e.stopPropagation(); if(socket) socket.emit('requestRespawn'); });

// ИСПРАВЛЕНИЕ УПРАВЛЕНИЯ: Камера больше не блокируется кнопками действий
function setupControls() {
    const jZone = document.getElementById('joystick-zone'), stick = document.getElementById('joystick-stick');
    
    if(document.getElementById('btn-fire')) {
        document.getElementById('btn-fire').addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); startAutofire(); }, {passive: false});
        document.getElementById('btn-fire').addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); stopAutofire(); }, {passive: false});
    }
    if(document.getElementById('btn-reload')) {
        document.getElementById('btn-reload').addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); startReload(); }, {passive: false});
    }
    if(document.getElementById('btn-jump')) {
        document.getElementById('btn-jump').addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); if(isGrounded) playerVelocity.y = JUMP_FORCE; }, {passive: false});
    }
    if(document.getElementById('btn-crouch')) {
        document.getElementById('btn-crouch').addEventListener('touchstart', (e) => { 
            e.preventDefault(); e.stopPropagation(); isCrouching = !isCrouching;
            moveSpeed = isCrouching ? 6 : 14;
            document.getElementById('btn-crouch').style.backgroundColor = isCrouching ? "rgba(59, 130, 246, 0.6)" : "rgba(30, 58, 138, 0.3)";
        }, {passive: false});
    }

    if(jZone && stick) {
        jZone.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); let t = e.targetTouches[0]; joystickTouchId = t.identifier; updateJoystick(t); }, {passive: false});
        jZone.addEventListener('touchmove', (e) => { e.preventDefault(); e.stopPropagation(); for(let t of e.touches) { if(t.identifier === joystickTouchId) updateJoystick(t); } }, {passive: false});
        jZone.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); joystickTouchId = null; stick.style.transform = `translate(0px, 0px)`; moveDirection.forward = 0; moveDirection.right = 0; }, {passive: false});
    }

    function updateJoystick(touch) {
        let rect = jZone.getBoundingClientRect();
        let dx = touch.clientX - (rect.left + rect.width / 2), dy = touch.clientY - (rect.top + rect.height / 2);
        let dist = Math.sqrt(dx*dx + dy*dy); if (dist > 40) { dx = (dx / dist) * 40; dy = (dy / dist) * 40; }
        stick.style.transform = `translate(${dx}px, ${dy}px)`; moveDirection.forward = -(dy / 40); moveDirection.right = (dx / 40);
    }

    // Камера ловит тачи ВЕЗДЕ, даже если палец нажат поверх интерфейса кнопок
    window.addEventListener('touchstart', (e) => {
        if (e.target.closest('#joystick-zone') || e.target.closest('.overlay') || e.target.closest('.small-btn')) return;
        for(let t of e.changedTouches) { if(lookTouchId === null) { lookTouchId = t.identifier; lastLookX = t.clientX; lastLookY = t.clientY; } }
    });
    window.addEventListener('touchmove', (e) => {
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
}

let clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    if (!renderer || !scene || !camera) return;
    let delta = clock.getDelta(); if (delta > 0.1) delta = 0.1;

    if (myId && hp > 0) {
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
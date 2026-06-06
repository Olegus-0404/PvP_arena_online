const SERVER_URL = "https://pvp-arena-online.onrender.com"; 
let socket;

let myId = null, myNick = "", myPass = "";
let hp = 100, armor = 0, ammo = 30, reserveAmmo = 120, kills = 0, isReloading = false, isCrouching = false;

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

// Инициализация сокетов
function initSocket() {
    try { 
        socket = io(SERVER_URL); 
    } catch(e) { 
        console.error("Ошибка сокетов:", e); 
        document.getElementById('auth-status').innerText = "Ошибка сети";
        return;
    }

    socket.on('connect', () => { 
        document.getElementById('auth-status').innerText = "Сервер онлайн! Введите данные."; 
    });
    
    socket.on('connect_error', () => { 
        document.getElementById('auth-status').innerText = "Ошибка подключения к серверу..."; 
    });
    
    socket.on('authSuccess', (data) => { 
        localStorage.setItem('n', data.nick); 
        localStorage.setItem('p', data.pass); 
        document.getElementById('auth-screen').style.display = 'none'; 
        myId = socket.id; 
    });
    
    socket.on('authFailed', (msg) => { 
        document.getElementById('btn-auth').innerText = "Войти / Создать"; 
        document.getElementById('auth-status').innerText = msg; 
    });
    
    socket.on('init', (spawnPos) => { 
        if (yawObject) {
            yawObject.position.set(spawnPos.x, 1.7, spawnPos.z); 
        }
        hp = 100; armor = 0; ammo = 30; reserveAmmo = 120; 
        updateHUD(); 
        document.getElementById('respawn-screen').style.display = 'none'; 
    });
    
    socket.on('timerUpdate', (data) => { 
        const timerEl = document.getElementById('game-timer');
        if (timerEl) {
            const m = Math.floor(data.timeLeft / 60); 
            const s = data.timeLeft % 60; 
            timerEl.innerText = `${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`; 
        }
    });

    socket.on('updatePlayers', (serverPlayers) => {
        if (!scene) return; // Защита, если сцена еще не готова
        
        if (myId && serverPlayers[myId]) {
            kills = serverPlayers[myId].kills;
            if (serverPlayers[myId].hp <= 0 && hp > 0) { 
                hp = 0; 
                stopAutofire(); 
                updateHUD(); 
                document.getElementById('respawn-screen').style.display = 'flex'; 
            }
            updateHUD();
        }
        for (let id in serverPlayers) {
            if (id === socket.id) continue;
            let pData = serverPlayers[id];
            if (!remotePlayers[id] && pData.hp > 0) {
                let group = new THREE.Group();
                let b = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.4, 12), new THREE.MeshStandardMaterial({ color: 0xff0055 })); 
                b.position.y = 0.7; b.userData = { targetId: id, zone: 'body' }; group.add(b);
                let h = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 12), new THREE.MeshStandardMaterial({ color: 0xffffff })); 
                h.position.y = 1.6; h.userData = { targetId: id, zone: 'head' }; group.add(h);
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

window.leaveMatch = function() {
    if (socket) socket.disconnect(); 
    myId = null;
    stopAutofire();
    
    if (scene) {
        for (let id in remotePlayers) { scene.remove(remotePlayers[id]); }
    }
    remotePlayers = {};

    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('btn-auth').innerText = "Войти / Создать";
    document.getElementById('auth-status').innerText = "Вы покинули матч.";
    
    initSocket();
};

window.addEventListener('DOMContentLoaded', () => {
    initEngine(); 
    initSocket(); 
    initGameSettings(); 
    setupControls();
    
    if(localStorage.getItem('n') && localStorage.getItem('p')) {
        const nickInput = document.getElementById('input-nick');
        const passInput = document.getElementById('input-pass');
        if (nickInput && passInput) {
            nickInput.value = localStorage.getItem('n'); 
            passInput.value = localStorage.getItem('p');
        }
    }
});

function initEngine() {
    const container = document.getElementById('canvas-container');
    if (!container) return;

    scene = new THREE.Scene(); scene.background = new THREE.Color(0x0a0f1d);
    window.scene = scene;
    scene.fog = new THREE.FogExp2(0x0a0f1d, 0.015);
    
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    pitchObject.add(camera); yawObject.add(pitchObject); scene.add(yawObject);

    renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    let dirLight = new THREE.DirectionalLight(0x38bdf8, 0.8); dirLight.position.set(20, 40, 20); scene.add(dirLight);

    buildMap(); createWeapon(); spawnCrates(); animate();
}

function createWeapon() {
    if (!camera) return;
    let weaponGroup = new THREE.Group();
    let barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.6, 8), new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8 })); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0, -0.3); weaponGroup.add(barrel);
    let bodyGen = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.45), new THREE.MeshStandardMaterial({ color: 0x1e293b })); bodyGen.position.set(0, -0.02, -0.1); weaponGroup.add(bodyGen);
    let sight = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.02, 0.04), new THREE.MeshBasicMaterial({ color: 0x00ffcc })); sight.position.set(0, 0.035, -0.2); weaponGroup.add(sight);
    weaponGroup.position.set(0.22, -0.2, -0.45); camera.add(weaponGroup); weaponMesh = weaponGroup;
}

function buildMap() {
    if (!scene) return;
    mapObjects.forEach(obj => scene.remove(obj)); mapObjects = []; colliders = [];
    let floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 })); floor.rotation.x = -Math.PI / 2; scene.add(floor); mapObjects.push(floor);
    let grid = new THREE.GridHelper(100, 50, 0x38bdf8, 0x1f2937); grid.position.y = 0.01; scene.add(grid); mapObjects.push(grid);
    createObstacle(0, 3, 0, 12, 6, 2, 0x334155); createObstacle(-20, 4, 20, 6, 8, 6, 0x0284c7); createObstacle(20, 4, -20, 6, 8, 6, 0x0284c7);
    createObstacle(25, 2, 15, 8, 4, 2, 0x475569); createObstacle(-25, 2, -15, 8, 4, 2, 0x475569);
}

function createObstacle(x, y, z, w, h, d, color) {
    let mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: color })); mesh.position.set(x, y, z); scene.add(mesh); mapObjects.push(mesh); colliders.push(new THREE.Box3().setFromObject(mesh));
}

function spawnCrates() {
    if (!scene) return;
    const cratePoints = [
        new THREE.Vector3(0, 0.5, 12), new THREE.Vector3(-15, 0.5, -12),
        new THREE.Vector3(15, 0.5, -12), new THREE.Vector3(22, 0.5, 22),
        new THREE.Vector3(-22, 0.5, -22)
    ];
    cratePoints.forEach((pos) => {
        let mesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.7, 0.7, 0.7),
            new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.5, roughness: 0.2, emissive: 0x451a03 })
        );
        mesh.position.copy(pos); scene.add(mesh);
        supplyCrates.push({ mesh: mesh, baseY: pos.y, active: true, respawnTime: 0 });
    });
}

function checkWallCollisions(newPos) {
    let pr = 0.6;
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
        if (window.isEditMode) return;
        
        let nickname = document.getElementById('input-nick').value.trim(); 
        let password = document.getElementById('input-pass').value.trim();
        if(nickname.length < 2 || password.length < 3) return;
        
        authBtn.innerText = "Вход..."; 
        myNick = nickname; 
        myPass = password;
        
        if (socket && socket.connected) {
            socket.emit('playerAuth', { nick: nickname, pass: password });
        } else {
            authBtn.innerText = "Войти / Создать";
            document.getElementById('auth-status').innerText = "Нет связи с сервером.";
        }
    });
}

function performShot() {
    if (isReloading || hp <= 0 || window.isEditMode || !myId) return;
    if (ammo <= 0) { stopAutofire(); startReload(); return; }

    ammo--; updateHUD();
    if(weaponMesh) { weaponMesh.position.z = -0.37; setTimeout(() => weaponMesh.position.z = -0.45, 40); }

    let raycaster = new THREE.Raycaster(); raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    let targets = []; for (let id in remotePlayers) { targets.push(...remotePlayers[id].children); }
    let intersects = raycaster.intersectObjects(targets);
    if (intersects.length > 0 && socket) {
        let obj = intersects[0].object.userData; socket.emit('playerHit', { targetId: obj.targetId, zone: obj.zone });
    }
    if (ammo <= 0) { stopAutofire(); startReload(); }
}

function startAutofire() { if (fireIntervalId !== null) return; performShot(); fireIntervalId = setInterval(performShot, 75); }
function stopAutofire() { if (fireIntervalId !== null) { clearInterval(fireIntervalId); fireIntervalId = null; } }

function startReload() {
    if (isReloading || ammo === 30 || reserveAmmo <= 0 || window.isEditMode || !myId) return;
    isReloading = true; updateHUD();
    setTimeout(() => {
        let needed = 30 - ammo; let transfer = Math.min(needed, reserveAmmo);
        ammo += transfer; reserveAmmo -= transfer; isReloading = false; updateHUD();
    }, 1200);
}

function updateHUD() {
    const elHp = document.getElementById('hud-hp');
    const elArmor = document.getElementById('hud-armor');
    const elAmmo = document.getElementById('hud-ammo');
    const elKills = document.getElementById('kills-counter');

    if(elHp) elHp.innerText = `❤️ HP: ${hp}`;
    if(elArmor) elArmor.innerText = `🛡️ Броня: ${armor}`;
    if(elAmmo) elAmmo.innerText = isReloading ? `🔄 ПЕРЕЗАРЯДКА...` : `🔫 Патроны: ${ammo} / ${reserveAmmo}`;
    if(elKills) elKills.innerText = `💀 Убийства: ${kills}`;
}

const respawnBtn = document.getElementById('btn-respawn');
if(respawnBtn) respawnBtn.addEventListener('click', () => { if(socket) socket.emit('requestRespawn'); });

function setupControls() {
    const jZone = document.getElementById('joystick-zone');
    const stick = document.getElementById('joystick-stick');
    const fireBtn = document.getElementById('btn-fire');

    if(fireBtn) {
        fireBtn.addEventListener('touchstart', (e) => { e.preventDefault(); if(!window.isEditMode) startAutofire(); });
        fireBtn.addEventListener('touchend', (e) => { e.preventDefault(); stopAutofire(); });
        fireBtn.addEventListener('touchcancel', (e) => { e.preventDefault(); stopAutofire(); });
    }

    const reloadBtn = document.getElementById('btn-reload');
    if(reloadBtn) reloadBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startReload(); });
    
    const jumpBtn = document.getElementById('btn-jump');
    if(jumpBtn) jumpBtn.addEventListener('touchstart', (e) => { e.preventDefault(); if(isGrounded && !window.isEditMode) playerVelocity.y = JUMP_FORCE; });
    
    const crouchBtn = document.getElementById('btn-crouch');
    if(crouchBtn) {
        crouchBtn.addEventListener('touchstart', (e) => { 
            e.preventDefault(); if (window.isEditMode) return;
            isCrouching = !isCrouching;
            if(isCrouching) { moveSpeed = 6; crouchBtn.style.backgroundColor = "rgba(59, 130, 246, 0.6)"; } 
            else { moveSpeed = 14; crouchBtn.style.backgroundColor = "rgba(30, 58, 138, 0.3)"; }
        });
    }

    const fsBtn = document.getElementById('btn-fullscreen');
    if(fsBtn) fsBtn.addEventListener('click', () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); });

    if(jZone && stick) {
        jZone.addEventListener('touchstart', (e) => {
            if (window.isEditMode) return; e.stopPropagation();
            let t = e.targetTouches[0]; joystickTouchId = t.identifier; updateJoystick(t);
        });
        jZone.addEventListener('touchmove', (e) => {
            if (window.isEditMode) return; e.stopPropagation();
            for(let t of e.touches) { if(t.identifier === joystickTouchId) updateJoystick(t); }
        });
        jZone.addEventListener('touchend', () => { joystickTouchId = null; stick.style.transform = `translate(0px, 0px)`; moveDirection.forward = 0; moveDirection.right = 0; });
    }

    function updateJoystick(touch) {
        let rect = jZone.getBoundingClientRect();
        let dx = touch.clientX - (rect.left + rect.width / 2); let dy = touch.clientY - (rect.top + rect.height / 2);
        let dist = Math.sqrt(dx*dx + dy*dy); if (dist > 40) { dx = (dx / dist) * 40; dy = (dy / dist) * 40; }
        stick.style.transform = `translate(${dx}px, ${dy}px)`; moveDirection.forward = -(dy / 40); moveDirection.right = (dx / 40);
    }

    window.addEventListener('touchstart', (e) => {
        if (window.isEditMode) return;
        if (e.target.closest('#joystick-zone') || e.target.closest('#settings-panel') || e.target.closest('#layout-edit-subpanel') || e.target.closest('.small-btn')) return;
        for(let t of e.changedTouches) {
            if(lookTouchId === null) { lookTouchId = t.identifier; lastLookX = t.clientX; lastLookY = t.clientY; }
        }
    });

    window.addEventListener('touchmove', (e) => {
        if (window.isEditMode) return;
        for(let t of e.changedTouches) {
            if(t.identifier === lookTouchId) {
                let dx = t.clientX - lastLookX; let dy = t.clientY - lastLookY;
                let currentSens = window.gameSettings ? window.gameSettings.sensitivity : 0.0035;
                let invertFactor = (window.gameSettings && window.gameSettings.invertY) ? -1 : 1;

                yawObject.rotation.y -= dx * currentSens; 
                pitchObject.rotation.x -= dy * currentSens * invertFactor;
                
                pitchObject.rotation.x = Math.max(-Math.PI/2.2, Math.min(Math.PI/2.2, pitchObject.rotation.x));
                lastLookX = t.clientX; lastLookY = t.clientY;
            }
        }
    }, { passive: false });

    window.addEventListener('touchend', (e) => { for(let t of e.changedTouches) { if(t.identifier === lookTouchId) lookTouchId = null; } });
    window.addEventListener('touchcancel', (e) => { for(let t of e.changedTouches) { if(t.identifier === lookTouchId) lookTouchId = null; } });
}

let clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    if (!renderer || !scene || !camera) return; // Не рендерим, если компоненты не собрались
    
    let delta = clock.getDelta(); if (delta > 0.1) delta = 0.1;

    if (myId && hp > 0) {
        playerVelocity.y -= GRAVITY * delta;
        let forwardVector = new THREE.Vector3(0, 0, -1).applyQuaternion(yawObject.quaternion);
        let sideVector = new THREE.Vector3(1, 0, 0).applyQuaternion(yawObject.quaternion);
        let moveX = (forwardVector.x * moveDirection.forward + sideVector.x * moveDirection.right) * moveSpeed * delta;
        let moveZ = (forwardVector.z * moveDirection.forward + sideVector.z * moveDirection.right) * moveSpeed * delta;

        let targetPos = yawObject.position.clone(); targetPos.x += moveX; if (!checkWallCollisions(targetPos)) yawObject.position.x = targetPos.x;
        targetPos = yawObject.position.clone(); targetPos.z += moveZ; if (!checkWallCollisions(targetPos)) yawObject.position.z = targetPos.z;

        yawObject.position.y += playerVelocity.y * delta;
        let targetHeight = isCrouching ? 0.9 : 1.7;
        if (yawObject.position.y <= targetHeight) { playerVelocity.y = 0; yawObject.position.y = targetHeight; isGrounded = true; } else { isGrounded = false; }

        supplyCrates.forEach(crate => {
            if (crate.active) {
                crate.mesh.rotation.y += 1.6 * delta;
                crate.mesh.position.y = crate.baseY + Math.sin(Date.now() * 0.004) * 0.1;
                
                let dist = yawObject.position.distanceTo(crate.mesh.position);
                if (dist < 1.4) {
                    crate.active = false; crate.mesh.visible = false;
                    crate.respawnTime = Date.now() + 12000;
                    hp = Math.min(100, hp + 30);
                    armor = Math.min(100, armor + 20);
                    reserveAmmo += 60;
                    updateHUD();
                }
            } else {
                if (Date.now() > crate.respawnTime) { crate.active = true; crate.mesh.visible = true; }
            }
        });

        if(socket && socket.connected) socket.emit('playerMove', { x: yawObject.position.x, z: yawObject.position.z, rotY: yawObject.rotation.y });
    }
    renderer.render(scene, camera);
}
window.addEventListener('resize', () => { 
    if(camera && renderer) {
        camera.aspect = window.innerWidth / window.innerHeight; 
        camera.updateProjectionMatrix(); 
        renderer.setSize(window.innerWidth, window.innerHeight); 
    }
});
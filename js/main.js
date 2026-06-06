const SERVER_URL = "https://pvp-arena-online.onrender.com"; 
let socket;

let myId = null, myNick = "", myPass = "";
let hp = 100, armor = 100, ammo = 30, reserveAmmo = 120, kills = 0, isReloading = false;

let scene, camera, renderer, weaponMesh;
let yawObject = new THREE.Object3D(), pitchObject = new THREE.Object3D();
let remotePlayers = {}, remoteBots = {}, mapObjects = [];
let moveDirection = { forward: 0, right: 0 };
let playerVelocity = new THREE.Vector3();
let isGrounded = true;

const GRAVITY = 28; const JUMP_FORCE = 11; let moveSpeed = 14;
let colliders = [];

let joystickTouchId = null, lookTouchId = null;
let lastLookX = 0, lastLookY = 0;
let fireIntervalId = null;
let isCrouching = false, isCustomizing = false;

// Настройки радара
let lastRadarPingTime = 0;
const RADAR_PING_INTERVAL = 2500; // Импульс света (сканирование врагов) каждые 2.5 секунды

window.gameSettings = { sensitivity: 0.0035, hudScale: 1.0 };

function initSocket() {
    try { socket = io(SERVER_URL); } catch(e) { return; }

    socket.on('connect', () => { document.getElementById('auth-status').innerText = "Сервер онлайн! В бой!"; });
    
    socket.on('authSuccess', (data) => { 
        localStorage.setItem('n', data.nick); localStorage.setItem('p', data.pass); 
        document.getElementById('auth-screen').style.display = 'none'; 
        myId = socket.id; 
    });
    
    socket.on('init', (spawnPos) => { 
        if (yawObject) yawObject.position.set(spawnPos.x, 1.7, spawnPos.z);
        hp = 100; armor = 100; ammo = 30; reserveAmmo = 120; updateHUD(); 
        document.getElementById('respawn-screen').style.display = 'none'; 
        if(spawnPos.map) buildMap(spawnPos.map);
    });
    
    socket.on('timerUpdate', (data) => { 
        const timerText = document.getElementById('val-timer');
        if (timerText) {
            timerText.innerHTML = data.isBreak ? `ОТДЫХ<br>${data.timeLeft}с` : `ВОЛНА ${data.wave}<br>БОТОВ: ${data.timeLeft}`;
        }
    });

    socket.on('waveCleared', () => {
        stopAutofire();
        // Сервер вылечил нас — обновляем HUD
        hp = 100; armor = 100; reserveAmmo = 120; updateHUD();
    });

    socket.on('damagedBy', (data) => { 
        triggerDamageFlash(); 
        if (data && data.shooterX !== undefined) createDamageArrow(data.shooterX, data.shooterZ);
    });

    // Обновление игроков (Союзников)
    socket.on('updatePlayers', (serverPlayers) => {
        if (!scene) return;
        if (myId && serverPlayers[myId]) {
            kills = serverPlayers[myId].kills;
            let oldHp = hp; hp = serverPlayers[myId].hp; armor = serverPlayers[myId].armor;
            if (hp <= 0 && oldHp > 0) { stopAutofire(); document.getElementById('respawn-screen').style.display = 'flex'; }
            updateHUD();
        }
        
        // Рендерим союзников (синие визоры)
        for (let id in serverPlayers) {
            if (id === socket.id) continue;
            let pData = serverPlayers[id];
            
            if (!remotePlayers[id] && pData.hp > 0) {
                let group = new THREE.Group();
                let torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.4), new THREE.MeshStandardMaterial({ color: 0x3b82f6 })); // Синий союзник
                torso.position.y = 0.9; group.add(torso);
                let head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), new THREE.MeshStandardMaterial({ color: 0xe2e8f0 }));
                head.position.y = 1.5; group.add(head);
                scene.add(group); remotePlayers[id] = group;
            }
            if (remotePlayers[id]) {
                if (pData.hp <= 0) { scene.remove(remotePlayers[id]); delete remotePlayers[id]; } 
                else { remotePlayers[id].position.set(pData.x, 0, pData.z); remotePlayers[id].rotation.y = pData.rotY; }
            }
        }
        updateMinimap(serverPlayers, remoteBots);
    });

    // Обновление БОТОВ (Врагов)
    socket.on('updateBots', (serverBots) => {
        if (!scene) return;
        for (let id in serverBots) {
            let bData = serverBots[id];
            if (!remoteBots[id]) {
                let group = new THREE.Group();
                // Красный торс для зомби-ботов
                let torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.4), new THREE.MeshStandardMaterial({ color: 0xef4444 }));
                torso.position.y = 0.9; torso.userData = { targetId: id, zone: 'body' }; group.add(torso);
                let head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), new THREE.MeshStandardMaterial({ color: 0x10b981 })); // Зеленая голова
                head.position.y = 1.5; head.userData = { targetId: id, zone: 'head' }; group.add(head);
                
                scene.add(group); remoteBots[id] = group;
            }
            remoteBots[id].position.set(bData.x, 0, bData.z);
            remoteBots[id].rotation.y = bData.rotY;
        }
        // Удаляем убитых ботов со сцены
        for (let id in remoteBots) {
            if (!serverBots[id]) { scene.remove(remoteBots[id]); delete remoteBots[id]; }
        }
    });
}

// РАДАР С ПЕРИОДИЧЕСКИМ СВЕТОМ ВРАГОВ
function updateMinimap(serverPlayers, currentBots) {
    const radar = document.getElementById('minimap-radar');
    if (!radar || !yawObject) return;

    // Очищаем старые точки (кроме нас самих)
    document.querySelectorAll('.radar-dot:not(.dot-me)').forEach(el => el.remove());

    const radarRadius = 55; // половины ширины контейнера миникарты
    const mapScale = 1.6;   // масштаб отображения мира на радаре

    let myX = yawObject.position.x;
    let myZ = yawObject.position.z;
    let myRot = yawObject.rotation.y;

    // Проверяем, пришло ли время пустить импульс "света" радара на врагов
    let doEnemyPing = false;
    if (Date.now() - lastRadarPingTime > RADAR_PING_INTERVAL) {
        doEnemyPing = true;
        lastRadarPingTime = Date.now();
    }

    // 1. Отображаем союзников (постоянно)
    for (let id in serverPlayers) {
        if (id === socket.id || serverPlayers[id].hp <= 0) continue;
        createRadarDot(serverPlayers[id].x, serverPlayers[id].z, myX, myZ, myRot, radarRadius, mapScale, 'dot-teammate', radar);
    }

    // 2. Отображаем ботов (только в момент импульса света)
    for (let id in currentBots) {
        let botPos = currentBots[id].position;
        let dot = createRadarDot(botPos.x, botPos.z, myX, myZ, myRot, radarRadius, mapScale, 'dot-enemy', radar);
        
        if (dot && doEnemyPing) {
            // Подсвечиваем врага и плавно гасим его до следующего импульса
            dot.style.opacity = '1';
            setTimeout(() => { if(dot) dot.style.opacity = '0'; }, 1800);
        }
    }
}

function createRadarDot(objX, objZ, myX, myZ, myRot, radarRadius, mapScale, className, radarContainer) {
    let dx = objX - myX;
    let dz = objZ - myZ;

    // Вращаем точку карты относительно взгляда игрока
    let rotX = dx * Math.cos(-myRot) - dz * Math.sin(-myRot);
    let rotY = dx * Math.sin(-myRot) + dz * Math.cos(-myRot);

    let pixelX = radarRadius + rotX * mapScale;
    let pixelY = radarRadius + rotY * mapScale;

    // Если точка не вылетела за круг радара — рисуем
    let distFromCenter = Math.sqrt((pixelX - radarRadius)**2 + (pixelY - radarRadius)**2);
    if (distFromCenter < radarRadius - 4) {
        let dot = document.createElement('div');
        dot.className = `radar-dot ${className}`;
        dot.style.left = pixelX + 'px';
        dot.style.top = pixelY + 'px';
        radarContainer.appendChild(dot);
        return dot;
    }
    return null;
}

function triggerDamageFlash() {
    let flash = document.getElementById('damage-flash'); if (flash) { flash.style.opacity = '0.4'; setTimeout(() => flash.style.opacity = '0', 150); }
}

function createDamageArrow(shooterX, shooterZ) {
    const container = document.getElementById('damage-indicators-container');
    if (!container || !yawObject) return;
    const arrow = document.createElement('div'); arrow.className = 'damage-arrow'; container.appendChild(arrow);

    function updateArrow() {
        if (!arrow.parentNode) return;
        let angle = Math.atan2(shooterX - yawObject.position.x, shooterZ - yawObject.position.z);
        let finalAngle = angle - yawObject.rotation.y + Math.PI;
        let offset = 70;
        arrow.style.transform = `translate(-50%, -50%) translate(${Math.sin(finalAngle)*offset}px, ${Math.cos(finalAngle)*offset}px) rotate(${-finalAngle}rad)`;
    }
    let interval = setInterval(updateArrow, 16); updateArrow();
    setTimeout(() => { arrow.style.opacity = '0'; setTimeout(() => { clearInterval(interval); arrow.remove(); }, 800); }, 800);
}

window.addEventListener('DOMContentLoaded', () => {
    initEngine(); initSocket(); setupControls(); loadHUDPositions();
    
    // Загрузка сохраненного масштаба HUD
    let savedScale = localStorage.getItem('game_hud_scale');
    if (savedScale) {
        window.gameSettings.hudScale = parseFloat(savedScale);
        document.getElementById('scale-slider').value = savedScale;
        applyHUDScale(savedScale);
    }

    if(localStorage.getItem('n') && localStorage.getItem('p')) {
        document.getElementById('input-nick').value = localStorage.getItem('n'); 
        document.getElementById('input-pass').value = localStorage.getItem('p');
    }
});

function applyHUDScale(scale) {
    document.getElementById('hud-scalable-wrapper').style.transform = `scale(${scale})`;
}

function initEngine() {
    const container = document.getElementById('canvas-container'); if (!container) return;
    scene = new THREE.Scene(); scene.background = new THREE.Color(0x05070f);
    scene.fog = new THREE.FogExp2(0x05070f, 0.02);
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    pitchObject.add(camera); yawObject.add(pitchObject); scene.add(yawObject);
    renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    let dirLight = new THREE.DirectionalLight(0x38bdf8, 0.7); dirLight.position.set(10, 30, 10); scene.add(dirLight);
    buildMap("arena"); createWeapon(); animate();
}

function createWeapon() {
    if (!camera) return;
    let weaponGroup = new THREE.Group();
    let barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5), new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness:0.7 })); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0, -0.25); weaponGroup.add(barrel);
    weaponGroup.position.set(0.2, -0.18, -0.4); camera.add(weaponGroup); weaponMesh = weaponGroup;
}

function buildMap() {
    mapObjects.forEach(obj => scene.remove(obj)); mapObjects = []; colliders = [];
    let floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x0f172a })); floor.rotation.x = -Math.PI / 2; scene.add(floor); mapObjects.push(floor);
    let grid = new THREE.GridHelper(80, 40, 0x1e40af, 0x1e293b); grid.position.y = 0.01; scene.add(grid); mapObjects.push(grid);
    // Стены периметра арены обороны
    createObstacle(0, 3, -40, 80, 6, 2, 0x1e293b); createObstacle(0, 3, 40, 80, 6, 2, 0x1e293b);
    createObstacle(-40, 3, 0, 2, 6, 80, 0x1e293b); createObstacle(40, 3, 0, 2, 6, 80, 0x1e293b);
    // Укрытия по центру
    createObstacle(-10, 2, -10, 4, 4, 4, 0x334155); createObstacle(10, 2, 10, 4, 4, 4, 0x334155);
}

function createObstacle(x, y, z, w, h, d, color) {
    let mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: color })); mesh.position.set(x, y, z); scene.add(mesh); mapObjects.push(mesh); colliders.push(new THREE.Box3().setFromObject(mesh));
}

function checkWallCollisions(newPos) {
    let pr = 0.4;
    let playerBox = new THREE.Box3(new THREE.Vector3(newPos.x - pr, newPos.y - 1.6, newPos.z - pr), new THREE.Vector3(newPos.x + pr, newPos.y + 0.2, newPos.z + pr));
    for (let i = 0; i < colliders.length; i++) { if (playerBox.intersectsBox(colliders[i])) return true; }
    return false;
}

document.getElementById('btn-auth').addEventListener('click', () => {
    let nickname = document.getElementById('input-nick').value.trim(); let password = document.getElementById('input-pass').value.trim();
    if(nickname.length < 2) return;
    myNick = nickname; myPass = password;
    if (socket && socket.connected) socket.emit('playerAuth', { nick: nickname, pass: password });
});

function performShot() {
    if (isReloading || hp <= 0 || !myId || isCustomizing) return;
    if (ammo <= 0) { stopAutofire(); startReload(); return; }
    ammo--; updateHUD();
    if(weaponMesh) { weaponMesh.position.z = -0.33; setTimeout(() => weaponMesh.position.z = -0.4, 40); }
    
    let raycaster = new THREE.Raycaster(); raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    
    // Собираем хитбоксы всех активных БОТОВ
    let targets = [];
    for (let id in remoteBots) { targets.push(...remoteBots[id].children); }
    
    let intersects = raycaster.intersectObjects(targets);
    if (intersects.length > 0 && socket) {
        let hitObj = intersects[0].object;
        if (hitObj.userData && hitObj.userData.targetId) {
            socket.emit('playerHit', { targetId: hitObj.userData.targetId, zone: hitObj.userData.zone });
        }
    }
}

function startAutofire() { if (fireIntervalId !== null) return; performShot(); fireIntervalId = setInterval(performShot, 110); }
function stopAutofire() { if (fireIntervalId !== null) { clearInterval(fireIntervalId); fireIntervalId = null; } }

function startReload() {
    if (isReloading || ammo === 30 || reserveAmmo <= 0) return;
    isReloading = true; updateHUD();
    setTimeout(() => {
        let needed = 30 - ammo; let transfer = Math.min(needed, reserveAmmo);
        ammo += transfer; reserveAmmo -= transfer; isReloading = false; updateHUD();
    }, 1200);
}

function updateHUD() {
    if(document.getElementById('val-hp')) document.getElementById('val-hp').innerText = hp;
    if(document.getElementById('val-armor')) document.getElementById('val-armor').innerText = armor;
    if(document.getElementById('val-ammo')) document.getElementById('val-ammo').innerText = isReloading ? `RELOAD...` : `${ammo} / ${reserveAmmo}`;
    if(document.getElementById('val-kills')) document.getElementById('val-kills').innerText = kills;
}

document.getElementById('btn-respawn').addEventListener('click', () => { if(socket) socket.emit('requestRespawn'); });

function setupControls() {
    const jZone = document.getElementById('joystick-zone'), stick = document.getElementById('joystick-stick');
    const menuTrigger = document.getElementById('btn-menu-trigger'), customMenu = document.getElementById('customizer-menu');

    // Ползунок изменения масштаба HUD
    document.getElementById('scale-slider').addEventListener('input', (e) => {
        let val = e.target.value;
        window.gameSettings.hudScale = parseFloat(val);
        applyHUDScale(val);
        localStorage.setItem('game_hud_scale', val);
    });

    menuTrigger.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (isCustomizing) return; isCustomizing = true; stopAutofire();
        document.body.classList.add('edit-mode'); customMenu.style.display = 'block';
    });

    document.getElementById('btn-save-hud').addEventListener('click', () => {
        isCustomizing = false; document.body.classList.remove('edit-mode'); customMenu.style.display = 'none'; saveHUDPositions();
    });

    document.getElementById('btn-fullscreen-toggle').addEventListener('click', () => {
        if (!document.fullscreenElement) { document.documentElement.requestFullscreen().catch(()=>{}); } 
        else { document.exitFullscreen(); }
    });

    document.getElementById('btn-reset-hud').addEventListener('click', () => {
        localStorage.clear(); location.reload();
    });

    document.getElementById('btn-fire').addEventListener('touchstart', (e) => { if(!isCustomizing){ e.preventDefault(); startAutofire(); } });
    document.getElementById('btn-fire').addEventListener('touchend', (e) => { if(!isCustomizing){ e.preventDefault(); stopAutofire(); } });
    document.getElementById('btn-reload').addEventListener('touchstart', (e) => { if(!isCustomizing){ e.preventDefault(); startReload(); } });
    document.getElementById('btn-jump').addEventListener('touchstart', (e) => { if(!isCustomizing){ e.preventDefault(); if(isGrounded) playerVelocity.y = JUMP_FORCE; } });
    document.getElementById('btn-crouch').addEventListener('touchstart', (e) => { 
        if(!isCustomizing){
            e.preventDefault(); isCrouching = !isCrouching; moveSpeed = isCrouching ? 6 : 14;
            document.getElementById('btn-crouch').style.backgroundColor = isCrouching ? "rgba(59, 130, 246, 0.6)" : "rgba(30, 58, 138, 0.3)";
        }
    });

    jZone.addEventListener('touchstart', (e) => { if(!isCustomizing){ e.stopPropagation(); let t = e.targetTouches[0]; joystickTouchId = t.identifier; updateJoystick(t); } });
    jZone.addEventListener('touchmove', (e) => { if(!isCustomizing){ e.stopPropagation(); for(let t of e.touches) { if(t.identifier === joystickTouchId) updateJoystick(t); } } });
    jZone.addEventListener('touchend', () => { if(!isCustomizing){ joystickTouchId = null; stick.style.transform = `translate(0px, 0px)`; moveDirection.forward = 0; moveDirection.right = 0; } });

    function updateJoystick(touch) {
        let rect = jZone.getBoundingClientRect();
        let dx = touch.clientX - (rect.left + rect.width / 2), dy = touch.clientY - (rect.top + rect.height / 2);
        let dist = Math.sqrt(dx*dx + dy*dy); if (dist > 40) { dx = (dx / dist) * 40; dy = (dy / dist) * 40; }
        stick.style.transform = `translate(${dx}px, ${dy}px)`; moveDirection.forward = -(dy / 40); moveDirection.right = (dx / 40);
    }

    window.addEventListener('touchstart', (e) => {
        if (isCustomizing || e.target.closest('#customizer-menu') || e.target.closest('.overlay')) return;
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

    let dragElement = null, dragOffsetX = 0, dragOffsetY = 0;
    document.querySelectorAll('.hud-element').forEach(el => {
        el.addEventListener('touchstart', (e) => {
            if (!isCustomizing) return; dragElement = el; let touch = e.touches[0]; let rect = el.getBoundingClientRect();
            dragOffsetX = touch.clientX - rect.left; dragOffsetY = touch.clientY - rect.top; el.style.transform = "none";
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

function saveHUDPositions() {
    let layout = {}; document.querySelectorAll('.hud-element').forEach(el => { layout[el.id] = { left: el.style.left, top: el.style.top }; });
    localStorage.setItem('hud_layout_coop', JSON.stringify(layout));
}

function loadHUDPositions() {
    let saved = localStorage.getItem('hud_layout_coop'); if (!saved) return;
    let layout = JSON.parse(saved);
    for (let id in layout) {
        let el = document.getElementById(id);
        if (el && layout[id].left) { el.style.left = layout[id].left; el.style.top = layout[id].top; el.style.right = 'auto'; el.style.bottom = 'auto'; el.style.transform = 'none'; }
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
        if (!checkWallCollisions(targetPos)) yawObject.position.x = targetPos.x;
        targetPos = yawObject.position.clone(); targetPos.z += moveZ; 
        if (!checkWallCollisions(targetPos)) yawObject.position.z = targetPos.z;

        yawObject.position.y += playerVelocity.y * delta;
        let targetHeight = isCrouching ? 0.9 : 1.7;
        if (yawObject.position.y <= targetHeight) { playerVelocity.y = 0; yawObject.position.y = targetHeight; isGrounded = true; } else { isGrounded = false; }

        if(socket && socket.connected) socket.emit('playerMove', { x: yawObject.position.x, z: yawObject.position.z, rotY: yawObject.rotation.y });
    }
    renderer.render(scene, camera);
}
window.addEventListener('resize', () => { if(camera && renderer) { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); } });
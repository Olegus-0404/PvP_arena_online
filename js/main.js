// ============================================================================
// GAME CLIENT CORE: Clean Stable Version
// ============================================================================

const DEFAULT_SERVER_URL = "https://pvp-arena-online.onrender.com"; 
let SERVER_URL = DEFAULT_SERVER_URL;
let socket = null;

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

let scene, camera, renderer, weaponMesh;
let yawObject = new THREE.Object3D(), pitchObject = new THREE.Object3D();
let moveDirection = { forward: 0, right: 0 };
let playerVelocity = new THREE.Vector3();
let isGrounded = true;

const GRAVITY = 38;      
const JUMP_FORCE = 8.5;  
let moveSpeed = 6.0;     

window.gameSettings = { sensitivity: 0.0035 };

window.switchWeapon = function(weaponKey) {
    if (!WEAPONS[weaponKey]) return;
    currentWeaponKey = weaponKey;
    ammo = WEAPONS[weaponKey].ammo;
    reserveAmmo = WEAPONS[weaponKey].maxReserve;
    updateHUD();
};

window.addEventListener('DOMContentLoaded', () => {
    initEngine(); 
    setupControls();
    
    // Автоматический коннект, если позывной уже сохранен
    let savedNick = localStorage.getItem('stalker_nick');
    if (savedNick) {
        myNick = savedNick;
        let authScreen = document.getElementById('auth-screen');
        if (authScreen) authScreen.style.display = 'none';
        connectToServer();
    }
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
    
    let floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x2b3028 })); 
    floor.rotation.x = -Math.PI / 2; 
    scene.add(floor);
    
    animate();
}

function updateHUD() {
    let hpEl = document.getElementById('val-hp');
    let ammoEl = document.getElementById('val-ammo');
    if (hpEl) hpEl.innerText = Math.max(0, hp);
    if (ammoEl) ammoEl.innerText = currentWeaponKey === 'knife' ? '∞' : `${ammo} / ${reserveAmmo}`;
}

function setupControls() {
    window.addEventListener('keydown', (e) => {
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
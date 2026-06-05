import * as THREE from './libs/three.module.js';

// ======= Сцена =======
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 1000);
camera.position.y = 2;
camera.position.z = 5;

const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Свет
const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 10, 5);
scene.add(light);

// Пол
const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(50,50),
    new THREE.MeshStandardMaterial({ color:0x228B22 })
);
floor.rotation.x = -Math.PI/2;
scene.add(floor);

// ======= Мультиплеер =======
const socket = new WebSocket('wss://твой-сервер'); // <-- замени на свой сервер
let playerId;
let players = {};  // состояние всех игроков
const playerMeshes = {};

// Получение данных от сервера
socket.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.type === 'init') {
        playerId = data.id;
        players = data.players;
        for(const id in players) addPlayerMesh(id, players[id]);
    }
    if (data.type === 'state') {
        for(const id in data.players){
            if(!players[id]) addPlayerMesh(id, data.players[id]);
            players[id] = data.players[id];
            updatePlayerMesh(id, data.players[id]);
        }
    }
};

// ======= Игроки =======
function addPlayerMesh(id, info){
    const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1,2,1),
        new THREE.MeshStandardMaterial({ color: id===playerId?0x0000ff:0xff0000 })
    );
    scene.add(mesh);
    playerMeshes[id] = mesh;
}

function updatePlayerMesh(id, info){
    const mesh = playerMeshes[id];
    if(!mesh) return;
    mesh.position.set(info.x, info.y, info.z);
    mesh.rotation.y = info.rotY || 0;
}

// ======= Управление =======
let move = { x:0, z:0 };
let rotX = 0, rotY = 0;

// Джойстик для мобильных
const joystick = nipplejs.create({
    zone: document.body,
    mode: 'static',
    position: { left:'100px', bottom:'100px' },
    color:'blue',
    size:100
});

joystick.on('move', (evt, data)=>{
    move.x = data.vector.x;
    move.z = data.vector.y;
});

joystick.on('end', ()=>{ move.x=0; move.z=0; });

// Свайпы для камеры
let lastTouchX, lastTouchY;
document.addEventListener('touchstart', e=>{
    if(e.touches.length===1){
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;
    }
});
document.addEventListener('touchmove', e=>{
    if(e.touches.length===1){
        const dx = e.touches[0].clientX - lastTouchX;
        const dy = e.touches[0].clientY - lastTouchY;
        lastTouchX = e.touches[0].clientX;
        lastTouchY = e.touches[0].clientY;

        rotY -= dx*0.005;
        rotX -= dy*0.005;
        rotX = Math.max(-Math.PI/2, Math.min(Math.PI/2, rotX));
    }
});

// Кнопка стрельбы
document.getElementById('shootBtn').addEventListener('touchstart', shoot);
document.getElementById('shootBtn').addEventListener('mousedown', shoot);

function shoot(){
    if(!players[playerId]) return;
    const p = players[playerId];
    socket.send(JSON.stringify({
        type:'shoot',
        payload:{ x:p.x, y:p.y, z:p.z, rotY }
    }));
}

// ======= Анимация =======
function animate(){
    requestAnimationFrame(animate);

    if(playerId && players[playerId]){
        const p = players[playerId];
        p.x += move.x*0.1;
        p.z += move.z*0.1;
        p.rotY = rotY;
        socket.send(JSON.stringify({ type:'update', payload:p }));
    }

    camera.rotation.x = rotX;
    camera.rotation.y = rotY;
    renderer.render(scene,camera);
}
animate();

// ======= Адаптация под экран =======
window.addEventListener('resize', ()=>{
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
// ============================================================================
// PLAYERS: отрисовка других игроков настоящими моделями из Blender/Kimi
// с анимацией через AnimationMixer.
// ============================================================================

// Пути предполагают папку /models/ в корне репозитория — поправь, если
// положишь файлы в другое место.
const SOLDIER_MODELS = {
    stalker: 'models/soldier_stalker.glb',
    military: 'models/soldier_military.glb'
};

const otherPlayerMeshes = {}; // id -> { group, mixer, actions, currentAction, nameSprite, lastPos, skin }
const gltfCache = {}; // url -> gltf (грузим модель один раз, дальше клонируем)

function loadGltfCached(url, callback) {
    if (gltfCache[url]) { callback(gltfCache[url]); return; }
    if (typeof THREE.GLTFLoader === 'undefined') {
        console.warn('GLTFLoader не подключен — модели бойцов не загрузятся');
        return;
    }
    new THREE.GLTFLoader().load(
        url,
        (gltf) => { gltfCache[url] = gltf; callback(gltf); },
        undefined,
        (err) => console.error('Не удалось загрузить модель бойца:', url, err)
    );
}

function pickSkinFor(team) {
    // stalker — команда blue, military — команда red.
    // Если команда неизвестна (сервер ещё не прислал), fallback на stalker.
    return team === 'red' ? 'military' : 'stalker';
}

function createNameSprite(text) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 32px sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2, 0.5, 1);
    return sprite;
}

function spawnPlayerModel(id, nick, team) {
    const G = window.Game;
    const skin = pickSkinFor(team);

    // Placeholder-капсула, видна сразу, пока грузится настоящая модель
    const placeholder = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 2.2, 10),
        new THREE.MeshStandardMaterial({ color: 0x888888 })
    );
    placeholder.position.y = 1.1;
    placeholder.name = '__placeholder';

    const group = new THREE.Group();
    group.add(placeholder);

    const nameSprite = createNameSprite(nick || '???');
    nameSprite.position.y = 3.3;
    group.add(nameSprite);

    const entry = { group, mixer: null, actions: {}, currentAction: null, nameSprite, lastPos: null, skin };
    otherPlayerMeshes[id] = entry;
    G.scene.add(group);

    loadGltfCached(SOLDIER_MODELS[skin], (gltf) => {
        // Игрок мог уже отключиться, пока грузилась модель
        if (!otherPlayerMeshes[id]) return;

        group.remove(placeholder);

        const model = gltf.scene.clone(true);
        group.add(model);

        const mixer = new THREE.AnimationMixer(model);
        const actions = {};
        ['idle', 'walk'].forEach((name) => {
            const clip = THREE.AnimationClip.findByName(gltf.animations, name);
            if (clip) actions[name] = mixer.clipAction(clip);
        });

        entry.mixer = mixer;
        entry.actions = actions;
        if (actions.idle) {
            actions.idle.play();
            entry.currentAction = 'idle';
        }
    });

    return entry;
}

function setPlayerAnimation(entry, name) {
    if (!entry.mixer || !entry.actions[name] || entry.currentAction === name) return;
    const next = entry.actions[name];
    const prev = entry.actions[entry.currentAction];
    next.reset().play();
    if (prev) prev.crossFadeTo(next, 0.2, false);
    entry.currentAction = name;
}

// Вызывается из network.js при каждом 'updatePlayers'
function syncOtherPlayers(playersData) {
    const G = window.Game;
    if (!G.scene) return;

    const seenIds = new Set();

    for (const id in playersData) {
        if (id === G.myId) continue;
        seenIds.add(id);
        const data = playersData[id];
        if (!data) continue;

        let entry = otherPlayerMeshes[id];
        if (!entry) entry = spawnPlayerModel(id, data.nick, data.team);

        entry.group.visible = !(data.hp <= 0);

        const groundY = typeof getGroundHeight === 'function' ? getGroundHeight(data.x || 0, data.z || 0) : 0;
        const newPos = { x: data.x || 0, z: data.z || 0 };

        // Ходит или стоит — по разнице позиций между апдейтами
        if (entry.lastPos) {
            const moved = Math.hypot(newPos.x - entry.lastPos.x, newPos.z - entry.lastPos.z);
            setPlayerAnimation(entry, moved > 0.03 ? 'walk' : 'idle');
        }
        entry.lastPos = newPos;

        entry.group.position.set(newPos.x, groundY, newPos.z);
        if (typeof data.rotY === 'number') {
            entry.group.rotation.y = data.rotY;
        }
    }

    for (const id in otherPlayerMeshes) {
        if (!seenIds.has(id)) {
            G.scene.remove(otherPlayerMeshes[id].group);
            delete otherPlayerMeshes[id];
        }
    }
}

// Вызывается из главного цикла рендера в engine.js
function updateOtherPlayerAnimations(delta) {
    for (const id in otherPlayerMeshes) {
        const entry = otherPlayerMeshes[id];
        if (entry.mixer) entry.mixer.update(delta);
    }
}

function getOtherPlayerMesh(id) {
    return otherPlayerMeshes[id] || null;
}
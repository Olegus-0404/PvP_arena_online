// ============================================================================
// PLAYERS: отрисовка других игроков на сцене.
// Сейчас — простая болванка (тело+голова+подпись ником).
// Когда появятся модельки из Blender — меняем только createPlayerMesh(),
// остальная логика (создание/обновление/удаление по данным с сервера)
// трогать не придётся.
// ============================================================================

const otherPlayerMeshes = {}; // id -> { group, nameSprite }

function createPlayerMesh(nick) {
    const group = new THREE.Group();

    const bodyColor = colorFromString(nick || 'player');

    const body = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 2.2, 12),
        new THREE.MeshStandardMaterial({ color: bodyColor })
    );
    body.position.y = 1.1;
    group.add(body);

    const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.4, 12, 12),
        new THREE.MeshStandardMaterial({ color: 0xd9b38c })
    );
    head.position.y = 2.55;
    group.add(head);

    const nameSprite = createNameSprite(nick || '???');
    nameSprite.position.y = 3.3;
    group.add(nameSprite);

    return { group, nameSprite };
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

function colorFromString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
    const hue = Math.abs(hash) % 360;
    const color = new THREE.Color();
    color.setHSL(hue / 360, 0.55, 0.5);
    return color;
}

// Вызывается из network.js при каждом 'updatePlayers'
function syncOtherPlayers(playersData) {
    const G = window.Game;
    if (!G.scene) return;

    const seenIds = new Set();

    for (const id in playersData) {
        if (id === G.myId) continue; // себя не рисуем
        seenIds.add(id);
        const data = playersData[id];
        if (!data) continue;

        let entry = otherPlayerMeshes[id];
        if (!entry) {
            entry = createPlayerMesh(data.nick);
            otherPlayerMeshes[id] = entry;
            G.scene.add(entry.group);
        }

        // Мёртвых просто прячем, а не удаляем — чтобы не пересоздавать
        // модель на каждый респавн
        entry.group.visible = !(data.hp <= 0);

        entry.group.position.set(data.x || 0, 0, data.z || 0);
        if (typeof data.rotY === 'number') {
            entry.group.rotation.y = data.rotY;
        }
    }

    // Удаляем игроков, которых больше нет в снапшоте (вышли из игры)
    for (const id in otherPlayerMeshes) {
        if (!seenIds.has(id)) {
            G.scene.remove(otherPlayerMeshes[id].group);
            delete otherPlayerMeshes[id];
        }
    }
}

function getOtherPlayerMesh(id) {
    return otherPlayerMeshes[id] || null;
}

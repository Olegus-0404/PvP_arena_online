 // ============================================================================
// ENGINE: three.js сцена, камера, рендерер, физика, игровой цикл.
// ============================================================================

function initEngine() {
    const G = window.Game;
    const container = document.getElementById('canvas-container') || document.body;

    G.yawObject = new THREE.Object3D();
    G.pitchObject = new THREE.Object3D();
    G.playerVelocity = new THREE.Vector3();

    G.scene = new THREE.Scene();
    G.scene.background = new THREE.Color(0x3a403b);

    const size = getContainerSize(container);
    G.camera = new THREE.PerspectiveCamera(75, size.w / size.h, 0.1, 1000);
    G.pitchObject.add(G.camera);
    G.yawObject.add(G.pitchObject);
    G.yawObject.position.set(0, 3.5, 0);
    G.scene.add(G.yawObject);

    G.renderer = new THREE.WebGLRenderer({ antialias: true });
    G.renderer.setPixelRatio(window.devicePixelRatio || 1);

    // КЛЮЧЕВОЙ ФИКС ЧЁРНОЙ ОБЛАСТИ:
    // Раньше канвасу выставлялся фиксированный пиксельный размер через
    // window.innerWidth/innerHeight в момент первого рендера. На мобильном
    // Chrome это значение в первый момент может не совпадать с реальным
    // видимым вьюпортом (адресная строка, safe-area и т.д.), а событие
    // 'resize' после этого часто просто не срабатывает — отсюда чёрная
    // полоса снизу/сбоку.
    //
    // Теперь CSS-размер канваса жёстко 100%/100% от контейнера (контейнер
    // сам абсолютно спозиционирован на весь экран), а JS только обновляет
    // ВНУТРЕННЕЕ разрешение рендера через ResizeObserver — он следит за
    // реальным размером контейнера в пикселях и не зависит от капризов
    // window.innerHeight.
    G.renderer.domElement.style.display = 'block';
    G.renderer.domElement.style.width = '100%';
    G.renderer.domElement.style.height = '100%';
    container.appendChild(G.renderer.domElement);

    G.scene.add(new THREE.HemisphereLight(0xddeeff, 0x334422, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 0.9);
    sun.position.set(50, 80, 30);
    G.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-40, 50, -30);
    G.scene.add(fill);

    // Временный плоский пол — виден, пока грузится настоящая карта
    const tempFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200),
        new THREE.MeshStandardMaterial({ color: 0x2b3028 })
    );
    tempFloor.rotation.x = -Math.PI / 2;
    tempFloor.name = '__temp_floor';
    G.scene.add(tempFloor);

    resizeToContainer(container);
    setupRobustResize(container);
    loadMap();

    animate();
}

// Путь предполагает, что .glb файлы лежат в /models/ — если положишь
// их в другую папку, поменяй пути ниже.
const MAP_URL = 'models/chernobyl_pvp_map.glb';

function loadMap() {
    const G = window.Game;
    if (typeof THREE.GLTFLoader === 'undefined') {
        console.warn('GLTFLoader не подключен — карта не загрузится');
        return;
    }
    new THREE.GLTFLoader().load(
        MAP_URL,
        (gltf) => {
            const tempFloor = G.scene.getObjectByName('__temp_floor');
            if (tempFloor) G.scene.remove(tempFloor);

            G.scene.add(gltf.scene);

            // Собираем все меши карты для рейкаста земли под ногами
            G.mapMeshes = [];
            gltf.scene.traverse((obj) => {
                if (obj.isMesh) G.mapMeshes.push(obj);
            });
        },
        undefined,
        (err) => console.error('Не удалось загрузить карту:', err)
    );
}

const groundRaycaster = new THREE.Raycaster();
let groundRaycastErrorLogged = false;

// Рейкаст вниз по реальной геометрии карты — рельеф неровный (терраин
// от -0.6 до 6.9 по высоте), поэтому фиксированный groundLevel не подходит.
// Обёрнуто в try/catch: если тут когда-то вылетит исключение, JS убьёт
// остаток кадра animate() ДО строчки, которая прижимает игрока к земле —
// а гравитация продолжит копиться бесконечно. Отсюда, похоже, и было
// "проваливаюсь под карту": ошибка в рейкасте безопасно проглатывалась
// как необработанное исключение и полностью отключала коллизию с землёй.
function getGroundHeight(x, z) {
    const G = window.Game;
    if (!G.mapMeshes || G.mapMeshes.length === 0) return 0; // карта ещё не загрузилась
    try {
        groundRaycaster.set(new THREE.Vector3(x, 60, z), new THREE.Vector3(0, -1, 0));
        const hits = groundRaycaster.intersectObjects(G.mapMeshes, false);
        return hits.length > 0 ? hits[0].point.y : 0;
    } catch (err) {
        if (!groundRaycastErrorLogged) {
            groundRaycastErrorLogged = true;
            console.error('Ошибка рейкаста земли (дальше будет использован запасной уровень 0):', err);
        }
        return 0;
    }
}

function getContainerSize(container) {
    return {
        w: container.clientWidth || window.innerWidth,
        h: container.clientHeight || window.innerHeight
    };
}

function resizeToContainer(container) {
    const G = window.Game;
    if (!G.camera || !G.renderer) return;
    const size = getContainerSize(container);
    if (size.w === 0 || size.h === 0) return;

    G.camera.aspect = size.w / size.h;
    G.camera.updateProjectionMatrix();
    // "false" — не трогать CSS-стиль канваса (он уже 100%/100%),
    // обновляем только внутреннее разрешение рендер-буфера
    G.renderer.setSize(size.w, size.h, false);
}

function setupRobustResize(container) {
    // ResizeObserver реагирует на реальное изменение размеров контейнера —
    // это надёжнее, чем window 'resize', которое на мобильных браузерах
    // может не сработать при скрытии/появлении адресной строки.
    if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => resizeToContainer(container));
        observer.observe(container);
    }

    // Оставляем и старые способы как подстраховку
    window.addEventListener('resize', () => resizeToContainer(container));
    window.addEventListener('orientationchange', () => {
        setTimeout(() => resizeToContainer(container), 200);
    });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', () => resizeToContainer(container));
    }
}

function setCrouch(state) {
    const G = window.Game;
    const C = window.GameConfig;
    G.isCrouching = state;
    G.moveSpeed = state ? C.CROUCH_SPEED : C.NORMAL_SPEED;
}

function animate() {
    requestAnimationFrame(animate);

    const G = window.Game;
    const C = window.GameConfig;
    const delta = 0.016;
    const now = performance.now();

    if (G.firingHeld && typeof tryFire === 'function') tryFire(now);

    G.playerVelocity.y -= C.GRAVITY * delta;

    const moveVector = new THREE.Vector3(G.moveDirection.right, 0, -G.moveDirection.forward).normalize();
    moveVector.applyQuaternion(G.yawObject.quaternion);

    G.yawObject.position.x += moveVector.x * G.moveSpeed * delta;
    G.yawObject.position.z += moveVector.z * G.moveSpeed * delta;
    G.yawObject.position.y += G.playerVelocity.y * delta;

    const eyeOffset = G.isCrouching ? 2.2 : 3.0;
    const groundY = getGroundHeight(G.yawObject.position.x, G.yawObject.position.z);
    const groundLevel = groundY + eyeOffset;
    if (G.yawObject.position.y <= groundLevel) {
        G.yawObject.position.y = groundLevel;
        G.playerVelocity.y = 0;
        G.isGrounded = true;
    }

    // Жёсткий предохранитель: если игрок каким-то образом оказался
    // намного ниже разумного уровня (провалился сквозь геометрию,
    // застрял в коллизии и т.п.) — не даём падать бесконечно, а
    // возвращаем на текущую точку X/Z чуть выше земли.
    if (G.yawObject.position.y < groundY - 15) {
        G.yawObject.position.y = groundLevel;
        G.playerVelocity.y = 0;
        G.isGrounded = true;
    }

    if (typeof sendPositionUpdate === 'function') sendPositionUpdate(now);
    if (typeof updateOtherPlayerAnimations === 'function') updateOtherPlayerAnimations(delta);

    G.renderer.render(G.scene, G.camera);
}
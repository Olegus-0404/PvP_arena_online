// ============================================================================
// ENGINE: Three.js сцена, камера, карта GLB, физика и игровой цикл
// ============================================================================

function initEngine() {
    const G = window.Game;
    const container = document.getElementById('canvas-container') || document.body;

    G.yawObject = new THREE.Object3D();
    G.pitchObject = new THREE.Object3D();
    G.playerVelocity = new THREE.Vector3();

    G.scene = new THREE.Scene();
    G.scene.background = new THREE.Color(0x3a403b);

    G.mapRoot = null;
    G.mapMeshes = [];
    G.mapLoaded = false;
    G.fallbackFloor = null;
    G.groundRaycaster = new THREE.Raycaster();

    const size = getContainerSize(container);

    G.camera = new THREE.PerspectiveCamera(
        75,
        size.w / size.h,
        0.1,
        1000
    );

    G.pitchObject.add(G.camera);
    G.yawObject.add(G.pitchObject);

    G.yawObject.position.set(0, 3.5, 0);

    G.scene.add(G.yawObject);

    G.renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false
    });

    G.renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, 2)
    );

    G.renderer.domElement.style.display = 'block';
    G.renderer.domElement.style.width = '100%';
    G.renderer.domElement.style.height = '100%';

    container.appendChild(G.renderer.domElement);

    const hemiLight = new THREE.HemisphereLight(
        0xddeeff,
        0x334422,
        1.0
    );

    G.scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(
        0xffffff,
        0.7
    );

    sunLight.position.set(50, 100, 30);
    G.scene.add(sunLight);

    createFallbackFloor();
    loadChernobylMap();

    resizeToContainer(container);
    setupRobustResize(container);

    animate();
}


// ============================================================================
// ВРЕМЕННЫЙ ПОЛ
// ============================================================================

function createFallbackFloor() {
    const G = window.Game;

    const geometry = new THREE.PlaneGeometry(400, 400);

    const material = new THREE.MeshStandardMaterial({
        color: 0x2b3028,
        roughness: 1
    });

    const floor = new THREE.Mesh(
        geometry,
        material
    );

    floor.rotation.x = -Math.PI / 2;
    floor.name = '__fallback_floor';

    G.fallbackFloor = floor;

    G.scene.add(floor);
}


// ============================================================================
// ЗАГРУЗКА КАРТЫ
// ============================================================================

function loadChernobylMap() {
    const G = window.Game;

    if (
        typeof THREE === 'undefined' ||
        typeof THREE.GLTFLoader === 'undefined'
    ) {
        console.error('[MAP] GLTFLoader не найден');
        return;
    }

    const loader = new THREE.GLTFLoader();

    console.log('[MAP] Загрузка chernobyl_pvp_map.glb...');

    loader.load(
        'models/chernobyl_pvp_map.glb',

        function (gltf) {
            const map = gltf.scene;

            map.name = 'ChernobylPvPMap';

            map.traverse(function (object) {
                if (!object.isMesh) return;

                object.castShadow = true;
                object.receiveShadow = true;

                G.mapMeshes.push(object);
            });

            G.mapRoot = map;
            G.mapLoaded = true;

            G.scene.add(map);

            if (G.fallbackFloor) {
                G.scene.remove(G.fallbackFloor);

                if (G.fallbackFloor.geometry) {
                    G.fallbackFloor.geometry.dispose();
                }

                if (G.fallbackFloor.material) {
                    G.fallbackFloor.material.dispose();
                }

                G.fallbackFloor = null;
            }

            console.log(
                '[MAP] Карта загружена. Объектов:',
                G.mapMeshes.length
            );

            const spawnBlue = map.getObjectByName('spawn_blue');
            const spawnRed = map.getObjectByName('spawn_red');

            if (spawnBlue) {
                console.log(
                    '[MAP] Найден spawn_blue:',
                    spawnBlue.position
                );
            }

            if (spawnRed) {
                console.log(
                    '[MAP] Найден spawn_red:',
                    spawnRed.position
                );
            }
        },

        function (progress) {
            if (progress.total > 0) {
                const percent =
                    Math.round(
                        (progress.loaded / progress.total) * 100
                    );

                console.log('[MAP] Загрузка:', percent + '%');
            }
        },

        function (error) {
            console.error(
                '[MAP] Ошибка загрузки chernobyl_pvp_map.glb:',
                error
            );
        }
    );
}


// ============================================================================
// ВЫСОТА ЗЕМЛИ / КАРТЫ
// ============================================================================

function getGroundHeight(x, z) {
    const G = window.Game;

    if (!G.mapLoaded || !G.mapMeshes.length) {
        return 0;
    }

    const origin = new THREE.Vector3(
        x,
        100,
        z
    );

    const direction = new THREE.Vector3(
        0,
        -1,
        0
    );

    G.groundRaycaster.set(
        origin,
        direction
    );

    const hits =
        G.groundRaycaster.intersectObjects(
            G.mapMeshes,
            true
        );

    if (!hits.length) {
        return 0;
    }

    return hits[0].point.y;
}


// ============================================================================
// RESIZE
// ============================================================================

function getContainerSize(container) {
    return {
        w: container.clientWidth || window.innerWidth,
        h: container.clientHeight || window.innerHeight
    };
}


function resizeToContainer(container) {
    const G = window.Game;

    if (!G.camera || !G.renderer) {
        return;
    }

    const size = getContainerSize(container);

    if (size.w === 0 || size.h === 0) {
        return;
    }

    G.camera.aspect =
        size.w / size.h;

    G.camera.updateProjectionMatrix();

    G.renderer.setSize(
        size.w,
        size.h,
        false
    );
}


function setupRobustResize(container) {
    if (typeof ResizeObserver !== 'undefined') {
        const observer =
            new ResizeObserver(function () {
                resizeToContainer(container);
            });

        observer.observe(container);
    }

    window.addEventListener(
        'resize',
        function () {
            resizeToContainer(container);
        }
    );

    window.addEventListener(
        'orientationchange',
        function () {
            setTimeout(
                function () {
                    resizeToContainer(container);
                },
                200
            );
        }
    );

    if (window.visualViewport) {
        window.visualViewport.addEventListener(
            'resize',
            function () {
                resizeToContainer(container);
            }
        );
    }
}


// ============================================================================
// ПРИСЕДАНИЕ
// ============================================================================

function setCrouch(state) {
    const G = window.Game;
    const C = window.GameConfig;

    G.isCrouching = state;

    G.moveSpeed =
        state
            ? C.CROUCH_SPEED
            : C.NORMAL_SPEED;
}


// ============================================================================
// ИГРОВОЙ ЦИКЛ
// ============================================================================

let lastPlayersObject = null;
let lastAnimationTime = performance.now();

function animate() {
    requestAnimationFrame(animate);

    const G = window.Game;
    const C = window.GameConfig;

    const now = performance.now();

    const delta =
        Math.min(
            (now - lastAnimationTime) / 1000,
            0.05
        );

    lastAnimationTime = now;

    if (!G.scene || !G.camera || !G.renderer) {
        return;
    }


    // ------------------------------------------------------------------------
    // Обновление моделей других игроков
    // ------------------------------------------------------------------------

    if (
        G.otherPlayers &&
        G.otherPlayers !== lastPlayersObject &&
        typeof syncOtherPlayers === 'function'
    ) {
        syncOtherPlayers(G.otherPlayers);
        lastPlayersObject = G.otherPlayers;
    }

    if (
        typeof updateOtherPlayerAnimations === 'function'
    ) {
        updateOtherPlayerAnimations(delta);
    }


    // ------------------------------------------------------------------------
    // Гравитация
    // ------------------------------------------------------------------------

    G.playerVelocity.y -=
        C.GRAVITY * delta;


    // ------------------------------------------------------------------------
    // Движение
    // ------------------------------------------------------------------------

    const inputX =
        Number(G.moveDirection.right) || 0;

    const inputZ =
        Number(G.moveDirection.forward) || 0;

    const moveVector =
        new THREE.Vector3(
            inputX,
            0,
            -inputZ
        );

    if (moveVector.lengthSq() > 1) {
        moveVector.normalize();
    }

    moveVector.applyQuaternion(
        G.yawObject.quaternion
    );

    G.yawObject.position.x +=
        moveVector.x *
        G.moveSpeed *
        delta;

    G.yawObject.position.z +=
        moveVector.z *
        G.moveSpeed *
        delta;


    // ------------------------------------------------------------------------
    // Земля
    // ------------------------------------------------------------------------

    const ground =
        getGroundHeight(
            G.yawObject.position.x,
            G.yawObject.position.z
        );

    const playerHeight =
        G.isCrouching
            ? 2.2
            : 3.0;

    const targetY =
        ground + playerHeight;


    G.yawObject.position.y +=
        G.playerVelocity.y *
        delta;


    if (
        G.yawObject.position.y <=
        targetY
    ) {
        G.yawObject.position.y =
            targetY;

        G.playerVelocity.y = 0;

        G.isGrounded = true;
    } else {
        G.isGrounded = false;
    }


    // ------------------------------------------------------------------------
    // Отправка позиции на сервер
    // ------------------------------------------------------------------------

    if (
        typeof sendPositionUpdate === 'function'
    ) {
        sendPositionUpdate(now);
    }


    // ------------------------------------------------------------------------
    // Рендер
    // ------------------------------------------------------------------------

    G.renderer.render(
        G.scene,
        G.camera
    );
}
// ============================================================================
// ENGINE
// Three.js сцена, камера, карта GLB, физика и игровой цикл
// ============================================================================

let lastPlayersObject = null;
let lastAnimationTime = performance.now();

function initEngine() {
    const G = window.Game;
    const container =
        document.getElementById('canvas-container') ||
        document.body;

    // ------------------------------------------------------------------------
    // Базовые объекты игрока
    // ------------------------------------------------------------------------

    G.yawObject = new THREE.Object3D();
    G.pitchObject = new THREE.Object3D();
    G.playerVelocity = new THREE.Vector3();

    G.scene = new THREE.Scene();
    G.scene.background = new THREE.Color(0x3a403b);

    // ------------------------------------------------------------------------
    // Данные карты
    // ------------------------------------------------------------------------

    G.mapRoot = null;
    G.mapMeshes = [];
    G.mapLoaded = false;
    G.mapBounds = null;
    G.mapCenter = new THREE.Vector3();
    G.mapSize = new THREE.Vector3();

    G.fallbackFloor = null;
    G.groundRaycaster = new THREE.Raycaster();

    // ------------------------------------------------------------------------
    // Камера
    // ------------------------------------------------------------------------

    const size = getContainerSize(container);

    G.camera = new THREE.PerspectiveCamera(
        75,
        size.w / size.h,
        0.1,
        5000
    );

    G.pitchObject.add(G.camera);
    G.yawObject.add(G.pitchObject);

    // Нормальная стартовая высота.
    G.yawObject.position.set(0, 3, 0);

    G.scene.add(G.yawObject);

    // ------------------------------------------------------------------------
    // Renderer
    // ------------------------------------------------------------------------

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

    // ------------------------------------------------------------------------
    // Освещение
    // ------------------------------------------------------------------------

    const hemiLight = new THREE.HemisphereLight(
        0xddeeff,
        0x334422,
        1.0
    );

    G.scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(
        0xffffff,
        0.8
    );

    sunLight.position.set(50, 100, 30);

    G.scene.add(sunLight);

    // ------------------------------------------------------------------------
    // Временный пол
    // ------------------------------------------------------------------------

    createFallbackFloor();

    // ------------------------------------------------------------------------
    // Загрузка карты
    // ------------------------------------------------------------------------

    loadChernobylMap();

    // ------------------------------------------------------------------------
    // Resize
    // ------------------------------------------------------------------------

    resizeToContainer(container);
    setupRobustResize(container);

    // ------------------------------------------------------------------------
    // Игровой цикл
    // ------------------------------------------------------------------------

    lastAnimationTime = performance.now();
    animate();
}


// ============================================================================
// ВРЕМЕННЫЙ ПОЛ
// ============================================================================

function createFallbackFloor() {
    const G = window.Game;

    const geometry =
        new THREE.PlaneGeometry(500, 500);

    const material =
        new THREE.MeshStandardMaterial({
            color: 0x2b3028,
            roughness: 1
        });

    const floor =
        new THREE.Mesh(
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
        console.error(
            '[MAP] GLTFLoader не найден'
        );

        return;
    }

    const loader =
        new THREE.GLTFLoader();

    const mapPath =
        'models/chernobyl_pvp_map.glb';

    console.log(
        '[MAP] Загрузка:',
        mapPath
    );

    loader.load(
        mapPath,

        function (gltf) {
            const map =
                gltf.scene;

            if (!map) {
                console.error(
                    '[MAP] GLB не содержит scene'
                );

                return;
            }

            map.name =
                'ChernobylPvPMap';

            G.mapMeshes = [];

            // ----------------------------------------------------------------
            // Подготовка объектов карты
            // ----------------------------------------------------------------

            map.traverse(function (object) {
                if (!object.isMesh) {
                    return;
                }

                object.castShadow = true;
                object.receiveShadow = true;

                G.mapMeshes.push(object);
            });

            if (!G.mapMeshes.length) {
                console.warn(
                    '[MAP] В GLB не найдено Mesh-объектов'
                );
            }

            // ----------------------------------------------------------------
            // Добавляем карту в сцену
            // ----------------------------------------------------------------

            G.mapRoot = map;

            G.scene.add(map);

            // ----------------------------------------------------------------
            // Считаем реальные размеры карты
            // ----------------------------------------------------------------

            const bounds =
                new THREE.Box3()
                    .setFromObject(map);

            G.mapBounds =
                bounds.clone();

            bounds.getCenter(
                G.mapCenter
            );

            bounds.getSize(
                G.mapSize
            );

            console.log(
                '[MAP] Размер:',
                G.mapSize.x.toFixed(2),
                G.mapSize.y.toFixed(2),
                G.mapSize.z.toFixed(2)
            );

            console.log(
                '[MAP] Центр:',
                G.mapCenter.x.toFixed(2),
                G.mapCenter.y.toFixed(2),
                G.mapCenter.z.toFixed(2)
            );

            // ----------------------------------------------------------------
            // Убираем fallback
            // ----------------------------------------------------------------

            if (G.fallbackFloor) {
                G.scene.remove(
                    G.fallbackFloor
                );

                if (
                    G.fallbackFloor.geometry
                ) {
                    G.fallbackFloor.geometry.dispose();
                }

                if (
                    G.fallbackFloor.material
                ) {
                    G.fallbackFloor.material.dispose();
                }

                G.fallbackFloor = null;
            }

            G.mapLoaded = true;

            // ----------------------------------------------------------------
            // Spawn-маркеры
            // ----------------------------------------------------------------

            const spawnBlue =
                map.getObjectByName(
                    'spawn_blue'
                );

            const spawnRed =
                map.getObjectByName(
                    'spawn_red'
                );

            let spawnObject = null;

            // Пока выбираем синий spawn.
            // Сервер по-прежнему отвечает за команду.
            if (spawnBlue) {
                spawnObject =
                    spawnBlue;

                console.log(
                    '[MAP] Найден spawn_blue'
                );
            } else if (spawnRed) {
                spawnObject =
                    spawnRed;

                console.log(
                    '[MAP] Найден spawn_red'
                );
            }

            if (spawnObject) {
                const worldPosition =
                    new THREE.Vector3();

                spawnObject.getWorldPosition(
                    worldPosition
                );

                console.log(
                    '[MAP] Spawn:',
                    worldPosition.x.toFixed(2),
                    worldPosition.y.toFixed(2),
                    worldPosition.z.toFixed(2)
                );

                // Не телепортируем игрока,
                // если он уже получил позицию от сервера.
                if (
                    !G.socket ||
                    !G.myId
                ) {
                    G.yawObject.position.x =
                        worldPosition.x;

                    G.yawObject.position.z =
                        worldPosition.z;

                    const ground =
                        getGroundHeight(
                            worldPosition.x,
                            worldPosition.z
                        );

                    G.yawObject.position.y =
                        ground + getPlayerEyeHeight();
                }
            }

            console.log(
                '[MAP] Карта загружена. Mesh:',
                G.mapMeshes.length
            );
        },

        function (progress) {
            if (
                progress &&
                progress.total > 0
            ) {
                const percent =
                    Math.round(
                        (
                            progress.loaded /
                            progress.total
                        ) * 100
                    );

                console.log(
                    '[MAP] Загрузка:',
                    percent + '%'
                );
            }
        },

        function (error) {
            console.error(
                '[MAP] Ошибка загрузки:',
                error
            );

            console.warn(
                '[MAP] Оставляем временный пол'
            );
        }
    );
}


// ============================================================================
// ВЫСОТА ЗЕМЛИ
// ============================================================================

function getGroundHeight(x, z) {
    const G = window.Game;

    if (
        !G.mapLoaded ||
        !G.mapMeshes ||
        !G.mapMeshes.length
    ) {
        return null;
    }

    const origin =
        new THREE.Vector3(
            x,
            10000,
            z
        );

    const direction =
        new THREE.Vector3(
            0,
            -1,
            0
        );

    G.groundRaycaster.set(
        origin,
        direction
    );

    G.groundRaycaster.far =
        20000;

    const hits =
        G.groundRaycaster.intersectObjects(
            G.mapMeshes,
            true
        );

    if (!hits.length) {
        return null;
    }

    return hits[0].point.y;
}


// ============================================================================
// ВЫСОТА КАМЕРЫ / ИГРОКА
// ============================================================================

function getPlayerEyeHeight() {
    const G = window.Game;

    if (G.isCrouching) {
        return 1.8;
    }

    return 2.2;
}


// ============================================================================
// RESIZE
// ============================================================================

function getContainerSize(container) {
    return {
        w:
            container.clientWidth ||
            window.innerWidth,

        h:
            container.clientHeight ||
            window.innerHeight
    };
}


function resizeToContainer(container) {
    const G = window.Game;

    if (
        !G.camera ||
        !G.renderer
    ) {
        return;
    }

    const size =
        getContainerSize(container);

    if (
        size.w <= 0 ||
        size.h <= 0
    ) {
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
    if (
        typeof ResizeObserver !==
        'undefined'
    ) {
        const observer =
            new ResizeObserver(
                function () {
                    resizeToContainer(
                        container
                    );
                }
            );

        observer.observe(
            container
        );
    }

    window.addEventListener(
        'resize',
        function () {
            resizeToContainer(
                container
            );
        }
    );

    window.addEventListener(
        'orientationchange',
        function () {
            setTimeout(
                function () {
                    resizeToContainer(
                        container
                    );
                },
                250
            );
        }
    );

    if (window.visualViewport) {
        window.visualViewport.addEventListener(
            'resize',
            function () {
                resizeToContainer(
                    container
                );
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

    G.isCrouching =
        !!state;

    G.moveSpeed =
        G.isCrouching
            ? C.CROUCH_SPEED
            : C.NORMAL_SPEED;
}


// ============================================================================
// ИГРОВОЙ ЦИКЛ
// ============================================================================

function animate() {
    requestAnimationFrame(
        animate
    );

    const G = window.Game;
    const C = window.GameConfig;

    const now =
        performance.now();

    let delta =
        (now - lastAnimationTime) /
        1000;

    lastAnimationTime =
        now;

    // Защита от огромного скачка
    // после сворачивания вкладки.
    delta =
        Math.min(
            Math.max(delta, 0),
            0.05
        );

    if (
        !G.scene ||
        !G.camera ||
        !G.renderer
    ) {
        return;
    }

    // ------------------------------------------------------------------------
    // Другие игроки
    // ------------------------------------------------------------------------

    if (
        G.otherPlayers &&
        G.otherPlayers !==
            lastPlayersObject &&
        typeof syncOtherPlayers ===
            'function'
    ) {
        syncOtherPlayers(
            G.otherPlayers
        );

        lastPlayersObject =
            G.otherPlayers;
    }

    if (
        typeof updateOtherPlayerAnimations ===
            'function'
    ) {
        updateOtherPlayerAnimations(
            delta
        );
    }

    // ------------------------------------------------------------------------
    // Управление
    // ------------------------------------------------------------------------

    const controlsLocked =
        !!G.inputLocked;

    if (!controlsLocked) {

        // ------------------------------------------------------------
        // Гравитация
        // ------------------------------------------------------------

        G.playerVelocity.y -=
            C.GRAVITY *
            delta;

        // ------------------------------------------------------------
        // Движение
        // ------------------------------------------------------------

        const inputX =
            Number(
                G.moveDirection.right
            ) || 0;

        const inputZ =
            Number(
                G.moveDirection.forward
            ) || 0;

        const moveVector =
            new THREE.Vector3(
                inputX,
                0,
                -inputZ
            );

        if (
            moveVector.lengthSq() > 1
        ) {
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

        // ------------------------------------------------------------
        // Земля
        // ------------------------------------------------------------

        const ground =
            getGroundHeight(
                G.yawObject.position.x,
                G.yawObject.position.z
            );

        // Если карта загружена и земля найдена —
        // ставим игрока точно на поверхность.
        if (
            ground !== null
        ) {
            const playerHeight =
                getPlayerEyeHeight();

            const targetY =
                ground +
                playerHeight;

            G.yawObject.position.y +=
                G.playerVelocity.y *
                delta;

            if (
                G.yawObject.position.y <=
                targetY
            ) {
                G.yawObject.position.y =
                    targetY;

                G.playerVelocity.y =
                    0;

                G.isGrounded =
                    true;
            } else {
                G.isGrounded =
                    false;
            }
        } else {
            // Карта ещё не готова или
            // под игроком нет поверхности.
            G.yawObject.position.y +=
                G.playerVelocity.y *
                delta;

            if (
                G.yawObject.position.y <=
                0
            ) {
                G.yawObject.position.y =
                    0;

                G.playerVelocity.y =
                    0;

                G.isGrounded =
                    true;
            } else {
                G.isGrounded =
                    false;
            }
        }
    } else {
        // --------------------------------------------------------------------
        // HUD-редактор / меню:
        // полностью останавливаем физическое движение.
        // --------------------------------------------------------------------

        G.playerVelocity.set(
            0,
            0,
            0
        );

        G.moveDirection.forward =
            0;

        G.moveDirection.right =
            0;
    }

    // ------------------------------------------------------------------------
    // Отправка позиции
    // ------------------------------------------------------------------------

    if (
        typeof sendPositionUpdate ===
            'function'
    ) {
        sendPositionUpdate(
            now
        );
    }

    // ------------------------------------------------------------------------
    // Рендер
    // ------------------------------------------------------------------------

    G.renderer.render(
        G.scene,
        G.camera
    );
}
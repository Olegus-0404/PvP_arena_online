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

    // =========================================================================
    // PLAYER OBJECTS
    // =========================================================================

    G.yawObject = new THREE.Object3D();
    G.pitchObject = new THREE.Object3D();
    G.playerVelocity = new THREE.Vector3();

    G.scene = new THREE.Scene();

    G.scene.background =
        new THREE.Color(0x3a403b);

    // =========================================================================
    // MAP STATE
    // =========================================================================

    G.mapRoot = null;
    G.mapMeshes = [];
    G.mapLoaded = false;
    G.mapBounds = null;
    G.mapCenter = new THREE.Vector3();
    G.mapSize = new THREE.Vector3();

    G.fallbackFloor = null;

    G.groundRaycaster =
        new THREE.Raycaster();

    // =========================================================================
    // CAMERA
    // =========================================================================

    const size =
        getContainerSize(container);

    G.camera =
        new THREE.PerspectiveCamera(
            75,
            size.w / size.h,
            0.1,
            5000
        );

    G.pitchObject.add(
        G.camera
    );

    G.yawObject.add(
        G.pitchObject
    );

    G.yawObject.position.set(
        0,
        2.2,
        0
    );

    G.scene.add(
        G.yawObject
    );

    // =========================================================================
    // RENDERER
    // =========================================================================

    G.renderer =
        new THREE.WebGLRenderer({
            antialias: true,
            alpha: false
        });

    G.renderer.setPixelRatio(
        Math.min(
            window.devicePixelRatio || 1,
            2
        )
    );

    G.renderer.domElement.style.display =
        'block';

    G.renderer.domElement.style.width =
        '100%';

    G.renderer.domElement.style.height =
        '100%';

    container.appendChild(
        G.renderer.domElement
    );

    // =========================================================================
    // LIGHT
    // =========================================================================

    const hemiLight =
        new THREE.HemisphereLight(
            0xddeeff,
            0x334422,
            1.2
        );

    G.scene.add(
        hemiLight
    );

    const sunLight =
        new THREE.DirectionalLight(
            0xffffff,
            0.8
        );

    sunLight.position.set(
        100,
        150,
        80
    );

    G.scene.add(
        sunLight
    );

    // =========================================================================
    // TEMP FLOOR
    // =========================================================================

    createFallbackFloor();

    // =========================================================================
    // MAP
    // =========================================================================

    loadChernobylMap();

    // =========================================================================
    // RESIZE
    // =========================================================================

    resizeToContainer(
        container
    );

    setupRobustResize(
        container
    );

    // =========================================================================
    // LOOP
    // =========================================================================

    lastAnimationTime =
        performance.now();

    animate();
}


// ============================================================================
// FALLBACK FLOOR
// ============================================================================

function createFallbackFloor() {
    const G = window.Game;

    const geometry =
        new THREE.PlaneGeometry(
            500,
            500
        );

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

    floor.rotation.x =
        -Math.PI / 2;

    floor.name =
        '__fallback_floor';

    G.fallbackFloor =
        floor;

    G.scene.add(
        floor
    );
}


// ============================================================================
// MAP LOADER
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

    loader.load(
        'models/chernobyl_pvp_map.glb',

        function (gltf) {

            const map =
                gltf.scene;

            if (!map) {
                return;
            }

            map.name =
                'ChernobylPvPMap';

            // ---------------------------------------------------------------
            // Собираем все Mesh
            // ---------------------------------------------------------------

            G.mapMeshes = [];

            map.traverse(
                function (object) {

                    if (!object.isMesh) {
                        return;
                    }

                    object.castShadow =
                        true;

                    object.receiveShadow =
                        true;

                    G.mapMeshes.push(
                        object
                    );
                }
            );

            // ---------------------------------------------------------------
            // Сначала добавляем карту
            // ---------------------------------------------------------------

            G.mapRoot =
                map;

            G.scene.add(
                map
            );

            // ---------------------------------------------------------------
            // Получаем исходные размеры
            // ---------------------------------------------------------------

            let bounds =
                new THREE.Box3()
                    .setFromObject(map);

            let size =
                new THREE.Vector3();

            let center =
                new THREE.Vector3();

            bounds.getSize(
                size
            );

            bounds.getCenter(
                center
            );

            console.log(
                '[MAP] Исходный размер:',
                size.x,
                size.y,
                size.z
            );

            // ---------------------------------------------------------------
            // НОРМАЛИЗАЦИЯ КАРТЫ
            //
            // Если экспорт из Blender/другого редактора дал неправильный
            // масштаб, приводим карту к нормальному игровому размеру.
            // ---------------------------------------------------------------

            const maxXZ =
                Math.max(
                    size.x,
                    size.z
                );

            let scale =
                1;

            /*
             * Нормальный диапазон карты:
             *
             * меньше 60  -> слишком маленькая
             * больше 500 -> слишком большая
             *
             * Целевой размер по большей горизонтальной стороне:
             * примерно 220 игровых единиц.
             */

            if (
                maxXZ > 0 &&
                (
                    maxXZ < 60 ||
                    maxXZ > 500
                )
            ) {

                scale =
                    220 /
                    maxXZ;

                map.scale.set(
                    scale,
                    scale,
                    scale
                );

                // После изменения масштаба
                // пересчитываем размеры.
                bounds =
                    new THREE.Box3()
                        .setFromObject(map);

                bounds.getSize(
                    size
                );

                bounds.getCenter(
                    center
                );

                console.log(
                    '[MAP] Применён масштаб:',
                    scale
                );
            }

            // ---------------------------------------------------------------
            // ЦЕНТРИРУЕМ КАРТУ ПО X/Z
            //
            // Y НЕ трогаем, чтобы не уничтожить высоты зданий/рельефа.
            // ---------------------------------------------------------------

            map.position.x -=
                center.x;

            map.position.z -=
                center.z;

            // ---------------------------------------------------------------
            // Пересчитываем bounds после центрирования
            // ---------------------------------------------------------------

            bounds =
                new THREE.Box3()
                    .setFromObject(map);

            bounds.getSize(
                size
            );

            bounds.getCenter(
                center
            );

            G.mapBounds =
                bounds.clone();

            G.mapSize =
                size.clone();

            G.mapCenter =
                center.clone();

            // ---------------------------------------------------------------
            // Карта теперь находится вокруг (0, 0, 0)
            // ---------------------------------------------------------------

            console.log(
                '[MAP] Новый размер:',
                size.x,
                size.y,
                size.z
            );

            console.log(
                '[MAP] Новый центр:',
                center.x,
                center.y,
                center.z
            );

            // ---------------------------------------------------------------
            // Убираем временный пол
            // ---------------------------------------------------------------

            if (
                G.fallbackFloor
            ) {

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

                G.fallbackFloor =
                    null;
            }

            // ---------------------------------------------------------------
            // Spawn markers
            // ---------------------------------------------------------------

            const spawnBlue =
                map.getObjectByName(
                    'spawn_blue'
                );

            const spawnRed =
                map.getObjectByName(
                    'spawn_red'
                );

            if (spawnBlue) {

                const p =
                    new THREE.Vector3();

                spawnBlue.getWorldPosition(
                    p
                );

                console.log(
                    '[MAP] spawn_blue:',
                    p.x,
                    p.y,
                    p.z
                );
            }

            if (spawnRed) {

                const p =
                    new THREE.Vector3();

                spawnRed.getWorldPosition(
                    p
                );

                console.log(
                    '[MAP] spawn_red:',
                    p.x,
                    p.y,
                    p.z
                );
            }

            // ---------------------------------------------------------------
            // Карта готова
            // ---------------------------------------------------------------

            G.mapLoaded =
                true;

            console.log(
                '[MAP] Карта полностью загружена'
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
                    '[MAP]',
                    percent + '%'
                );
            }
        },

        function (error) {

            console.error(
                '[MAP] Ошибка:',
                error
            );

            console.warn(
                '[MAP] Используется временный пол'
            );
        }
    );
}


// ============================================================================
// GROUND HEIGHT
// ============================================================================

function getGroundHeight(
    x,
    z
) {

    const G =
        window.Game;

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

    if (
        !hits.length
    ) {
        return null;
    }

    return hits[0].point.y;
}


// ============================================================================
// PLAYER HEIGHT
// ============================================================================

function getPlayerEyeHeight() {

    const G =
        window.Game;

    if (
        G.isCrouching
    ) {
        return 1.8;
    }

    return 2.2;
}


// ============================================================================
// RESIZE
// ============================================================================

function getContainerSize(
    container
) {

    return {
        w:
            container.clientWidth ||
            window.innerWidth,

        h:
            container.clientHeight ||
            window.innerHeight
    };
}


function resizeToContainer(
    container
) {

    const G =
        window.Game;

    if (
        !G.camera ||
        !G.renderer
    ) {
        return;
    }

    const size =
        getContainerSize(
            container
        );

    if (
        size.w <= 0 ||
        size.h <= 0
    ) {
        return;
    }

    G.camera.aspect =
        size.w /
        size.h;

    G.camera.updateProjectionMatrix();

    G.renderer.setSize(
        size.w,
        size.h,
        false
    );
}


// ============================================================================
// ROBUST RESIZE
// ============================================================================

function setupRobustResize(
    container
) {

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

    if (
        window.visualViewport
    ) {

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
// CROUCH
// ============================================================================

function setCrouch(
    state
) {

    const G =
        window.Game;

    const C =
        window.GameConfig;

    G.isCrouching =
        !!state;

    G.moveSpeed =
        G.isCrouching
            ? C.CROUCH_SPEED
            : C.NORMAL_SPEED;
}


// ============================================================================
// GAME LOOP
// ============================================================================

function animate() {

    requestAnimationFrame(
        animate
    );

    const G =
        window.Game;

    const C =
        window.GameConfig;

    const now =
        performance.now();

    let delta =
        (
            now -
            lastAnimationTime
        ) / 1000;

    lastAnimationTime =
        now;

    // Защита после сворачивания браузера.
    delta =
        Math.min(
            Math.max(
                delta,
                0
            ),
            0.05
        );

    if (
        !G.scene ||
        !G.camera ||
        !G.renderer
    ) {
        return;
    }

    // =========================================================================
    // OTHER PLAYERS
    // =========================================================================

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

    // =========================================================================
    // INPUT LOCK
    // =========================================================================

    if (
        G.inputLocked
    ) {

        G.playerVelocity.set(
            0,
            0,
            0
        );

        G.moveDirection.forward =
            0;

        G.moveDirection.right =
            0;

    } else {

        // =====================================================================
        // GRAVITY
        // =====================================================================

        G.playerVelocity.y -=
            C.GRAVITY *
            delta;

        // =====================================================================
        // MOVEMENT
        // =====================================================================

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

        // =====================================================================
        // GROUND
        // =====================================================================

        const ground =
            getGroundHeight(
                G.yawObject.position.x,
                G.yawObject.position.z
            );

        if (
            ground !== null
        ) {

            const eyeHeight =
                getPlayerEyeHeight();

            const targetY =
                ground +
                eyeHeight;

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

            // Карта есть, но конкретно под
            // игроком поверхности нет.
            G.yawObject.position.y +=
                G.playerVelocity.y *
                delta;

            if (
                G.yawObject.position.y <
                -20
            ) {

                // Защита от падения
                // за пределы карты.
                G.yawObject.position.y =
                    2.2;

                G.playerVelocity.y =
                    0;

                G.isGrounded =
                    true;
            }
        }
    }

    // =========================================================================
    // NETWORK POSITION
    // =========================================================================

    if (
        typeof sendPositionUpdate ===
            'function'
    ) {

        sendPositionUpdate(
            now
        );
    }

    // =========================================================================
    // RENDER
    // =========================================================================

    G.renderer.render(
        G.scene,
        G.camera
    );
}
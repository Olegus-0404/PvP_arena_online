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

    G.scene.add(new THREE.HemisphereLight(0xddeeff, 0x334422, 0.8));

    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(200, 200),
        new THREE.MeshStandardMaterial({ color: 0x2b3028 })
    );
    floor.rotation.x = -Math.PI / 2;
    G.scene.add(floor);

    resizeToContainer(container);
    setupRobustResize(container);

    animate();
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

    const groundLevel = G.isCrouching ? 2.2 : 3.0;
    if (G.yawObject.position.y <= groundLevel) {
        G.yawObject.position.y = groundLevel;
        G.playerVelocity.y = 0;
        G.isGrounded = true;
    }

    if (typeof sendPositionUpdate === 'function') sendPositionUpdate(now);

    G.renderer.render(G.scene, G.camera);
}

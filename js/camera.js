// ============================================================
// CAMERA LOOK
// Мобильный свайп (без изменений) + ПК через Pointer Lock API
// ============================================================
(function () {
    let activePointerId = null;
    let lastX = 0;
    let lastY = 0;
    let looking = false;

    const MIN_PITCH = -Math.PI / 2 + 0.08;
    const MAX_PITCH = Math.PI / 2 - 0.08;

    function getSensitivity() {
        const value = Number(window.gameSettings?.sensitivity);
        if (!Number.isFinite(value) || value <= 0) return 0.0035;
        return value;
    }

    function getInvertY() {
        return window.gameSettings?.invertY === true;
    }

    function rotateCamera(dx, dy) {
        const G = window.Game;
        if (!G || !G.yawObject || !G.pitchObject) return;

        let sensitivity = getSensitivity();
        if (G.isAiming) sensitivity *= 0.45; // точнее при прицеливании

        G.yawObject.rotation.y -= dx * sensitivity;

        let pitchChange = dy * sensitivity;
        if (getInvertY()) pitchChange = -pitchChange;

        G.pitchObject.rotation.x -= pitchChange;
        G.pitchObject.rotation.x = Math.max(MIN_PITCH, Math.min(MAX_PITCH, G.pitchObject.rotation.x));
    }

    function isHudElement(target) {
        if (!target) return false;
        return !!target.closest('.hud-element, button, input, textarea, select, label');
    }

    // ------------------------------------------------------------------
    // МОБИЛЬНЫЙ/ТАЧ СВАЙП — только для touch/pen, мышь идёт через Pointer Lock
    // ------------------------------------------------------------------
    function setupTouchLook(zone) {
        zone.addEventListener('pointerdown', function (e) {
            if (e.pointerType === 'mouse') return;
            if (activePointerId !== null) return;
            if (isHudElement(e.target)) return;

            activePointerId = e.pointerId;
            lastX = e.clientX;
            lastY = e.clientY;
            looking = true;
            zone.setPointerCapture?.(e.pointerId);
            e.preventDefault();
        }, { passive: false });

        zone.addEventListener('pointermove', function (e) {
            if (!looking || e.pointerId !== activePointerId) return;
            const dx = e.clientX - lastX;
            const dy = e.clientY - lastY;
            lastX = e.clientX;
            lastY = e.clientY;
            rotateCamera(dx, dy);
            e.preventDefault();
        }, { passive: false });

        function stopLook(e) {
            if (e.pointerId !== activePointerId) return;
            looking = false;
            activePointerId = null;
            try { zone.releasePointerCapture?.(e.pointerId); } catch (_) {}
        }

        zone.addEventListener('pointerup', stopLook);
        zone.addEventListener('pointercancel', stopLook);
        zone.addEventListener('pointerleave', function (e) {
            if (e.pointerType !== 'mouse') stopLook(e);
        });
    }

    // ------------------------------------------------------------------
    // ПК: Pointer Lock — мышь захватывается полностью, смотрим по движению
    // курсора (movementX/Y), без необходимости зажимать кнопку
    // ------------------------------------------------------------------
    function setupPointerLock(zone) {
        function isTouchDevice() {
            return !window.matchMedia('(pointer: fine)').matches;
        }
        if (isTouchDevice()) return;

        zone.addEventListener('click', function (e) {
            if (isHudElement(e.target)) return;
            if (document.body.classList.contains('in-menu')) return;
            if (window.Game.inputLocked) return;
            if (document.pointerLockElement !== zone) {
                zone.requestPointerLock?.();
            }
        });

        document.addEventListener('pointerlockchange', function () {
            window.Game.pointerLocked = document.pointerLockElement === zone;
        });

        document.addEventListener('mousemove', function (e) {
            if (document.pointerLockElement !== zone) return;
            rotateCamera(e.movementX, e.movementY);
        });

        zone.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    }

    function setupCameraLook() {
        const zone = document.getElementById('camera-look-zone');
        if (!zone) {
            console.warn('camera-look-zone не найден');
            return;
        }
        setupTouchLook(zone);
        setupPointerLock(zone);
        console.log('Camera look initialized');
    }

    window.setupCameraLook = setupCameraLook;
})();
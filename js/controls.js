// ============================================================================
// CONTROLS
// Ходьба, прыжок, присед, бег + стрельба/прицел/перезарядка/смена оружия
// (мышь+клавиатура на ПК) + мобильный ввод (джойстик, кнопки)
// ============================================================================

function setupControls() {
    const G = window.Game;

    G.keys = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        jump: false,
        crouch: false,
        sprint: false,
        weaponSwitchHeld: false
    };
    G.isAiming = false;

    // ------------------------------------------------------------------------
    // КЛАВИАТУРА
    // ------------------------------------------------------------------------
    window.addEventListener('keydown', function (e) {
        if (document.body.classList.contains('hud-edit-mode')) return;

        switch (e.code) {
            case 'KeyW':
            case 'ArrowUp':
                G.keys.forward = true;
                break;
            case 'KeyS':
            case 'ArrowDown':
                G.keys.backward = true;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                G.keys.left = true;
                break;
            case 'KeyD':
            case 'ArrowRight':
                G.keys.right = true;
                break;
            case 'Space':
                G.keys.jump = true;
                break;
            case 'KeyC':
                G.keys.crouch = true;
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                G.keys.sprint = true;
                break;
            case 'KeyR':
                if (typeof reloadWeapon === 'function') reloadWeapon();
                break;
            case 'Digit1':
                window.switchWeapon?.('knife');
                break;
            case 'Digit2':
                window.switchWeapon?.('glock');
                break;
            case 'Digit3':
                window.switchWeapon?.('rifle');
                break;
            case 'KeyT':
                G.keys.weaponSwitchHeld = true;
                break;
            case 'Escape':
                toggleGameMenu();
                break;
        }
        updateKeyboardMovement();
    });

    window.addEventListener('keyup', function (e) {
        switch (e.code) {
            case 'KeyW':
            case 'ArrowUp':
                G.keys.forward = false;
                break;
            case 'KeyS':
            case 'ArrowDown':
                G.keys.backward = false;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                G.keys.left = false;
                break;
            case 'KeyD':
            case 'ArrowRight':
                G.keys.right = false;
                break;
            case 'Space':
                G.keys.jump = false;
                break;
            case 'KeyC':
                G.keys.crouch = false;
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                G.keys.sprint = false;
                break;
            case 'KeyT':
                G.keys.weaponSwitchHeld = false;
                break;
        }
        updateKeyboardMovement();
    });

    // ------------------------------------------------------------------------
    // Если окно потеряло фокус — сбрасываем всё, иначе клавиши "залипнут"
    // ------------------------------------------------------------------------
    window.addEventListener('blur', function () {
        G.keys.forward = false;
        G.keys.backward = false;
        G.keys.left = false;
        G.keys.right = false;
        G.keys.jump = false;
        G.keys.crouch = false;
        G.keys.sprint = false;
        G.keys.weaponSwitchHeld = false;
        G.firingHeld = false;
        G.isAiming = false;
        G.moveDirection.forward = 0;
        G.moveDirection.right = 0;
        if (typeof setCrouch === 'function') setCrouch(false);
        applyAimFov(false);
    });

    setupMouseControls();
}

// ============================================================================
// МЫШЬ (ПК): ЛКМ — огонь, ПКМ — прицел, T + колесо — смена оружия
// ============================================================================
function setupMouseControls() {
    const G = window.Game;
    const zone = document.getElementById('camera-look-zone');
    if (!zone) return;

    zone.addEventListener('mousedown', function (e) {
        if (G.inputLocked) return;
        if (document.body.classList.contains('in-menu')) return;

        if (e.button === 0) {
            G.firingHeld = true;
        } else if (e.button === 2) {
            G.isAiming = true;
            applyAimFov(true);
        }
    });

    // mouseup слушаем на window, а не на zone — иначе отпускание кнопки
    // за пределами игровой зоны (например, промах мимо canvas) оставит
    // стрельбу/прицел "залипшими" навсегда
    window.addEventListener('mouseup', function (e) {
        if (e.button === 0) G.firingHeld = false;
        if (e.button === 2) {
            G.isAiming = false;
            applyAimFov(false);
        }
    });

    zone.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    zone.addEventListener('wheel', function (e) {
        if (!G.keys || !G.keys.weaponSwitchHeld) return;
        e.preventDefault();
        cycleWeapon(e.deltaY > 0 ? 1 : -1);
    }, { passive: false });
}

function applyAimFov(aiming) {
    const G = window.Game;
    if (!G.camera) return;
    G.camera.fov = aiming ? 45 : 75;
    G.camera.updateProjectionMatrix();
}

function cycleWeapon(direction) {
    const order = ['knife', 'glock', 'rifle'];
    const G = window.Game;
    const idx = order.indexOf(G.currentWeaponKey);
    const next = order[(idx + direction + order.length) % order.length];
    window.switchWeapon?.(next);
}

// ============================================================================
// ESC — меню в игре (там же выход в главное меню)
// ============================================================================
function toggleGameMenu() {
    const settingsScreen = document.getElementById('settings-screen');
    if (!settingsScreen) return;
    const isOpen = settingsScreen.style.display === 'flex';
    if (isOpen) {
        hideSettings?.();
    } else if (!document.body.classList.contains('in-menu')) {
        showSettings?.();
    }
}

// ============================================================================
// КЛАВИАТУРА → ДВИЖЕНИЕ
// ============================================================================
function updateKeyboardMovement() {
    const G = window.Game;
    const C = window.GameConfig || {};

    if (document.body.classList.contains('hud-edit-mode') || G.inputLocked) {
        G.moveDirection.forward = 0;
        G.moveDirection.right = 0;
        return;
    }

    let forward = 0;
    let right = 0;

    if (G.keys.forward) forward += 1;
    if (G.keys.backward) forward -= 1;
    if (G.keys.right) right += 1;
    if (G.keys.left) right -= 1;

    G.moveDirection.forward = forward;
    G.moveDirection.right = right;

    // Прыжок
    if (G.keys.jump && G.isGrounded) {
        jumpPlayer();
        G.keys.jump = false;
    }

    // Приседание
    if (typeof setCrouch === 'function') setCrouch(G.keys.crouch);

    // Бег — только стоя и только пока реально двигаемся
    if (!G.isCrouching && G.keys.sprint && (forward !== 0 || right !== 0)) {
        G.moveSpeed = (C.NORMAL_SPEED || 6.0) * 1.6;
    } else if (!G.isCrouching) {
        G.moveSpeed = C.NORMAL_SPEED || 6.0;
    }
}

// ============================================================================
// МОБИЛЬНЫЕ КОНТРОЛЫ
// ============================================================================
function setupTouchControls() {
    setupJoystick();
    setupJumpButton();
    setupCrouchButton();
    setupFireButton();
    setupReloadButton();
    setupWeaponSlotButtons();
}

function bindTap(id, handler) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', function (e) {
        if (document.body.classList.contains('hud-edit-mode')) return;
        if (window.Game.inputLocked) return;
        e.preventDefault();
        e.stopPropagation();
        handler();
    }, { passive: false });
}

function bindHold(id, onStart, onEnd) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', function (e) {
        if (document.body.classList.contains('hud-edit-mode')) return;
        if (window.Game.inputLocked) return;
        e.preventDefault();
        e.stopPropagation();
        try { el.setPointerCapture(e.pointerId); } catch (_) {}
        onStart();
    }, { passive: false });

    ['pointerup', 'pointercancel'].forEach(function (evt) {
        el.addEventListener(evt, function (e) {
            e.preventDefault();
            e.stopPropagation();
            onEnd();
        }, { passive: false });
    });
}

// Раньше эти три функции вообще не вызывались из setupTouchControls —
// FIRE/RELOAD/переключение оружия были подключены только на бумаге
function setupFireButton() {
    bindHold('btn-fire', function () { window.Game.firingHeld = true; }, function () { window.Game.firingHeld = false; });
}

function setupReloadButton() {
    bindTap('btn-reload', function () {
        if (typeof reloadWeapon === 'function') reloadWeapon();
    });
}

function setupWeaponSlotButtons() {
    bindTap('weapon-slot-1', function () { window.switchWeapon?.('knife'); });
    bindTap('weapon-slot-2', function () { window.switchWeapon?.('glock'); });
    bindTap('weapon-slot-3', function () { window.switchWeapon?.('rifle'); });
}

// ============================================================================
// МОБИЛЬНЫЙ ДЖОЙСТИК — логика без изменений, она рабочая
// ============================================================================
function setupJoystick() {
    const G = window.Game;
    const zone = document.getElementById('joystick-zone');
    const stick = document.getElementById('joystick-stick');

    if (!zone || !stick) {
        console.warn('[JOYSTICK] Не найдены joystick-zone или joystick-stick');
        return;
    }

    let activePointerId = null;
    let centerX = 0;
    let centerY = 0;
    let maxDistance = 1;

    function updateJoystickGeometry() {
        const rect = zone.getBoundingClientRect();
        centerX = rect.left + rect.width / 2;
        centerY = rect.top + rect.height / 2;
        maxDistance = Math.max(1, Math.min(rect.width, rect.height) / 2 - stick.offsetWidth / 2 - 5);
    }

    function resetJoystick() {
        stick.style.transform = 'translate(0px, 0px)';
        G.moveDirection.forward = 0;
        G.moveDirection.right = 0;
        activePointerId = null;
    }

    function moveJoystick(clientX, clientY) {
        if (document.body.classList.contains('hud-edit-mode')) {
            resetJoystick();
            return;
        }
        if (G.inputLocked) {
            resetJoystick();
            return;
        }

        let dx = clientX - centerX;
        let dy = clientY - centerY;
        const distance = Math.hypot(dx, dy);

        if (distance > maxDistance) {
            const scale = maxDistance / distance;
            dx *= scale;
            dy *= scale;
        }

        stick.style.transform = 'translate(' + dx + 'px, ' + dy + 'px)';

        const normalizedX = dx / maxDistance;
        const normalizedY = dy / maxDistance;

        G.moveDirection.right = Math.max(-1, Math.min(1, normalizedX));
        G.moveDirection.forward = Math.max(-1, Math.min(1, -normalizedY));
    }

    zone.addEventListener('pointerdown', function (e) {
        if (document.body.classList.contains('hud-edit-mode')) return;
        if (G.inputLocked) return;
        if (activePointerId !== null) return;

        e.preventDefault();
        e.stopPropagation();
        updateJoystickGeometry();
        activePointerId = e.pointerId;
        try { zone.setPointerCapture(e.pointerId); } catch (_) {}
        moveJoystick(e.clientX, e.clientY);
    }, { passive: false });

    zone.addEventListener('pointermove', function (e) {
        if (e.pointerId !== activePointerId) return;
        e.preventDefault();
        e.stopPropagation();
        moveJoystick(e.clientX, e.clientY);
    }, { passive: false });

    function finishJoystick(e) {
        if (e.pointerId !== activePointerId) return;
        e.preventDefault();
        e.stopPropagation();
        try { zone.releasePointerCapture(e.pointerId); } catch (_) {}
        resetJoystick();
    }

    zone.addEventListener('pointerup', finishJoystick, { passive: false });
    zone.addEventListener('pointercancel', finishJoystick, { passive: false });
    zone.addEventListener('lostpointercapture', function () { resetJoystick(); });

    window.addEventListener('resize', updateJoystickGeometry);
    window.addEventListener('orientationchange', function () {
        setTimeout(updateJoystickGeometry, 200);
    });

    window.addEventListener('blur', resetJoystick);
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) resetJoystick();
    });

    updateJoystickGeometry();
    console.log('[JOYSTICK] Мобильный джойстик запущен');
}

// ============================================================================
// КНОПКА ПРЫЖКА
// ============================================================================
function setupJumpButton() {
    const button = document.getElementById('btn-jump');
    if (!button) return;

    button.addEventListener('pointerdown', function (e) {
        if (document.body.classList.contains('hud-edit-mode')) return;
        e.preventDefault();
        e.stopPropagation();
        jumpPlayer();
    }, { passive: false });
}

// ============================================================================
// КНОПКА ПРИСЕДАНИЯ
// ============================================================================
function setupCrouchButton() {
    const button = document.getElementById('btn-crouch');
    if (!button) return;

    button.addEventListener('pointerdown', function (e) {
        if (document.body.classList.contains('hud-edit-mode')) return;
        e.preventDefault();
        e.stopPropagation();
        const G = window.Game;
        G.isCrouching = !G.isCrouching;
        if (typeof setCrouch === 'function') setCrouch(G.isCrouching);
    }, { passive: false });
}

// ============================================================================
// ПРЫЖОК
// ============================================================================
function jumpPlayer() {
    const G = window.Game;
    const C = window.GameConfig || {};

    if (document.body.classList.contains('hud-edit-mode')) return;
    if (G.inputLocked) return;
    if (!G.isGrounded) return;

    if (!G.playerVelocity) G.playerVelocity = new THREE.Vector3();

    const jumpPower = Number(C.JUMP_FORCE) || 8.5;
    G.playerVelocity.y = jumpPower;
    G.isGrounded = false;
}
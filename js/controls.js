// ============================================================================
// CONTROLS: клавиатура (для теста в браузере) + тач-управление (телефон)
// ============================================================================

function setupControls() {
    const G = window.Game;
    const C = window.GameConfig;

    window.addEventListener('keydown', (e) => {
        if (e.code === 'KeyW') G.moveDirection.forward = 1;
        if (e.code === 'KeyS') G.moveDirection.forward = -1;
        if (e.code === 'KeyA') G.moveDirection.right = -1;
        if (e.code === 'KeyD') G.moveDirection.right = 1;
        if (e.code === 'Space' && G.isGrounded) { G.playerVelocity.y = C.JUMP_FORCE; G.isGrounded = false; }
        if (e.code === 'KeyR') reloadWeapon();
        if (e.code === 'Digit1') window.switchWeapon('knife');
        if (e.code === 'Digit2') window.switchWeapon('glock');
        if (e.code === 'Digit3') window.switchWeapon('rifle');
        if (e.code === 'ControlLeft' || e.code === 'KeyC') setCrouch(true);
    });
    window.addEventListener('keyup', (e) => {
        if (e.code === 'KeyW' || e.code === 'KeyS') G.moveDirection.forward = 0;
        if (e.code === 'KeyA' || e.code === 'KeyD') G.moveDirection.right = 0;
        if (e.code === 'ControlLeft' || e.code === 'KeyC') setCrouch(false);
    });
}

function setupTouchControls() {
    setupJoystick();

    const G = window.Game;
    const C = window.GameConfig;

    bindHold('btn-fire', () => { G.firingHeld = true; }, () => { G.firingHeld = false; });
    bindTap('btn-reload', reloadWeapon);
    bindTap('btn-jump', () => {
        if (G.isGrounded) { G.playerVelocity.y = C.JUMP_FORCE; G.isGrounded = false; }
    });
    bindHold('btn-crouch', () => setCrouch(true), () => setCrouch(false));

    bindTap('weapon-slot-1', () => window.switchWeapon('knife'));
    bindTap('weapon-slot-2', () => window.switchWeapon('glock'));
    bindTap('weapon-slot-3', () => window.switchWeapon('rifle'));
}

function bindTap(id, handler) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', (e) => { e.preventDefault(); handler(); }, { passive: false });
    el.addEventListener('mousedown', (e) => { e.preventDefault(); handler(); });
}

function bindHold(id, onStart, onEnd) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('touchstart', (e) => { e.preventDefault(); onStart(); }, { passive: false });
    el.addEventListener('touchend', (e) => { e.preventDefault(); onEnd(); }, { passive: false });
    el.addEventListener('mousedown', (e) => { e.preventDefault(); onStart(); });
    el.addEventListener('mouseup', (e) => { e.preventDefault(); onEnd(); });
}

function setupJoystick() {
    const zone = document.getElementById('joystick-zone');
    const stick = document.getElementById('joystick-stick');
    if (!zone || !stick) return;

    const G = window.Game;
    const maxRadius = zone.clientWidth / 2;
    let activeTouchId = null;

    function updateStick(dx, dy) {
        const dist = Math.min(Math.hypot(dx, dy), maxRadius);
        const angle = Math.atan2(dy, dx);
        const sx = Math.cos(angle) * dist;
        const sy = Math.sin(angle) * dist;
        stick.style.transform = `translate(${sx}px, ${sy}px)`;

        G.moveDirection.right = Math.max(-1, Math.min(1, sx / maxRadius));
        G.moveDirection.forward = Math.max(-1, Math.min(1, -sy / maxRadius));
    }

    function resetStick() {
        stick.style.transform = 'translate(0px, 0px)';
        G.moveDirection.right = 0;
        G.moveDirection.forward = 0;
        activeTouchId = null;
    }

    zone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        activeTouchId = e.changedTouches[0].identifier;
    }, { passive: false });

    zone.addEventListener('touchmove', (e) => {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            if (touch.identifier !== activeTouchId) continue;
            const rect = zone.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;
            updateStick(touch.clientX - cx, touch.clientY - cy);
        }
    }, { passive: false });

    zone.addEventListener('touchend', (e) => {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            if (touch.identifier === activeTouchId) resetStick();
        }
    }, { passive: false });
}
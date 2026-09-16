/* ============================================================================
   CONTROLS
   Клавиатура + сенсорное управление.
   Джойстик находится в отдельном файле joystick-fix.js.
============================================================================ */

function setupControls() {
    const G = window.Game;
    const C = window.GameConfig;

    if (!G || !C) {
        console.error('[Controls] Game или GameConfig не найден');
        return;
    }

    window.addEventListener('keydown', function (event) {
        if (G.inputLocked) return;

        if (event.code === 'KeyW') {
            G.moveDirection.forward = 1;
        }

        if (event.code === 'KeyS') {
            G.moveDirection.forward = -1;
        }

        if (event.code === 'KeyA') {
            G.moveDirection.right = -1;
        }

        if (event.code === 'KeyD') {
            G.moveDirection.right = 1;
        }

        if (
            event.code === 'Space' &&
            G.isGrounded &&
            G.playerVelocity
        ) {
            G.playerVelocity.y = C.JUMP_FORCE;
            G.isGrounded = false;
        }

        if (event.code === 'KeyR') {
            if (typeof reloadWeapon === 'function') {
                reloadWeapon();
            }
        }

        if (event.code === 'Digit1') {
            if (typeof window.switchWeapon === 'function') {
                window.switchWeapon('knife');
            }
        }

        if (event.code === 'Digit2') {
            if (typeof window.switchWeapon === 'function') {
                window.switchWeapon('glock');
            }
        }

        if (event.code === 'Digit3') {
            if (typeof window.switchWeapon === 'function') {
                window.switchWeapon('rifle');
            }
        }

        if (
            event.code === 'ControlLeft' ||
            event.code === 'KeyC'
        ) {
            if (typeof setCrouch === 'function') {
                setCrouch(true);
            }
        }
    });

    window.addEventListener('keyup', function (event) {
        if (
            event.code === 'KeyW' ||
            event.code === 'KeyS'
        ) {
            G.moveDirection.forward = 0;
        }

        if (
            event.code === 'KeyA' ||
            event.code === 'KeyD'
        ) {
            G.moveDirection.right = 0;
        }

        if (
            event.code === 'ControlLeft' ||
            event.code === 'KeyC'
        ) {
            if (typeof setCrouch === 'function') {
                setCrouch(false);
            }
        }
    });

    window.addEventListener('blur', function () {
        G.moveDirection.forward = 0;
        G.moveDirection.right = 0;

        if (typeof setCrouch === 'function') {
            setCrouch(false);
        }
    });
}


/* ============================================================================
   СЕНСОРНОЕ УПРАВЛЕНИЕ
============================================================================ */

function setupTouchControls() {
    const G = window.Game;
    const C = window.GameConfig;

    if (!G || !C) {
        console.error('[TouchControls] Game или GameConfig не найден');
        return;
    }

    /*
       ВАЖНО:
       Используем именно глобальную функцию из joystick-fix.js.
       Старой локальной реализации setupJoystick здесь больше нет.
    */
    if (typeof window.setupJoystick === 'function') {
        window.setupJoystick();
    } else {
        console.warn(
            '[TouchControls] joystick-fix.js ещё не подключён'
        );
    }

    bindHold(
        'btn-fire',
        function () {
            if (G.inputLocked) return;
            G.firingHeld = true;
        },
        function () {
            G.firingHeld = false;
        }
    );

    bindTap('btn-reload', function () {
        if (G.inputLocked) return;

        if (typeof reloadWeapon === 'function') {
            reloadWeapon();
        }
    });

    bindTap('btn-jump', function () {
        if (G.inputLocked) return;

        if (
            G.isGrounded &&
            G.playerVelocity
        ) {
            G.playerVelocity.y = C.JUMP_FORCE;
            G.isGrounded = false;
        }
    });

    bindHold(
        'btn-crouch',
        function () {
            if (G.inputLocked) return;

            if (typeof setCrouch === 'function') {
                setCrouch(true);
            }
        },
        function () {
            if (typeof setCrouch === 'function') {
                setCrouch(false);
            }
        }
    );

    bindTap('weapon-slot-1', function () {
        if (G.inputLocked) return;

        if (typeof window.switchWeapon === 'function') {
            window.switchWeapon('knife');
        }
    });

    bindTap('weapon-slot-2', function () {
        if (G.inputLocked) return;

        if (typeof window.switchWeapon === 'function') {
            window.switchWeapon('glock');
        }
    });

    bindTap('weapon-slot-3', function () {
        if (G.inputLocked) return;

        if (typeof window.switchWeapon === 'function') {
            window.switchWeapon('rifle');
        }
    });
}


/* ============================================================================
   ОДИНОЧНОЕ НАЖАТИЕ
============================================================================ */

function bindTap(id, handler) {
    const element = document.getElementById(id);

    if (!element) {
        console.warn('[Controls] Элемент не найден:', id);
        return;
    }

    let lastPointerTime = 0;

    element.addEventListener(
        'pointerup',
        function (event) {
            if (event.pointerType === 'mouse') {
                return;
            }

            event.preventDefault();

            const now = Date.now();

            if (now - lastPointerTime < 80) {
                return;
            }

            lastPointerTime = now;
            handler();
        },
        {
            passive: false
        }
    );

    element.addEventListener(
        'click',
        function (event) {
            event.preventDefault();

            const now = Date.now();

            if (now - lastPointerTime < 350) {
                return;
            }

            lastPointerTime = now;
            handler();
        }
    );
}


/* ============================================================================
   УДЕРЖАНИЕ КНОПКИ
============================================================================ */

function bindHold(id, onStart, onEnd) {
    const element = document.getElementById(id);

    if (!element) {
        console.warn('[Controls] Элемент не найден:', id);
        return;
    }

    let activePointerId = null;

    function finish(event) {
        if (
            activePointerId !== null &&
            event.pointerId !== activePointerId
        ) {
            return;
        }

        activePointerId = null;
        onEnd();

        try {
            element.releasePointerCapture(event.pointerId);
        } catch (error) {
            // Захват мог уже быть потерян.
        }
    }

    element.addEventListener(
        'pointerdown',
        function (event) {
            const G = window.Game;

            if (G && G.inputLocked) {
                return;
            }

            if (activePointerId !== null) {
                return;
            }

            activePointerId = event.pointerId;

            try {
                element.setPointerCapture(event.pointerId);
            } catch (error) {
                // Некоторые браузеры могут не поддержать захват.
            }

            event.preventDefault();
            onStart();
        },
        {
            passive: false
        }
    );

    element.addEventListener(
        'pointerup',
        function (event) {
            event.preventDefault();
            finish(event);
        },
        {
            passive: false
        }
    );

    element.addEventListener(
        'pointercancel',
        function (event) {
            event.preventDefault();
            finish(event);
        },
        {
            passive: false
        }
    );

    element.addEventListener(
        'lostpointercapture',
        function () {
            if (activePointerId !== null) {
                activePointerId = null;
                onEnd();
            }
        }
    );

    element.addEventListener(
        'contextmenu',
        function (event) {
            event.preventDefault();
        }
    );
}
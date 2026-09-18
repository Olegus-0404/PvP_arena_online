// ============================================================================
// CONTROLS
// Ходьба + прыжок + приседание + мобильный ввод
// ============================================================================

function setupControls() {

    const G = window.Game;

    G.keys = {
        forward: false,
        backward: false,
        left: false,
        right: false,
        jump: false,
        crouch: false
    };

    // ------------------------------------------------------------------------
    // КЛАВИАТУРА
    // ------------------------------------------------------------------------

    window.addEventListener(
        'keydown',
        function(e) {

            if (
                document.body.classList.contains(
                    'hud-edit-mode'
                )
            ) {
                return;
            }

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
            }

            updateKeyboardMovement();
        }
    );


    window.addEventListener(
        'keyup',
        function(e) {

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
            }

            updateKeyboardMovement();
        }
    );


    // ------------------------------------------------------------------------
    // Если окно потеряло фокус
    // ------------------------------------------------------------------------

    window.addEventListener(
        'blur',
        function() {

            G.keys.forward = false;
            G.keys.backward = false;
            G.keys.left = false;
            G.keys.right = false;
            G.keys.jump = false;
            G.keys.crouch = false;

            G.moveDirection.forward = 0;
            G.moveDirection.right = 0;

            if (
                typeof setCrouch === 'function'
            ) {
                setCrouch(false);
            }
        }
    );
}


// ============================================================================
// КЛАВИАТУРА → ДВИЖЕНИЕ
// ============================================================================

function updateKeyboardMovement() {

    const G = window.Game;

    if (
        document.body.classList.contains(
            'hud-edit-mode'
        )
    ) {

        G.moveDirection.forward = 0;
        G.moveDirection.right = 0;

        return;
    }

    if (
        G.inputLocked
    ) {

        G.moveDirection.forward = 0;
        G.moveDirection.right = 0;

        return;
    }

    let forward = 0;
    let right = 0;

    if (G.keys.forward) {
        forward += 1;
    }

    if (G.keys.backward) {
        forward -= 1;
    }

    if (G.keys.right) {
        right += 1;
    }

    if (G.keys.left) {
        right -= 1;
    }

    G.moveDirection.forward =
        forward;

    G.moveDirection.right =
        right;


    // Прыжок

    if (
        G.keys.jump &&
        G.isGrounded
    ) {

        jumpPlayer();

        G.keys.jump = false;
    }


    // Приседание

    if (
        typeof setCrouch ===
        'function'
    ) {

        setCrouch(
            G.keys.crouch
        );
    }
}


// ============================================================================
// МОБИЛЬНЫЕ КОНТРОЛЫ
// ============================================================================

function setupTouchControls() {

    setupJoystick();

    setupJumpButton();

    setupCrouchButton();
}


// ============================================================================
// МОБИЛЬНЫЙ ДЖОЙСТИК
// ============================================================================

function setupJoystick() {

    const G =
        window.Game;

    const zone =
        document.getElementById(
            'joystick-zone'
        );

    const stick =
        document.getElementById(
            'joystick-stick'
        );

    if (
        !zone ||
        !stick
    ) {

        console.warn(
            '[JOYSTICK] Не найдены joystick-zone или joystick-stick'
        );

        return;
    }


    let activePointerId =
        null;

    let centerX = 0;
    let centerY = 0;

    let maxDistance = 1;


    // ------------------------------------------------------------------------
    // Центр джойстика
    // ------------------------------------------------------------------------

    function updateJoystickGeometry() {

        const rect =
            zone.getBoundingClientRect();

        centerX =
            rect.left +
            rect.width / 2;

        centerY =
            rect.top +
            rect.height / 2;

        maxDistance =
            Math.max(
                1,
                Math.min(
                    rect.width,
                    rect.height
                ) / 2 -
                stick.offsetWidth / 2 -
                5
            );
    }


    // ------------------------------------------------------------------------
    // Сброс
    // ------------------------------------------------------------------------

    function resetJoystick() {

        stick.style.transform =
            'translate(0px, 0px)';

        G.moveDirection.forward =
            0;

        G.moveDirection.right =
            0;

        activePointerId =
            null;
    }


    // ------------------------------------------------------------------------
    // Движение стика
    // ------------------------------------------------------------------------

    function moveJoystick(
        clientX,
        clientY
    ) {

        if (
            document.body.classList.contains(
                'hud-edit-mode'
            )
        ) {

            resetJoystick();

            return;
        }


        if (
            G.inputLocked
        ) {

            resetJoystick();

            return;
        }


        let dx =
            clientX -
            centerX;

        let dy =
            clientY -
            centerY;


        const distance =
            Math.hypot(
                dx,
                dy
            );


        if (
            distance >
            maxDistance
        ) {

            const scale =
                maxDistance /
                distance;

            dx *= scale;
            dy *= scale;
        }


        stick.style.transform =
            'translate(' +
            dx +
            'px, ' +
            dy +
            'px)';


        const normalizedX =
            dx /
            maxDistance;

        const normalizedY =
            dy /
            maxDistance;


        G.moveDirection.right =
            Math.max(
                -1,
                Math.min(
                    1,
                    normalizedX
                )
            );


        G.moveDirection.forward =
            Math.max(
                -1,
                Math.min(
                    1,
                    -normalizedY
                )
            );
    }


    // ------------------------------------------------------------------------
    // НАЖАТИЕ
    // ------------------------------------------------------------------------

    zone.addEventListener(
        'pointerdown',
        function(e) {

            if (
                document.body.classList.contains(
                    'hud-edit-mode'
                )
            ) {
                return;
            }

            if (
                G.inputLocked
            ) {
                return;
            }

            if (
                activePointerId !== null
            ) {
                return;
            }


            e.preventDefault();
            e.stopPropagation();


            updateJoystickGeometry();


            activePointerId =
                e.pointerId;


            try {

                zone.setPointerCapture(
                    e.pointerId
                );

            } catch (_) {}


            moveJoystick(
                e.clientX,
                e.clientY
            );
        },
        {
            passive: false
        }
    );


    // ------------------------------------------------------------------------
    // ДВИЖЕНИЕ
    // ------------------------------------------------------------------------

    zone.addEventListener(
        'pointermove',
        function(e) {

            if (
                e.pointerId !==
                activePointerId
            ) {
                return;
            }


            e.preventDefault();
            e.stopPropagation();


            moveJoystick(
                e.clientX,
                e.clientY
            );
        },
        {
            passive: false
        }
    );


    // ------------------------------------------------------------------------
    // ОТПУСКАНИЕ
    // ------------------------------------------------------------------------

    function finishJoystick(
        e
    ) {

        if (
            e.pointerId !==
            activePointerId
        ) {
            return;
        }


        e.preventDefault();
        e.stopPropagation();


        try {

            zone.releasePointerCapture(
                e.pointerId
            );

        } catch (_) {}


        resetJoystick();
    }


    zone.addEventListener(
        'pointerup',
        finishJoystick,
        {
            passive: false
        }
    );


    zone.addEventListener(
        'pointercancel',
        finishJoystick,
        {
            passive: false
        }
    );


    zone.addEventListener(
        'lostpointercapture',
        function() {

            resetJoystick();
        }
    );


    // ------------------------------------------------------------------------
    // Изменение размера экрана
    // ------------------------------------------------------------------------

    window.addEventListener(
        'resize',
        updateJoystickGeometry
    );


    window.addEventListener(
        'orientationchange',
        function() {

            setTimeout(
                updateJoystickGeometry,
                200
            );
        }
    );


    // ------------------------------------------------------------------------
    // Смена вкладки / блокировка экрана
    // ------------------------------------------------------------------------

    window.addEventListener(
        'blur',
        resetJoystick
    );


    document.addEventListener(
        'visibilitychange',
        function() {

            if (
                document.hidden
            ) {

                resetJoystick();
            }
        }
    );


    updateJoystickGeometry();


    console.log(
        '[JOYSTICK] Мобильный джойстик запущен'
    );
}


// ============================================================================
// КНОПКА ПРЫЖКА
// ============================================================================

function setupJumpButton() {

    const button =
        document.getElementById(
            'btn-jump'
        );

    if (!button) {
        return;
    }


    button.addEventListener(
        'pointerdown',
        function(e) {

            if (
                document.body.classList.contains(
                    'hud-edit-mode'
                )
            ) {
                return;
            }

            e.preventDefault();
            e.stopPropagation();


            jumpPlayer();

        },
        {
            passive: false
        }
    );
}


// ============================================================================
// КНОПКА ПРИСЕДАНИЯ
// ============================================================================

function setupCrouchButton() {

    const button =
        document.getElementById(
            'btn-crouch'
        );

    if (!button) {
        return;
    }


    button.addEventListener(
        'pointerdown',
        function(e) {

            if (
                document.body.classList.contains(
                    'hud-edit-mode'
                )
            ) {
                return;
            }

            e.preventDefault();
            e.stopPropagation();


            const G =
                window.Game;


            G.isCrouching =
                !G.isCrouching;


            if (
                typeof setCrouch ===
                'function'
            ) {

                setCrouch(
                    G.isCrouching
                );
            }

        },
        {
            passive: false
        }
    );
}


// ============================================================================
// ПРЫЖОК
// ============================================================================

function jumpPlayer() {

    const G =
        window.Game;

    const C =
        window.GameConfig || {};


    if (
        document.body.classList.contains(
            'hud-edit-mode'
        )
    ) {
        return;
    }


    if (
        G.inputLocked
    ) {
        return;
    }


    if (
        !G.isGrounded
    ) {
        return;
    }


    if (
        !G.playerVelocity
    ) {

        G.playerVelocity =
            new THREE.Vector3();
    }


    const jumpPower =
        Number(
            C.JUMP_POWER
        ) || 8.5;


    G.playerVelocity.y =
        jumpPower;


    G.isGrounded =
        false;
}
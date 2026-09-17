// ============================================================================
// CONTROLS
// Клавиатура + мобильный джойстик + игровые кнопки
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

    window.addEventListener('keydown', function(e) {

        if (document.body.classList.contains('hud-edit-mode')) {
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
    });

    window.addEventListener('keyup', function(e) {

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
    });

    window.addEventListener('blur', function() {

        Object.keys(G.keys).forEach(function(key) {
            G.keys[key] = false;
        });

        G.moveDirection.forward = 0;
        G.moveDirection.right = 0;
    });
}


// ============================================================================
// КЛАВИАТУРА → ДВИЖЕНИЕ
// ============================================================================

function updateKeyboardMovement() {

    const G = window.Game;

    if (
        document.body.classList.contains('hud-edit-mode') ||
        G.inputLocked
    ) {
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

    if (
        G.keys.jump &&
        G.isGrounded
    ) {
        jumpPlayer();
        G.keys.jump = false;
    }

    if (
        typeof setCrouch === 'function'
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

    setupGameButton(
        'btn-jump',
        function() {
            if (
                document.body.classList.contains(
                    'hud-edit-mode'
                )
            ) {
                return;
            }

            jumpPlayer();
        }
    );

    setupGameButton(
        'btn-crouch',
        function() {

            if (
                document.body.classList.contains(
                    'hud-edit-mode'
                )
            ) {
                return;
            }

            const G = window.Game;

            G.isCrouching =
                !G.isCrouching;

            if (
                typeof setCrouch === 'function'
            ) {
                setCrouch(
                    G.isCrouching
                );
            }
        }
    );

    /*
     * Кнопки перезарядки/прочих действий
     * передаём существующей игровой логике,
     * если она есть.
     */

    setupActionButton(
        'btn-reload',
        'reload'
    );

    setupActionButton(
        'btn-fire',
        'fire'
    );
}


// ============================================================================
// JOYSTICK
// ============================================================================

function setupJoystick() {

    const G = window.Game;

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
            '[JOYSTICK] Элементы не найдены'
        );
        return;
    }

    let activePointerId = null;

    let centerX = 0;
    let centerY = 0;

    let maxDistance = 0;

    function calculateCenter() {

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
                rect.width / 2 -
                stick.offsetWidth / 2 -
                5
            );
    }


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
            Math.sqrt(
                dx * dx +
                dy * dy
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

        /*
         * Y вниз на экране,
         * поэтому вперёд = отрицательный Y.
         */

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

            /*
             * Не даём камере получать
             * этот Pointer Event.
             */

            e.preventDefault();
            e.stopPropagation();

            calculateCenter();

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


    function endPointer(e) {

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
        endPointer,
        {
            passive: false
        }
    );

    zone.addEventListener(
        'pointercancel',
        endPointer,
        {
            passive: false
        }
    );

    zone.addEventListener(
        'lostpointercapture',
        function() {

            if (
                activePointerId !== null
            ) {
                resetJoystick();
            }
        }
    );


    /*
     * На старых Android-браузерах
     * pointercancel иногда приходит
     * при уходе пальца с экрана.
     */

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

    console.log(
        '[JOYSTICK] Pointer Events активированы'
    );
}


// ============================================================================
// ОБЫЧНАЯ ИГРОВАЯ КНОПКА
// ============================================================================

function setupGameButton(
    id,
    callback
) {

    const button =
        document.getElementById(id);

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

            if (
                typeof callback ===
                'function'
            ) {
                callback();
            }
        },
        {
            passive: false
        }
    );
}


// ============================================================================
// ACTION BUTTON
// ============================================================================

function setupActionButton(
    id,
    action
) {

    const button =
        document.getElementById(id);

    if (!button) {
        return;
    }

    let held = false;


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

            held = true;

            try {
                button.setPointerCapture(
                    e.pointerId
                );
            } catch (_) {}

            if (
                action === 'reload'
            ) {

                if (
                    typeof reloadWeapon ===
                    'function'
                ) {
                    reloadWeapon();
                }

                return;
            }

            if (
                action === 'fire'
            ) {

                if (
                    typeof startFiring ===
                    'function'
                ) {
                    startFiring();
                }
            }
        },
        {
            passive: false
        }
    );


    button.addEventListener(
        'pointerup',
        function(e) {

            e.preventDefault();
            e.stopPropagation();

            held = false;

            if (
                action === 'fire'
            ) {

                if (
                    typeof stopFiring ===
                    'function'
                ) {
                    stopFiring();
                }
            }
        },
        {
            passive: false
        }
    );


    button.addEventListener(
        'pointercancel',
        function() {

            held = false;

            if (
                action === 'fire'
            ) {

                if (
                    typeof stopFiring ===
                    'function'
                ) {
                    stopFiring();
                }
            }
        }
    );
}


// ============================================================================
// ПРЫЖОК
// ============================================================================

function jumpPlayer() {

    const G = window.Game;

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

    const C =
        window.GameConfig || {};

    const jumpPower =
        Number(
            C.JUMP_POWER
        ) || 8.5;

    if (
        !G.playerVelocity
    ) {
        G.playerVelocity =
            new THREE.Vector3();
    }

    G
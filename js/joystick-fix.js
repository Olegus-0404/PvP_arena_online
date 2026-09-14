// ============================================================================
// JOYSTICK FIX
// Надёжный сенсорный джойстик для Android / iOS / ПК
// ============================================================================

(function () {

    function setupJoystickFixed() {

        const zone =
            document.getElementById('joystick-zone');

        const stick =
            document.getElementById('joystick-stick');

        if (!zone || !stick) {
            console.warn(
                '[Joystick] элементы не найдены'
            );
            return;
        }

        const G = window.Game;

        let activePointerId = null;

        let centerX = 0;
        let centerY = 0;

        function updateCenter() {

            const rect =
                zone.getBoundingClientRect();

            centerX =
                rect.left +
                rect.width / 2;

            centerY =
                rect.top +
                rect.height / 2;

            return Math.min(
                rect.width,
                rect.height
            ) / 2;
        }


        function moveStick(
            clientX,
            clientY
        ) {

            const radius =
                updateCenter() - 4;

            let dx =
                clientX - centerX;

            let dy =
                clientY - centerY;

            const distance =
                Math.hypot(dx, dy);

            if (distance > radius) {

                const scale =
                    radius / distance;

                dx *= scale;
                dy *= scale;
            }

            stick.style.transform =
                `translate(${dx}px, ${dy}px)`;

            G.moveDirection.right =
                Math.max(
                    -1,
                    Math.min(
                        1,
                        dx / radius
                    )
                );

            G.moveDirection.forward =
                Math.max(
                    -1,
                    Math.min(
                        1,
                        -dy / radius
                    )
                );
        }


        function resetStick() {

            stick.style.transform =
                'translate(0px, 0px)';

            G.moveDirection.forward = 0;
            G.moveDirection.right = 0;

            activePointerId = null;
        }


        zone.addEventListener(
            'pointerdown',
            function (event) {

                if (
                    activePointerId !== null
                ) {
                    return;
                }

                if (
                    G.inputLocked
                ) {
                    return;
                }

                activePointerId =
                    event.pointerId;

                updateCenter();

                zone.setPointerCapture(
                    event.pointerId
                );

                moveStick(
                    event.clientX,
                    event.clientY
                );

                event.preventDefault();

            },
            {
                passive: false
            }
        );


        zone.addEventListener(
            'pointermove',
            function (event) {

                if (
                    event.pointerId !==
                    activePointerId
                ) {
                    return;
                }

                moveStick(
                    event.clientX,
                    event.clientY
                );

                event.preventDefault();

            },
            {
                passive: false
            }
        );


        function finishPointer(event) {

            if (
                event.pointerId !==
                activePointerId
            ) {
                return;
            }

            resetStick();

            try {
                zone.releasePointerCapture(
                    event.pointerId
                );
            } catch (e) {}
        }


        zone.addEventListener(
            'pointerup',
            finishPointer
        );

        zone.addEventListener(
            'pointercancel',
            finishPointer
        );

        zone.addEventListener(
            'lostpointercapture',
            function () {
                resetStick();
            }
        );


        window.addEventListener(
            'resize',
            updateCenter
        );

        window.addEventListener(
            'orientationchange',
            function () {
                setTimeout(
                    updateCenter,
                    200
                );
            }
        );


        console.log(
            '[Joystick] новый сенсорный контроллер подключён'
        );
    }


    /*
     * controls.js вызывает setupJoystick().
     * Поэтому просто подменяем эту функцию до запуска main.js.
     */

    window.setupJoystick =
        setupJoystickFixed;

})();
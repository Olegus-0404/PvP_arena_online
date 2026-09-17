// ============================================================================
// MAIN
// Надёжный запуск PvP Arena Online
// ============================================================================

window.addEventListener('DOMContentLoaded', function () {

    console.log('[MAIN] DOM загружен');

    const G = window.Game;

    // ------------------------------------------------------------------------
    // АВТОРИЗАЦИЯ
    // Подключаем СРАЗУ, до запуска движка
    // ------------------------------------------------------------------------

    const authScreen =
        document.getElementById('auth-screen');

    const mainMenu =
        document.getElementById('main-menu');

    const authButton =
        document.getElementById('btn-auth');

    const nickInput =
        document.getElementById('input-email');

    const authStatus =
        document.getElementById('auth-status');


    if (authButton) {

        authButton.addEventListener(
            'click',
            function () {

                const nick =
                    nickInput
                        ? nickInput.value.trim()
                        : '';

                if (!nick) {

                    if (authStatus) {
                        authStatus.innerText =
                            'Введите никнейм';
                    }

                    return;
                }

                console.log(
                    '[AUTH] Вход:',
                    nick
                );

                // Сохраняем ник
                G.myNick =
                    nick;

                localStorage.setItem(
                    'stalker_nick',
                    nick
                );

                // Сохраняем профиль,
                // если profile.js уже загрузился
                try {

                    if (
                        typeof loadProfile ===
                        'function' &&
                        typeof saveProfile ===
                        'function'
                    ) {

                        const profile =
                            loadProfile();

                        if (!profile.nick) {

                            profile.nick =
                                nick;

                            saveProfile(
                                profile
                            );
                        }
                    }

                } catch (error) {

                    console.error(
                        '[AUTH] Ошибка профиля:',
                        error
                    );
                }

                // Скрываем авторизацию
                if (authScreen) {
                    authScreen.style.display =
                        'none';
                }

                // Показываем главное меню
                if (mainMenu) {
                    mainMenu.style.display =
                        'flex';
                }

                document.body.classList.add(
                    'in-menu'
                );

                // Обновляем ник в меню
                const nickDisplay =
                    document.getElementById(
                        'menu-nick-display'
                    );

                if (nickDisplay) {
                    nickDisplay.innerText =
                        nick;
                }

                console.log(
                    '[AUTH] Главное меню открыто'
                );
            }
        );

    } else {

        console.error(
            '[AUTH] Кнопка btn-auth не найдена'
        );
    }


    // ------------------------------------------------------------------------
    // НАСТРОЙКИ
    // ------------------------------------------------------------------------

    try {

        if (
            typeof initGameSettings ===
            'function'
        ) {
            initGameSettings();
        }

    } catch (error) {

        console.error(
            '[MAIN] Settings:',
            error
        );
    }


    // ------------------------------------------------------------------------
    // ENGINE
    // Ошибка движка НЕ должна ломать меню
    // ------------------------------------------------------------------------

    try {

        if (
            typeof initEngine ===
            'function'
        ) {

            initEngine();

            console.log(
                '[MAIN] Engine запущен'
            );
        }

    } catch (error) {

        console.error(
            '[MAIN] Ошибка engine:',
            error
        );
    }


    // ------------------------------------------------------------------------
    // CONTROLS
    // ------------------------------------------------------------------------

    try {

        if (
            typeof setupControls ===
            'function'
        ) {

            setupControls();
        }

    } catch (error) {

        console.error(
            '[MAIN] Ошибка controls:',
            error
        );
    }


    try {

        if (
            typeof setupTouchControls ===
            'function'
        ) {

            setupTouchControls();
        }

    } catch (error) {

        console.error(
            '[MAIN] Ошибка touch controls:',
            error
        );
    }


    // ------------------------------------------------------------------------
    // UI
    // ------------------------------------------------------------------------

    try {

        if (
            typeof setupRespawnUI ===
            'function'
        ) {

            setupRespawnUI();
        }

    } catch (error) {

        console.error(
            '[MAIN] Ошибка respawn:',
            error
        );
    }


    // ------------------------------------------------------------------------
    // КАМЕРА
    // ------------------------------------------------------------------------

    try {

        if (
            typeof setupCameraLook ===
            'function'
        ) {

            setupCameraLook();
        }

    } catch (error) {

        console.error(
            '[MAIN] Ошибка камеры:',
            error
        );
    }


    // ------------------------------------------------------------------------
    // МЕНЮ
    // ------------------------------------------------------------------------

    try {

        if (
            typeof initMenus ===
            'function'
        ) {

            initMenus();

            console.log(
                '[MAIN] Меню подключено'
            );
        }

    } catch (error) {

        console.error(
            '[MAIN] Ошибка меню:',
            error
        );
    }


    // ------------------------------------------------------------------------
    // ЕСЛИ НИК УЖЕ СОХРАНЁН
    // ------------------------------------------------------------------------

    try {

        const savedNick =
            localStorage.getItem(
                'stalker_nick'
            );

        if (
            savedNick &&
            savedNick.trim()
        ) {

            G.myNick =
                savedNick.trim();

            if (authScreen) {
                authScreen.style.display =
                    'none';
            }

            if (mainMenu) {
                mainMenu.style.display =
                    'flex';
            }

            document.body.classList.add(
                'in-menu'
            );

            const nickDisplay =
                document.getElementById(
                    'menu-nick-display'
                );

            if (nickDisplay) {
                nickDisplay.innerText =
                    savedNick;
            }

            console.log(
                '[MAIN] Сохранённый ник:',
                savedNick
            );
        }

    } catch (error) {

        console.error(
            '[MAIN] Ошибка восстановления ника:',
            error
        );
    }


    console.log(
        '[MAIN] Инициализация завершена'
    );
});
// ============================================================================
// MAIN
// Надёжный запуск игры
// UI и авторизация не должны ломаться из-за ошибки отдельной подсистемы
// ============================================================================

window.addEventListener('DOMContentLoaded', function () {

    console.log('[MAIN] Запуск PvP Arena Online...');

    // ------------------------------------------------------------------------
    // 1. Настройки
    // ------------------------------------------------------------------------

    try {
        if (
            typeof initGameSettings === 'function'
        ) {
            initGameSettings();
        }
    } catch (error) {
        console.error(
            '[MAIN] Ошибка settings:',
            error
        );
    }


    // ------------------------------------------------------------------------
    // 2. UI / авторизация
    // Запускаем раньше игрового движка
    // ------------------------------------------------------------------------

    try {
        if (
            typeof setupAuthUI === 'function'
        ) {
            setupAuthUI();
            console.log(
                '[MAIN] Авторизация подключена'
            );
        } else {
            console.error(
                '[MAIN] setupAuthUI не найдена'
            );
        }
    } catch (error) {
        console.error(
            '[MAIN] Ошибка авторизации:',
            error
        );
    }


    // ------------------------------------------------------------------------
    // 3. Respawn UI
    // ------------------------------------------------------------------------

    try {
        if (
            typeof setupRespawnUI === 'function'
        ) {
            setupRespawnUI();
        }
    } catch (error) {
        console.error(
            '[MAIN] Ошибка respawn UI:',
            error
        );
    }


    // ------------------------------------------------------------------------
    // 4. Главное меню
    // ------------------------------------------------------------------------

    try {
        if (
            typeof initMenus === 'function'
        ) {
            initMenus();

            console.log(
                '[MAIN] Меню подключено'
            );
        } else {
            console.error(
                '[MAIN] initMenus не найдена'
            );
        }
    } catch (error) {
        console.error(
            '[MAIN] Ошибка меню:',
            error
        );
    }


    // ------------------------------------------------------------------------
    // 5. Three.js движок
    // ------------------------------------------------------------------------

    try {
        if (
            typeof initEngine === 'function'
        ) {
            initEngine();

            console.log(
                '[MAIN] Engine запущен'
            );
        } else {
            console.error(
                '[MAIN] initEngine не найдена'
            );
        }
    } catch (error) {
        console.error(
            '[MAIN] КРИТИЧЕСКАЯ ОШИБКА ENGINE:',
            error
        );
    }


    // ------------------------------------------------------------------------
    // 6. Управление
    // ------------------------------------------------------------------------

    try {
        if (
            typeof setupControls === 'function'
        ) {
            setupControls();
        }
    } catch (error) {
        console.error(
            '[MAIN] Ошибка keyboard controls:',
            error
        );
    }


    // ------------------------------------------------------------------------
    // 7. Touch controls
    // ------------------------------------------------------------------------

    try {
        if (
            typeof setupTouchControls === 'function'
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
    // 8. Камера
    // ------------------------------------------------------------------------

    try {
        if (
            typeof setupCameraLook === 'function'
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
    // 9. Сохранённый ник
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

            window.Game.myNick =
                savedNick.trim();

            const authScreen =
                document.getElementById(
                    'auth-screen'
                );

            if (authScreen) {
                authScreen.style.display =
                    'none';
            }

            if (
                typeof showMainMenu ===
                'function'
            ) {
                showMainMenu();
            }

            console.log(
                '[MAIN] Автоматический вход:',
                savedNick
            );
        }

    } catch (error) {

        console.error(
            '[MAIN] Ошибка восстановления профиля:',
            error
        );
    }


    console.log(
        '[MAIN] Запуск завершён'
    );
});
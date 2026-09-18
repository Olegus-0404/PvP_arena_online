// ============================================================================
// MAIN
// Только запуск игры.
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {

    console.log('[MAIN] Запуск PvP Arena Online');

    try {
        if (
            typeof initGameSettings === 'function'
        ) {
            initGameSettings();
        }
    } catch (e) {
        console.error('[MAIN] Settings:', e);
    }

    try {
        if (
            typeof initEngine === 'function'
        ) {
            initEngine();
        }
    } catch (e) {
        console.error('[MAIN] Engine:', e);
    }

    try {
        if (
            typeof setupControls === 'function'
        ) {
            setupControls();
        }
    } catch (e) {
        console.error('[MAIN] Controls:', e);
    }

    try {
        if (
            typeof setupTouchControls === 'function'
        ) {
            setupTouchControls();
        }
    } catch (e) {
        console.error('[MAIN] Touch:', e);
    }

    try {
        if (
            typeof setupAuthUI === 'function'
        ) {
            setupAuthUI();
        }
    } catch (e) {
        console.error('[MAIN] Auth:', e);
    }

    try {
        if (
            typeof setupRespawnUI === 'function'
        ) {
            setupRespawnUI();
        }
    } catch (e) {
        console.error('[MAIN] Respawn:', e);
    }

    try {
        if (
            typeof setupCameraLook === 'function'
        ) {
            setupCameraLook();
        }
    } catch (e) {
        console.error('[MAIN] Camera:', e);
    }

    try {
        if (
            typeof initMenus === 'function'
        ) {
            initMenus();
        }
    } catch (e) {
        console.error('[MAIN] Menu:', e);
    }

    // ------------------------------------------------------------------------
    // Автоматический вход для уже сохранённого ника
    // ------------------------------------------------------------------------

    try {

        const savedNick =
            localStorage.getItem('stalker_nick');

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
        }

    } catch (e) {

        console.error(
            '[MAIN] Saved login:',
            e
        );
    }

    console.log(
        '[MAIN] Инициализация завершена'
    );
});
// ============================================================================
// MAIN: запуск игры
// Логика находится в отдельных файлах:
// settings.js -> state.js -> engine.js -> network.js -> weapons.js
// -> controls.js -> camera.js -> ui.js
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {

    if (typeof initGameSettings === 'function') {
        initGameSettings();
    }

    initEngine();

    setupControls();

    setupTouchControls();

    setupCameraLook();

    setupAuthUI();

    setupRespawnUI();

    const savedNick = localStorage.getItem('stalker_nick');

    if (savedNick) {

        window.Game.myNick = savedNick;

        const authScreen = document.getElementById('auth-screen');

        if (authScreen) {
            authScreen.style.display = 'none';
        }

        connectToServer();
    }
});
// ============================================================================
// MAIN: только запуск. Вся логика — в отдельных файлах:
// state.js -> engine.js -> network.js -> weapons.js -> controls.js -> ui.js
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
    if (typeof initGameSettings === 'function') initGameSettings();

    initEngine();
    setupControls();
    setupTouchControls();
    setupAuthUI();
    setupRespawnUI();
    if (typeof setupCameraLook === 'function') setupCameraLook();
    initMenus();

    const savedNick = localStorage.getItem('stalker_nick');
    if (savedNick) {
        window.Game.myNick = savedNick;
        const authScreen = document.getElementById('auth-screen');
        if (authScreen) authScreen.style.display = 'none';
        showMainMenu();
    }
});
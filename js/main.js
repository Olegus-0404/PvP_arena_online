// ============================================================================
// MAIN: только запуск. Вся логика — в отдельных файлах:
// state.js -> engine.js -> network.js -> weapons.js -> controls.js -> ui.js
// ============================================================================

window.addEventListener('DOMContentLoaded', () => {
    if (typeof initGameSettings === 'function') initGameSettings();

    // "ПК" = точный указатель (мышь) + возможность наведения без клика —
    // это надёжнее, чем смотреть на ширину экрана или User-Agent
    if (window.matchMedia('(pointer: fine) and (hover: hover)').matches) {
        document.body.classList.add('desktop-mode');
    }

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
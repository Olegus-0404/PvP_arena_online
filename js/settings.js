// ==========================================
// ПРОДВИНУТЫЙ МОДУЛЬ ЛОКАЛЬНЫХ НАСТРОЕК
// ==========================================

window.gameSettings = {
    sensitivity: 0.0035,
    invertY: false,
    crosshairColor: '#ffffff', // По умолчанию белый
    crosshairSize: '6',
    layout: {}
};

window.isEditMode = false;

function initGameSettings() {
    const saved = localStorage.getItem('cyber_arena_v2_settings');
    if (saved) {
        try {
            window.gameSettings = Object.assign({}, window.gameSettings, JSON.parse(saved));
        } catch (e) {
            console.error("Ошибка чтения настроек:", e);
        }
    }
    applyVisualSettings();
}

function applyVisualSettings() {
    const crosshair = document.getElementById('game-crosshair');
    if (crosshair) {
        crosshair.style.backgroundColor = window.gameSettings.crosshairColor;
        crosshair.style.width = window.gameSettings.crosshairSize + 'px';
        crosshair.style.height = window.gameSettings.crosshairSize + 'px';
    }
}

// Вызывается из main.js для отрисовки Killfeed
window.showKillfeed = function(killer, weapon, victim) {
    const container = document.getElementById('killfeed-container');
    if (!container) return;

    const item = document.createElement('div');
    item.className = 'killfeed-item';
    item.innerHTML = `
        <span class="kf-killer">${killer}</span>
        <span class="kf-weapon">[${weapon}]</span>
        <span class="kf-victim">${victim}</span>
    `;
    
    container.appendChild(item);
    setTimeout(() => { if(item.parentNode) item.remove(); }, 4000);
}

// Сохранение раскладки UI
function saveLayout() {
    const draggables = document.querySelectorAll('.hud-element');
    window.gameSettings.layout = {};
    draggables.forEach(el => {
        if(el.id) {
            window.gameSettings.layout[el.id] = { 
                left: el.style.left, top: el.style.top, 
                right: el.style.right, bottom: el.style.bottom 
            };
        }
    });
    localStorage.setItem('cyber_arena_v2_settings', JSON.stringify(window.gameSettings));
}
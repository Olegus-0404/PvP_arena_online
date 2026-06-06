// ==========================================
// ПРОДВИНУТЫЙ МОДУЛЬ ЛОКАЛЬНЫХ НАСТРОЕК ИГРЫ
// ==========================================

window.gameSettings = {
    sensitivity: 0.0035,
    invertY: false,
    crosshairColor: '#00ffcc',
    crosshairSize: '10',
    fogEnabled: true,
    layout: {}
};

window.isEditMode = false;

function initGameSettings() {
    const saved = localStorage.getItem('cyber_arena_advanced_settings');
    if (saved) {
        try {
            window.gameSettings = Object.assign({}, window.gameSettings, JSON.parse(saved));
        } catch (e) {
            console.error("Ошибка чтения настроек:", e);
        }
    }
    applyVisualSettings();
    updateSettingsUIFields();
    loadSavedLayout();
    setupSettingsEvents();
    setupLayoutEditor();
}

function applyVisualSettings() {
    const crosshair = document.getElementById('crosshair');
    if (crosshair) {
        crosshair.style.setProperty('--crosshair-color', window.gameSettings.crosshairColor);
        crosshair.style.setProperty('--crosshair-size', window.gameSettings.crosshairSize + 'px');
    }
    if (window.scene && window.scene.fog) {
        window.scene.fog.density = window.gameSettings.fogEnabled ? 0.015 : 0.000;
    }
}

function updateSettingsUIFields() {
    const sensSlider = document.getElementById('setting-sens');
    const sensValue = document.getElementById('setting-sens-value');
    const invertCheck = document.getElementById('setting-invert');
    const fogCheck = document.getElementById('setting-fog');
    const colorSelect = document.getElementById('setting-color');
    const sizeSlider = document.getElementById('setting-size');

    if (sensSlider) {
        sensSlider.value = (window.gameSettings.sensitivity * 2000).toFixed(1);
        sensValue.innerText = sensSlider.value;
    }
    if (invertCheck) invertCheck.checked = window.gameSettings.invertY;
    if (fogCheck) fogCheck.checked = window.gameSettings.fogEnabled;
    if (colorSelect) colorSelect.value = window.gameSettings.crosshairColor;
    if (sizeSlider) sizeSlider.value = window.gameSettings.crosshairSize;
}

function setupSettingsEvents() {
    const btnSettings = document.getElementById('btn-settings');
    const panel = document.getElementById('settings-panel');
    const btnClose = document.getElementById('btn-close-settings');
    const btnSave = document.getElementById('btn-save-settings');
    const btnReset = document.getElementById('btn-reset-all');
    const btnCustomLayout = document.getElementById('btn-custom-layout');
    const layoutSubpanel = document.getElementById('layout-edit-subpanel');
    const btnLeave = document.getElementById('btn-leave-match');

    const sensSlider = document.getElementById('setting-sens');
    const sensValue = document.getElementById('setting-sens-value');

    if (btnSettings && panel) {
        btnSettings.addEventListener('click', () => {
            updateSettingsUIFields();
            panel.style.display = 'block';
        });
    }

    if (btnClose && panel) {
        btnClose.addEventListener('click', () => {
            panel.style.display = 'none';
        });
    }

    if (sensSlider && sensValue) {
        sensSlider.addEventListener('input', () => {
            sensValue.innerText = sensSlider.value;
        });
    }

    if (btnCustomLayout && layoutSubpanel && panel) {
        btnCustomLayout.addEventListener('click', () => {
            panel.style.display = 'none';
            layoutSubpanel.style.display = 'block';
            window.isEditMode = true;
            document.querySelectorAll('.draggable').forEach(el => el.classList.add('edit-mode'));
        });
    }

    // НОВАЯ ЛОГИКА: Кнопка выхода в главное меню
    if (btnLeave) {
        btnLeave.addEventListener('click', () => {
            if (confirm("Вы действительно хотите покинуть матч?")) {
                panel.style.display = 'none';
                if (typeof window.leaveMatch === 'function') {
                    window.leaveMatch(); // Вызываем функцию отключения из main.js
                }
            }
        });
    }

    if (btnSave && panel) {
        btnSave.addEventListener('click', () => {
            const sensSlider = document.getElementById('setting-sens');
            const invertCheck = document.getElementById('setting-invert');
            const fogCheck = document.getElementById('setting-fog');
            const colorSelect = document.getElementById('setting-color');
            const sizeSlider = document.getElementById('setting-size');

            window.gameSettings.sensitivity = parseFloat(sensSlider.value) / 2000;
            window.gameSettings.invertY = invertCheck.checked;
            window.gameSettings.fogEnabled = fogCheck.checked;
            window.gameSettings.crosshairColor = colorSelect.value;
            window.gameSettings.crosshairSize = sizeSlider.value;

            localStorage.setItem('cyber_arena_advanced_settings', JSON.stringify(window.gameSettings));
            applyVisualSettings();
            panel.style.display = 'none';
        });
    }

    if (btnReset) {
        btnReset.addEventListener('click', () => {
            if (confirm("Сбросить все настройки и раскладку кнопок?")) {
                localStorage.removeItem('cyber_arena_advanced_settings');
                location.reload();
            }
        });
    }
}

function setupLayoutEditor() {
    const layoutSubpanel = document.getElementById('layout-edit-subpanel');
    const draggables = document.querySelectorAll('.draggable');

    document.getElementById('btn-save-layout').addEventListener('click', () => {
        window.isEditMode = false;
        layoutSubpanel.style.display = 'none';
        draggables.forEach(el => el.classList.remove('edit-mode'));
        
        window.gameSettings.layout = {};
        draggables.forEach(el => {
            window.gameSettings.layout[el.id] = { 
                left: el.style.left, 
                top: el.style.top, 
                right: el.style.right, 
                bottom: el.style.bottom 
            };
        });

        localStorage.setItem('cyber_arena_advanced_settings', JSON.stringify(window.gameSettings));
        document.getElementById('settings-panel').style.display = 'block';
    });

    draggables.forEach(el => {
        let activeDrag = false;
        el.addEventListener('touchstart', () => { 
            if (window.isEditMode) activeDrag = true; 
        });
        
        window.addEventListener('touchmove', (e) => {
            if (!window.isEditMode || !activeDrag) return;
            let touch = e.touches[0]; 
            el.style.right = 'auto'; 
            el.style.bottom = 'auto';
            el.style.left = (touch.clientX - el.offsetWidth / 2) + 'px'; 
            el.style.top = (touch.clientY - el.offsetHeight / 2) + 'px';
        });
        
        window.addEventListener('touchend', () => { activeDrag = false; });
    });
}

function loadSavedLayout() {
    if (window.gameSettings.layout) {
        for (let id in window.gameSettings.layout) {
            let el = document.getElementById(id);
            if (el) { 
                let item = window.gameSettings.layout[id];
                el.style.left = item.left; 
                el.style.top = item.top; 
                el.style.right = item.right; 
                el.style.bottom = item.bottom; 
            }
        }
    }
}
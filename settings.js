// ==========================================
// ПРОДВИНУТЫЙ МОДУЛЬ ЛОКАЛЬНЫХ НАСТРОЕК ИГРЫ
// ==========================================

// Глобальный объект настроек по умолчанию
window.gameSettings = {
    sensitivity: 0.0035,      // Чувствительность мыши/пальца
    invertY: false,          // Инверсия оси Y
    crosshairColor: '#00ffcc', // Цвет прицела
    crosshairSize: '10',       // Размер прицела (px)
    fogEnabled: true,         // Туман (для оптимизации)
    layout: {}                // Позиции кнопок
};

// Переменная режима редактирования кнопок
window.isEditMode = false;

// 1. Инициализация настроек при запуске игры
function initGameSettings() {
    // Загружаем сохраненные настройки из памяти браузера
    const saved = localStorage.getItem('cyber_arena_advanced_settings');
    if (saved) {
        try {
            window.gameSettings = Object.assign({}, window.gameSettings, JSON.parse(saved));
        } catch (e) {
            console.error("Ошибка чтения настроек:", e);
        }
    }

    // Применяем настройки к интерфейсу и движку
    applyVisualSettings();
    updateSettingsUIFields();
    loadSavedLayout();
    setupSettingsEvents();
    setupLayoutEditor();
}

// 2. Применение визуальных настроек (Прицел, Туман)
function applyVisualSettings() {
    // Обновляем прицел через CSS переменные
    const crosshair = document.getElementById('crosshair');
    if (crosshair) {
        crosshair.style.setProperty('--crosshair-color', window.gameSettings.crosshairColor);
        crosshair.style.setProperty('--crosshair-size', window.gameSettings.crosshairSize + 'px');
    }

    // Обновляем туман в Three.js, если сцена уже готова
    if (window.scene && window.scene.fog) {
        window.scene.fog.density = window.gameSettings.fogEnabled ? 0.015 : 0.000;
    }
}

// 3. Выставляем значения в ползунки и чекбоксы внутри меню
function updateSettingsUIFields() {
    const sensSlider = document.getElementById('setting-sens');
    const sensValue = document.getElementById('setting-sens-value');
    const invertCheck = document.getElementById('setting-invert');
    const fogCheck = document.getElementById('setting-fog');
    const colorSelect = document.getElementById('setting-color');
    const sizeSlider = document.getElementById('setting-size');

    if (sensSlider) {
        // Переводим внутреннее значение (0.0035) в удобное для игрока (от 1 до 10)
        sensSlider.value = (window.gameSettings.sensitivity * 2000).toFixed(1);
        sensValue.innerText = sensSlider.value;
    }
    if (invertCheck) invertCheck.checked = window.gameSettings.invertY;
    if (fogCheck) fogCheck.checked = window.gameSettings.fogEnabled;
    if (colorSelect) colorSelect.value = window.gameSettings.crosshairColor;
    if (sizeSlider) sizeSlider.value = window.gameSettings.crosshairSize;
}

// 4. Навешиваем события на элементы управления в меню
function setupSettingsEvents() {
    const btnSettings = document.getElementById('btn-settings');
    const panel = document.getElementById('settings-panel');
    const btnClose = document.getElementById('btn-close-settings');
    const btnSave = document.getElementById('btn-save-settings');
    const btnReset = document.getElementById('btn-reset-all');
    const btnCustomLayout = document.getElementById('btn-custom-layout');
    const layoutSubpanel = document.getElementById('layout-edit-subpanel');

    const sensSlider = document.getElementById('setting-sens');
    const sensValue = document.getElementById('setting-sens-value');

    // Открытие главного меню
    if (btnSettings && panel) {
        btnSettings.addEventListener('click', () => {
            updateSettingsUIFields();
            panel.style.display = 'block';
        });
    }

    // Закрытие меню без сохранения
    if (btnClose && panel) {
        btnClose.addEventListener('click', () => {
            panel.style.display = 'none';
        });
    }

    // Динамическое отображение чувствительности при движении ползунка
    if (sensSlider && sensValue) {
        sensSlider.addEventListener('input', () => {
            sensValue.innerText = sensSlider.value;
        });
    }

    // Кнопка "Включить кастомизацию кнопок"
    if (btnCustomLayout && layoutSubpanel && panel) {
        btnCustomLayout.addEventListener('click', () => {
            panel.style.display = 'none'; // Прячем меню настроек
            layoutSubpanel.style.display = 'block'; // Показываем панель сохранения раскладки
            window.isEditMode = true;
            document.querySelectorAll('.draggable').forEach(el => el.classList.add('edit-mode'));
        });
    }

    // Кнопка "Сохранить все настройки"
    if (btnSave && panel) {
        btnSave.addEventListener('click', () => {
            // Считываем значения из UI
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

            // Сохраняем в localStorage
            localStorage.setItem('cyber_arena_advanced_settings', JSON.stringify(window.gameSettings));
            
            applyVisualSettings();
            panel.style.display = 'none';
        });
    }

    // Сбросить ВСЁ до заводских настроек
    if (btnReset) {
        btnReset.addEventListener('click', () => {
            if (confirm("Сбросить все настройки и раскладку кнопок?")) {
                localStorage.removeItem('cyber_arena_advanced_settings');
                location.reload();
            }
        });
    }
}

// 5. Логика перетаскивания (Кастомизация кнопок HUD)
function setupLayoutEditor() {
    const layoutSubpanel = document.getElementById('layout-edit-subpanel');
    const draggables = document.querySelectorAll('.draggable');

    // Кнопка "Сохранить раскладку"
    document.getElementById('btn-save-layout').addEventListener('click', () => {
        window.isEditMode = false;
        layoutSubpanel.style.display = 'none';
        draggables.forEach(el => el.classList.remove('edit-mode'));
        
        // Записываем координаты в объект настроек
        window.gameSettings.layout = {};
        draggables.forEach(el => {
            window.gameSettings.layout[el.id] = { 
                left: el.style.left, 
                top: el.style.top, 
                right: el.style.right, 
                bottom: el.style.bottom 
            };
        });

        // Сохраняем обновленный объект настроек
        localStorage.setItem('cyber_arena_advanced_settings', JSON.stringify(window.gameSettings));
        
        // Возвращаем меню настроек назад
        document.getElementById('settings-panel').style.display = 'block';
    });

    // Перетаскивание пальцем на мобилках
    draggables.forEach(el => {
        let activeDrag = false;
        el.addEventListener('touchstart', (e) => { 
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

// 6. Отрисовка кнопок на экране по сохраненным координатам
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

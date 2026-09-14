// ============================================================================
// MENU: главное меню + экран настроек (прицел, сервера, лобби, выход)
// ============================================================================

const CROSSHAIR_KEY = 'arenaCrosshair';
const SERVERS_KEY = 'arenaServers';
const SELECTED_SERVER_KEY = 'arenaSelectedServerUrl';
const LOBBY_CODE_KEY = 'arenaLobbyCode';

// --- ПРИЦЕЛ ---
function loadCrosshairSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(CROSSHAIR_KEY) || 'null');
        return saved || { style: 'dot', color: '#ffffff', size: 6 };
    } catch (e) {
        return { style: 'dot', color: '#ffffff', size: 6 };
    }
}

function saveCrosshairSettings(settings) {
    localStorage.setItem(CROSSHAIR_KEY, JSON.stringify(settings));
}

function applyCrosshairSettings(settings) {
    const el = document.getElementById('game-crosshair');
    if (!el) return;
    const size = Number(settings.size) || 6;
    const color = settings.color || '#ffffff';

    if (settings.style === 'cross') {
        el.innerHTML =
            `<div style="position:absolute;top:50%;left:0;width:100%;height:2px;background:${color};transform:translateY(-50%);"></div>` +
            `<div style="position:absolute;left:50%;top:0;width:2px;height:100%;background:${color};transform:translateX(-50%);"></div>`;
        el.style.width = (size * 2) + 'px';
        el.style.height = (size * 2) + 'px';
        el.style.background = 'transparent';
        el.style.border = 'none';
        el.style.borderRadius = '0';
    } else if (settings.style === 'circle') {
        el.innerHTML = '';
        el.style.width = (size * 2) + 'px';
        el.style.height = (size * 2) + 'px';
        el.style.background = 'transparent';
        el.style.border = `2px solid ${color}`;
        el.style.borderRadius = '50%';
    } else {
        el.innerHTML = '';
        el.style.width = size + 'px';
        el.style.height = size + 'px';
        el.style.background = color;
        el.style.border = 'none';
        el.style.borderRadius = '50%';
    }
}

// --- СЕРВЕРА ---
function loadServerList() {
    try {
        const saved = JSON.parse(localStorage.getItem(SERVERS_KEY) || 'null');
        if (saved && saved.length) return saved;
    } catch (e) { /* ignore */ }
    return [{ name: 'Основной сервер', url: window.Game.SERVER_URL }];
}

function saveServerList(list) {
    localStorage.setItem(SERVERS_KEY, JSON.stringify(list));
}

function populateServerSelect() {
    const select = document.getElementById('server-select');
    if (!select) return;
    const list = loadServerList();
    const selectedUrl = localStorage.getItem(SELECTED_SERVER_KEY);

    select.innerHTML = '';
    list.forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s.url;
        opt.textContent = s.name;
        select.appendChild(opt);
    });
    if (selectedUrl) select.value = selectedUrl;
}

// --- ГЛАВНОЕ МЕНЮ / НАСТРОЙКИ ---
function showMainMenu() {
    const menu = document.getElementById('main-menu');
    if (menu) menu.style.display = 'flex';
    document.body.classList.add('in-menu');
    applyProfileToUI(loadProfile());
}

function hideMainMenu() {
    const menu = document.getElementById('main-menu');
    if (menu) menu.style.display = 'none';
}

function showSettings() {
    const screen = document.getElementById('settings-screen');
    if (screen) screen.style.display = 'flex';
    window.Game.inputLocked = true;
}

function hideSettings() {
    const screen = document.getElementById('settings-screen');
    if (screen) screen.style.display = 'none';
    window.Game.inputLocked = false;
}

// Полный выход из текущего матча обратно в главное меню
function exitToMainMenu() {
    const G = window.Game;
    if (G.socket) {
        G.socket.disconnect();
        G.socket = null;
    }
    if (typeof otherPlayerMeshes !== 'undefined') {
        for (const id in otherPlayerMeshes) {
            G.scene.remove(otherPlayerMeshes[id].group);
            delete otherPlayerMeshes[id];
        }
    }
    const respawnScreen = document.getElementById('respawn-screen');
    if (respawnScreen) respawnScreen.style.display = 'none';

    G.hp = 100;
    G.armor = 100;
    G.moveDirection = { forward: 0, right: 0 };
    G.firingHeld = false;

    showMainMenu();
}

function initMenus() {
    populateServerSelect();

    const savedLobby = localStorage.getItem(LOBBY_CODE_KEY);
    const lobbyInput = document.getElementById('lobby-code');
    if (savedLobby && lobbyInput) lobbyInput.value = savedLobby;

    const cross = loadCrosshairSettings();
    const styleEl = document.getElementById('crosshair-style');
    const colorEl = document.getElementById('crosshair-color');
    const sizeEl = document.getElementById('crosshair-size');
    if (styleEl) styleEl.value = cross.style;
    if (colorEl) colorEl.value = cross.color;
    if (sizeEl) sizeEl.value = cross.size;
    applyCrosshairSettings(cross);

    document.getElementById('btn-play')?.addEventListener('click', () => {
        hideMainMenu();
        document.body.classList.remove('in-menu');

        const G = window.Game;
        const select = document.getElementById('server-select');
        if (select && select.value) G.SERVER_URL = select.value;

        const lobby = (document.getElementById('lobby-code')?.value || '').trim();
        G.currentLobby = lobby;
        localStorage.setItem(LOBBY_CODE_KEY, lobby);

        connectToServer();
    });

    document.getElementById('btn-open-settings')?.addEventListener('click', showSettings);
    document.getElementById('btn-menu-trigger')?.addEventListener('click', showSettings);
    document.getElementById('btn-close-settings')?.addEventListener('click', hideSettings);

    document.getElementById('btn-open-profile')?.addEventListener('click', openProfileScreen);
    document.getElementById('btn-settings-profile')?.addEventListener('click', openProfileScreen);

    document.getElementById('btn-exit-to-menu')?.addEventListener('click', () => {
        hideSettings();
        exitToMainMenu();
    });

    document.getElementById('btn-hud-edit')?.addEventListener('click', (e) => {
        const enabled = document.body.classList.toggle('hud-edit-mode');
        e.target.innerText = enabled ? 'ГОТОВО' : 'РЕДАКТИРОВАТЬ РАСПОЛОЖЕНИЕ';
        setHudEditMode(enabled);
    });

    document.getElementById('btn-hud-reset')?.addEventListener('click', () => {
        if (confirm('Сбросить расположение HUD к исходному?')) {
            localStorage.removeItem(HUD_LAYOUT_KEY);
            location.reload();
        }
    });

    ['crosshair-style', 'crosshair-color', 'crosshair-size'].forEach((id) => {
        document.getElementById(id)?.addEventListener('input', () => {
            const settings = {
                style: document.getElementById('crosshair-style').value,
                color: document.getElementById('crosshair-color').value,
                size: Number(document.getElementById('crosshair-size').value)
            };
            saveCrosshairSettings(settings);
            applyCrosshairSettings(settings);
        });
    });

    document.getElementById('btn-add-server')?.addEventListener('click', () => {
        const input = document.getElementById('new-server-url');
        const url = input.value.trim();
        if (!url) return;
        const list = loadServerList();
        list.push({ name: url, url });
        saveServerList(list);
        input.value = '';
        populateServerSelect();
    });

    document.getElementById('server-select')?.addEventListener('change', (e) => {
        localStorage.setItem(SELECTED_SERVER_KEY, e.target.value);
    });

    document.getElementById('btn-create-lobby')?.addEventListener('click', () => {
        const code = Math.random().toString(36).substring(2, 8).toUpperCase();
        const input = document.getElementById('lobby-code');
        if (input) input.value = code;
        localStorage.setItem(LOBBY_CODE_KEY, code);
        alert(`Лобби создано! Код: ${code}\nПередай его другу — он должен ввести этот же код в настройках перед входом в игру.`);
    });

    setupProfileUI();
    applySavedHudLayout();
}

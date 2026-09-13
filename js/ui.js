// ============================================================================
// UI: HUD, экран логина, экран возрождения
// ============================================================================

function updateHUD() {
    const G = window.Game;
    const hpEl = document.getElementById('val-hp');
    const armorEl = document.getElementById('val-armor');
    const ammoEl = document.getElementById('val-ammo');
    if (hpEl) hpEl.innerText = Math.max(0, G.hp);
    if (armorEl) armorEl.innerText = Math.max(0, G.armor);
    if (ammoEl) ammoEl.innerText = G.currentWeaponKey === 'knife' ? '∞' : `${G.ammo} / ${G.reserveAmmo}`;
}

function setupAuthUI() {
    const G = window.Game;
    const btnAuth = document.getElementById('btn-auth');
    const inputEmail = document.getElementById('input-email');
    const inputServer = document.getElementById('input-server');
    const inputLobby = document.getElementById('input-lobby');
    const statusEl = document.getElementById('auth-status');
    if (!btnAuth) return;

    btnAuth.addEventListener('click', () => {
        const email = inputEmail ? inputEmail.value.trim() : "";
        if (!email) {
            if (statusEl) statusEl.innerText = "Укажите почту для сохранения профиля";
            return;
        }

        const customServer = inputServer ? inputServer.value.trim() : "";
        if (customServer) G.SERVER_URL = customServer;

        G.currentLobby = inputLobby ? inputLobby.value.trim() : "";
        G.myNick = email;
        localStorage.setItem('stalker_nick', G.myNick);

        const authScreen = document.getElementById('auth-screen');
        if (authScreen) authScreen.style.display = 'none';

        connectToServer();
    });
}

function setupRespawnUI() {
    const btnRespawn = document.getElementById('btn-respawn');
    if (!btnRespawn) return;

    btnRespawn.addEventListener('click', () => {
        const respawnScreen = document.getElementById('respawn-screen');
        if (respawnScreen) respawnScreen.style.display = 'none';

        const G = window.Game;
        if (G.socket) G.socket.emit('requestRespawn');
    });
}

function showRespawnScreen() {
    const respawnScreen = document.getElementById('respawn-screen');
    if (respawnScreen) respawnScreen.style.display = 'flex';
}

// Безопасно ничего не делает, если в разметке нет #damage-flash
function flashDamage() {
    const flash = document.getElementById('damage-flash');
    if (!flash) return;
    flash.style.opacity = '1';
    setTimeout(() => { flash.style.opacity = '0'; }, 150);
}

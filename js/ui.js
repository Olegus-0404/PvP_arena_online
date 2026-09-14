// ============================================================================
// UI: HUD, экран логина, экран возрождения
// ============================================================================

function updateHUD() {
    const G = window.Game;
    const weapon = window.GameConfig.WEAPONS[G.currentWeaponKey];
    const hpEl = document.getElementById('val-hp');
    const armorEl = document.getElementById('val-armor');
    const ammoEl = document.getElementById('val-ammo');
    const nameEl = document.getElementById('val-weapon-name');
    if (hpEl) hpEl.innerText = Math.max(0, G.hp);
    if (armorEl) armorEl.innerText = Math.max(0, G.armor);
    if (ammoEl) ammoEl.innerText = G.currentWeaponKey === 'knife' ? '∞' : `${G.ammo} / ${G.reserveAmmo}`;
    if (nameEl) nameEl.innerText = weapon ? weapon.name : '';
}

function setupAuthUI() {
    const G = window.Game;
    const btnAuth = document.getElementById('btn-auth');
    const inputEmail = document.getElementById('input-email');
    const statusEl = document.getElementById('auth-status');
    if (!btnAuth) return;

    btnAuth.addEventListener('click', () => {
        const nick = inputEmail ? inputEmail.value.trim() : "";
        if (!nick) {
            if (statusEl) statusEl.innerText = "Укажите никнейм для сохранения профиля";
            return;
        }

        G.myNick = nick;
        localStorage.setItem('stalker_nick', G.myNick);

        const profile = loadProfile();
        if (!profile.nick) {
            profile.nick = nick;
            saveProfile(profile);
        }

        const authScreen = document.getElementById('auth-screen');
        if (authScreen) authScreen.style.display = 'none';

        showMainMenu();
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

function updateMatchHUD(data) {
    const roundEl = document.getElementById('val-round');
    const timerEl = document.getElementById('val-timer');
    const scoreEl = document.getElementById('val-score');
    if (roundEl) roundEl.innerText = `${data.round} / ${data.totalRounds}`;
    if (timerEl) {
        const totalSec = Math.ceil(data.timeLeft / 1000);
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        timerEl.innerText = `${m}:${s < 10 ? '0' : ''}${s}`;
    }
    if (scoreEl) scoreEl.innerText = `${data.roundWins.blue} : ${data.roundWins.red}`;
}

let bannerTimeout = null;
function showRoundBanner(text) {
    const banner = document.getElementById('round-banner');
    if (!banner) return;
    banner.innerText = text;
    banner.style.opacity = '1';
    if (bannerTimeout) clearTimeout(bannerTimeout);
    bannerTimeout = setTimeout(() => { banner.style.opacity = '0'; }, 3500);
}
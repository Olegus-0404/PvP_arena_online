// ============================================================================
// GAME STATE: единое хранилище состояния.
// Все переменные лежат в window.Game — это специально, чтобы разные
// файлы НЕ могли случайно объявить одну и ту же переменную через let/const
// (что мгновенно ломает всю страницу с молчаливой ошибкой в консоли).
// ============================================================================

window.Game = {
    // --- сеть ---
    SERVER_URL: "https://pvp-arena-online.onrender.com",
    socket: null,
    myId: null,
    myNick: "",
    currentGameMode: "survival",
    currentLobby: "",
    otherPlayers: {},
    lastMoveSentAt: 0,

    // --- игрок ---
    hp: 100,
    armor: 100,
    kills: 0,

    // --- оружие ---
    currentWeaponKey: 'rifle',
    ammo: 30,
    reserveAmmo: 120,
    isReloading: false,
    lastShotTime: 0,
    firingHeld: false,

    // --- движение / three.js ---
    scene: null,
    camera: null,
    renderer: null,
    yawObject: null,
    pitchObject: null,
    playerVelocity: null,
    isGrounded: true,
    isCrouching: false,
    moveDirection: { forward: 0, right: 0 },
    moveSpeed: 6.0,
    inputLocked: false
};

// Константы — трогать не нужно, но пусть тоже будут в одном месте
window.GameConfig = {
    GRAVITY: 38,
    JUMP_FORCE: 8.5,
    NORMAL_SPEED: 6.0,
    CROUCH_SPEED: 2.5,
    WEAPONS: {
        knife: { name: "Нож", damage: 45, fireRate: 500, ammo: Infinity, maxReserve: 0, range: 2.8 },
        glock: { name: "Glock", damage: 22, fireRate: 260, ammo: 17, maxReserve: 51, range: 120 },
        rifle: { name: "АК-47", damage: 34, fireRate: 110, ammo: 30, maxReserve: 120, range: 150 }
    }
};

window.gameSettings = window.gameSettings || { sensitivity: 0.0035 };

window.switchWeapon = function (weaponKey) {
    const weapons = window.GameConfig.WEAPONS;
    if (!weapons[weaponKey]) return;
    const G = window.Game;
    G.currentWeaponKey = weaponKey;
    G.ammo = weapons[weaponKey].ammo;
    G.reserveAmmo = weapons[weaponKey].maxReserve;
    if (typeof updateHUD === 'function') updateHUD();
};
// ============================================================================
// PROFILE: ник, почта, пароль (только локально), фото аватара
// ============================================================================

const PROFILE_KEY = 'arenaProfile';

function loadProfile() {
    try {
        return JSON.parse(localStorage.getItem(PROFILE_KEY) || '{}');
    } catch (e) {
        return {};
    }
}

function saveProfile(profile) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

// Обновляет все элементы .user-avatar-img и подпись ника в меню
function applyProfileToUI(profile) {
    document.querySelectorAll('.user-avatar-img').forEach((img) => {
        if (profile.avatar) img.src = profile.avatar;
    });
    const nickDisplay = document.getElementById('menu-nick-display');
    if (nickDisplay) nickDisplay.innerText = profile.nick || window.Game.myNick || 'Игрок';
}

function openProfileScreen() {
    const profile = loadProfile();
    const nickEl = document.getElementById('profile-nick');
    const emailEl = document.getElementById('profile-email');
    const passEl = document.getElementById('profile-password');
    const imgEl = document.getElementById('profile-avatar-img');

    if (nickEl) nickEl.value = profile.nick || window.Game.myNick || '';
    if (emailEl) emailEl.value = profile.email || '';
    if (passEl) passEl.value = profile.password || '';
    if (imgEl && profile.avatar) imgEl.src = profile.avatar;

    const screen = document.getElementById('profile-screen');
    if (screen) screen.style.display = 'flex';
}

function closeProfileScreen() {
    const screen = document.getElementById('profile-screen');
    if (screen) screen.style.display = 'none';
}

function setupProfileUI() {
    const avatarWrap = document.getElementById('profile-avatar-wrap');
    const fileInput = document.getElementById('profile-avatar-input');
    const imgEl = document.getElementById('profile-avatar-img');

    if (avatarWrap && fileInput) {
        avatarWrap.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => { if (imgEl) imgEl.src = reader.result; };
            reader.readAsDataURL(file);
        });
    }

    const saveBtn = document.getElementById('btn-save-profile');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            const profile = loadProfile();
            const nickVal = document.getElementById('profile-nick').value.trim();
            profile.nick = nickVal || profile.nick || window.Game.myNick || '';
            profile.email = document.getElementById('profile-email').value.trim();
            profile.password = document.getElementById('profile-password').value;
            if (imgEl && imgEl.src && imgEl.src.startsWith('data:')) {
                profile.avatar = imgEl.src;
            }
            saveProfile(profile);

            if (profile.nick) {
                window.Game.myNick = profile.nick;
                localStorage.setItem('stalker_nick', profile.nick);
            }
            applyProfileToUI(profile);
            closeProfileScreen();
        });
    }

    const closeBtn = document.getElementById('btn-close-profile');
    if (closeBtn) closeBtn.addEventListener('click', closeProfileScreen);
}

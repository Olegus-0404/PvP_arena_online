// ============================================================================
// WEAPONS: стрельба, перезарядка, элементарный рейкаст по координатам
// других игроков (полноценных мешей для них пока нет).
// ============================================================================

function reloadWeapon() {
    const G = window.Game;
    if (G.isReloading) return;
    const weapon = window.GameConfig.WEAPONS[G.currentWeaponKey];
    if (!weapon || weapon.ammo === Infinity) return;
    if (G.ammo >= weapon.ammo || G.reserveAmmo <= 0) return;

    G.isReloading = true;
    setTimeout(() => {
        const needed = weapon.ammo - G.ammo;
        const take = Math.min(needed, G.reserveAmmo);
        G.ammo += take;
        G.reserveAmmo -= take;
        G.isReloading = false;
        updateHUD();
    }, 1500);
}

function tryFire(now) {
    const G = window.Game;
    if (G.isReloading) return;
    const weapon = window.GameConfig.WEAPONS[G.currentWeaponKey];
    if (!weapon) return;
    if (now - G.lastShotTime < weapon.fireRate) return;

    if (weapon.ammo !== Infinity) {
        if (G.ammo <= 0) { reloadWeapon(); return; }
        G.ammo -= 1;
    }
    G.lastShotTime = now;
    updateHUD();

    if (G.socket) {
        const weaponRange = weapon.range || 100;
        const target = raycastOtherPlayers(weaponRange);
        if (target) {
            G.socket.emit('playerHit', { targetId: target.id, zone: target.zone });
        }
    }
}

function raycastOtherPlayers(maxDist) {
    const G = window.Game;
    const origin = new THREE.Vector3();
    G.camera.getWorldPosition(origin);
    const dir = new THREE.Vector3();
    G.camera.getWorldDirection(dir);

    const HIT_RADIUS = 1.3;
    let closest = null;
    let closestDist = Infinity;

    for (const id in G.otherPlayers) {
        if (id === G.myId) continue;
        const p = G.otherPlayers[id];
        if (!p || p.hp <= 0) continue;

        const targetPos = new THREE.Vector3(p.x, 3.5, p.z);
        const toTarget = targetPos.clone().sub(origin);
        const along = toTarget.dot(dir);
        if (along <= 0 || along > maxDist) continue;

        const closestPoint = origin.clone().add(dir.clone().multiplyScalar(along));
        const perpDist = closestPoint.distanceTo(targetPos);
        if (perpDist <= HIT_RADIUS && along < closestDist) {
            closestDist = along;
            closest = { id, zone: 'body' };
        }
    }
    return closest;
}
// Функция сборки красивой 3D-модели бойца
function createCharacterModel(isOwnPlayer = false) {
    const group = new THREE.Group();

    // Настройка цветов (Синий для игрока, Красный для врагов)
    const mainColor = isOwnPlayer ? 0x0066ff : 0xff0044;
    const darkColor = 0x222222;
    const neonColor = isOwnPlayer ? 0x00ffff : 0xffaa00;

    const armorMat = new THREE.MeshStandardMaterial({ color: mainColor, metalness: 0.6, roughness: 0.2 });
    const darkMat = new THREE.MeshStandardMaterial({ color: darkColor, metalness: 0.8, roughness: 0.4 });
    const neonMat = new THREE.MeshBasicMaterial({ color: neonColor });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffcc99, roughness: 0.6 });

    // 1. ТОРС (Броня)
    const torsoGeo = new THREE.BoxGeometry(0.9, 1.1, 0.6);
    const torso = new THREE.Mesh(torsoGeo, armorMat);
    torso.position.y = 1.35;
    torso.castShadow = true;
    torso.receiveShadow = true;
    group.add(torso);

    // Деталь на груди (неоновый элемент брони)
    const chestGeo = new THREE.BoxGeometry(0.6, 0.3, 0.1);
    const chest = new THREE.Mesh(chestGeo, neonMat);
    chest.position.set(0, 1.5, 0.31);
    group.add(chest);

    // 2. ГОЛОВА (Шлем штурмовика)
    const headGroup = new THREE.Group();
    headGroup.position.y = 2.15;

    const helmetGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const helmet = new THREE.Mesh(helmetGeo, armorMat);
    helmet.castShadow = true;
    headGroup.add(helmet);

    // Неоновое стекло / Визор шлема
    const visorGeo = new THREE.BoxGeometry(0.4, 0.12, 0.1);
    const visor = new THREE.Mesh(visorGeo, neonMat);
    visor.position.set(0, 0.05, 0.21);
    headGroup.add(visor);
    group.add(headGroup);

    // 3. НАПЛЕЧНИКИ И РУКИ
    // Левое плечо
    const shoulderLGeo = new THREE.BoxGeometry(0.3, 0.3, 0.4);
    const shoulderL = new THREE.Mesh(shoulderLGeo, armorMat);
    shoulderL.position.set(-0.6, 1.7, 0);
    shoulderL.castShadow = true;
    group.add(shoulderL);

    // Правое плечо
    const shoulderR = shoulderL.clone();
    shoulderR.position.x = 0.6;
    group.add(shoulderR);

    // Рука с оружием (вытянута вперед)
    const armRGeo = new THREE.BoxGeometry(0.2, 0.2, 0.7);
    const armR = new THREE.Mesh(armRGeo, darkMat);
    armR.position.set(0.6, 1.4, -0.2);
    armR.castShadow = true;
    group.add(armR);

    // 4. НОГИ (Раздельные ноги для устойчивости модели)
    // Левая нога
    const legLGeo = new THREE.BoxGeometry(0.3, 0.8, 0.3);
    const legL = new THREE.Mesh(legLGeo, darkMat);
    legL.position.set(-0.25, 0.4, 0);
    // Сдвигаем центр вращения ноги к бедру (чтобы она качалась от бедра, а не от центра)
    legLGeo.translate(0, -0.4, 0); 
    legL.position.y = 0.8; 
    legL.castShadow = true;
    group.add(legL);

    // Правая нога
    const legRGeo = new THREE.BoxGeometry(0.3, 0.8, 0.3);
    const legR = new THREE.Mesh(legRGeo, darkMat);
    legR.position.set(0.25, 0.4, 0);
    legRGeo.translate(0, -0.4, 0);
    legR.position.y = 0.8;
    legR.castShadow = true;
    group.add(legR);

    // Сохраняем ссылки прямо в группу, чтобы index.html их видел
    group.userData = {
        legL: legL,
        legR: legR
    };

    // Ботинки / Опора
    const bootGeo = new THREE.BoxGeometry(0.32, 0.15, 0.45);
    const bootL = new THREE.Mesh(bootGeo, armorMat);
    bootL.position.set(-0.25, 0.075, -0.05);
    bootL.castShadow = true;
    group.add(bootL);

    const bootR = bootL.clone();
    bootR.position.x = 0.25;
    group.add(bootR);

    // 5. ДЖЕТПАК (Рюкзак на спине)
    const jetpackGeo = new THREE.BoxGeometry(0.6, 0.8, 0.25);
    const jetpack = new THREE.Mesh(jetpackGeo, darkMat);
    jetpack.position.set(0, 1.4, -0.4);
    jetpack.castShadow = true;
    group.add(jetpack);

    const turbineGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.2, 8);
    const turbineL = new THREE.Mesh(turbineGeo, armorMat);
    turbineL.position.set(-0.2, 1.0, -0.4);
    turbineL.rotation.x = Math.PI / 2;
    group.add(turbineL);

    const turbineR = turbineL.clone();
    turbineR.position.x = 0.2;
    group.add(turbineR);

    // 6. КРУТОЕ ОРУЖИЕ (Винтовка с прицелом)
    const weaponGroup = new THREE.Group();
    weaponGroup.position.set(0.6, 1.35, -0.6);

    // Ствол
    const rifleGeo = new THREE.BoxGeometry(0.15, 0.15, 0.9);
    const rifle = new THREE.Mesh(rifleGeo, darkMat);
    rifle.castShadow = true;
    weaponGroup.add(rifle);

    // Оптический прицел
    const scopeGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8);
    const scope = new THREE.Mesh(scopeGeo, armorMat);
    scope.position.set(0, 0.12, -0.1);
    scope.rotation.x = Math.PI / 2;
    weaponGroup.add(scope);

    // Магазин (обойма)
    const magGeo = new THREE.BoxGeometry(0.08, 0.3, 0.15);
    const mag = new THREE.Mesh(magGeo, darkMat);
    mag.position.set(0, -0.2, -0.1);
    weaponGroup.add(mag);

    // Лазерный целеуказатель на конце ствола
    const laserDotGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
    const laserDot = new THREE.Mesh(laserDotGeo, neonMat);
    laserDot.position.set(0, 0, -0.46);
    weaponGroup.add(laserDot);

    group.add(weaponGroup);

    return group;
}
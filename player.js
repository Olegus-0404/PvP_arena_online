// =======================================================
// МОДУЛЬ УПРАВЛЕНИЯ ИГРОКОМ НА СЕРВЕРЕ (БЭКЕНД)
// =======================================================

class Player {
    /**
     * Создание нового игрока при авторизации
     * @param {string} id - уникальный socket.id подключения
     * @param {string} nick - никнейм игрока
     */
    constructor(id, nick) {
        this.id = id;
        this.nick = nick;
        
        // Стартовые характеристики персонажа
        this.hp = 100;
        this.kills = 0;
        
        // Случайный спавн в пределах арены
        this.x = (Math.random() * 40) - 20;
        this.z = (Math.random() * 40) - 20;
        this.rotY = 0;
    }

    /**
     * Обновление координат при движении
     */
    updatePosition(x, z, rotY) {
        if (this.hp > 0) {
            this.x = x;
            this.z = z;
            this.rotY = rotY;
        }
    }

    /**
     * Получение урона
     * @param {string} zone - зона попадания ('head' или 'body')
     * @returns {boolean} - умер ли игрок после этого выстрела
     */
    takeDamage(zone) {
        if (this.hp <= 0) return false;

        let damage = 20; // Обычный урон в тело
        if (zone === 'head') {
            damage = 100; // Критический урон в голову (ваншот)
        }

        this.hp -= damage;
        if (this.hp < 0) this.hp = 0;

        return this.hp === 0; // Возвращает true, если игрок только что погиб
    }

    /**
     * Сброс характеристик при возрождении или перезапуске матча
     */
    respawn() {
        this.hp = 100;
        this.x = (Math.random() * 40) - 20;
        this.z = (Math.random() * 40) - 20;
        this.rotY = 0;
    }

    /**
     * Сброс фрагов (например, при полной смене раунда таймером)
     */
    resetKills() {
        this.kills = 0;
    }
}

// Экспортируем класс, чтобы server.js мог его подключать через require()
module.exports = Player;
// ============================================================================
// HUD EDITOR: перетаскивание элементов HUD и сохранение раскладки
// ============================================================================

const HUD_LAYOUT_KEY = 'arenaHudLayout';
let hudDragState = null;

function loadHudLayout() {
    try {
        return JSON.parse(localStorage.getItem(HUD_LAYOUT_KEY) || '{}');
    } catch (e) {
        return {};
    }
}

function saveHudLayout(layout) {
    localStorage.setItem(HUD_LAYOUT_KEY, JSON.stringify(layout));
}

// Вызывается один раз при старте — накладывает сохранённые позиции
function applySavedHudLayout() {
    const layout = loadHudLayout();
    for (const id in layout) {
        const el = document.getElementById(id);
        if (!el) continue;
        const pos = layout[id];
        el.style.transform = 'none';
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        el.style.left = pos.leftPct + '%';
        el.style.top = pos.topPct + '%';
    }
}

function setHudEditMode(enabled) {
    const elements = document.querySelectorAll('.hud-element');
    elements.forEach((el) => {
        if (enabled) {
            el.addEventListener('pointerdown', onHudDragStart);
        } else {
            el.removeEventListener('pointerdown', onHudDragStart);
        }
    });
}

function onHudDragStart(e) {
    if (!document.body.classList.contains('hud-edit-mode')) return;
    const el = e.currentTarget;
    e.preventDefault();

    const rect = el.getBoundingClientRect();
    el.style.transform = 'none';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.left = rect.left + 'px';
    el.style.top = rect.top + 'px';

    hudDragState = { el, pointerId: e.pointerId };
    el.setPointerCapture(e.pointerId);
    el.addEventListener('pointermove', onHudDragMove);
    el.addEventListener('pointerup', onHudDragEnd);
    el.addEventListener('pointercancel', onHudDragEnd);
}

function onHudDragMove(e) {
    if (!hudDragState || e.pointerId !== hudDragState.pointerId) return;
    const el = hudDragState.el;
    const curLeft = parseFloat(el.style.left) || 0;
    const curTop = parseFloat(el.style.top) || 0;
    el.style.left = (curLeft + e.movementX) + 'px';
    el.style.top = (curTop + e.movementY) + 'px';
}

function onHudDragEnd(e) {
    if (!hudDragState || e.pointerId !== hudDragState.pointerId) return;
    const el = hudDragState.el;

    const leftPx = parseFloat(el.style.left) || 0;
    const topPx = parseFloat(el.style.top) || 0;
    const leftPct = (leftPx / window.innerWidth) * 100;
    const topPct = (topPx / window.innerHeight) * 100;

    const layout = loadHudLayout();
    layout[el.id] = { leftPct, topPct };
    saveHudLayout(layout);

    el.removeEventListener('pointermove', onHudDragMove);
    el.removeEventListener('pointerup', onHudDragEnd);
    el.removeEventListener('pointercancel', onHudDragEnd);
    hudDragState = null;
}
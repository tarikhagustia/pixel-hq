// Keyboard input that politely ignores keystrokes aimed at text fields.
const down = new Set<string>();
const pressed = new Set<string>();

const isTyping = () => {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
};

const GAME_KEYS = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ']);

export function initInput() {
  window.addEventListener('keydown', (e) => {
    if (isTyping() || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (GAME_KEYS.has(k)) e.preventDefault();
    if (!down.has(k)) pressed.add(k);
    down.add(k);
  });
  window.addEventListener('keyup', (e) => down.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => down.clear());
  document.addEventListener('focusin', () => { if (isTyping()) down.clear(); });
}

export const isDown = (...keys: string[]) => !isTyping() && keys.some((k) => down.has(k));

/** True once per physical key press. */
export function consume(key: string) {
  if (pressed.has(key)) { pressed.delete(key); return true; }
  return false;
}
export function endFrame() { pressed.clear(); }

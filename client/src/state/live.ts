// Mutable, non-reactive game state read every animation frame.
import type { Dir } from '../../../shared/protocol';
import { SPAWN } from '../game/map';

export interface LiveBody {
  x: number; y: number; // rendered position
  tx: number; ty: number; // network target (remotes only)
  dir: Dir;
  moving: boolean;
  seat: string | null;
  ride: boolean; // on a scooter
  animT: number;
}

const POS_KEY = 'pixelhq:lastpos';
const lastPos = (() => {
  try { return JSON.parse(localStorage.getItem(POS_KEY) ?? 'null') as { x: number; y: number } | null; }
  catch { return null; }
})();
const startX = lastPos?.x ?? SPAWN.x;
const startY = lastPos?.y ?? SPAWN.y;

export const local: LiveBody = { x: startX, y: startY, tx: startX, ty: startY, dir: 'up', moving: false, seat: null, ride: false, animT: 0 };
export const remotes = new Map<string, LiveBody>();

export function persistPosition() {
  try { localStorage.setItem(POS_KEY, JSON.stringify({ x: local.x, y: local.y })); } catch { /* private mode */ }
}

export interface Bubble { text: string; until: number; kind: 'chat' | 'emote' }
export const bubbles = new Map<string, Bubble>(); // keyed by player id ('self' for local)

export function addBubble(id: string, text: string, kind: Bubble['kind'] = 'chat') {
  const ms = kind === 'emote' ? 2500 : Math.min(9000, 3500 + text.length * 60);
  bubbles.set(id, { text, until: performance.now() + ms, kind });
}

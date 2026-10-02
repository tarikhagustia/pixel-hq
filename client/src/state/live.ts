// Mutable, non-reactive game state read every animation frame.
import type { Dir } from '../../../shared/protocol';
import { SPAWN } from '../game/map';

export interface LiveBody {
  x: number; y: number; // rendered position
  tx: number; ty: number; // network target (remotes only)
  dir: Dir;
  moving: boolean;
  seat: string | null;
  animT: number;
}

export const local: LiveBody = { x: SPAWN.x, y: SPAWN.y, tx: SPAWN.x, ty: SPAWN.y, dir: 'up', moving: false, seat: null, animT: 0 };
export const remotes = new Map<string, LiveBody>();

export interface Bubble { text: string; until: number; kind: 'chat' | 'emote' }
export const bubbles = new Map<string, Bubble>(); // keyed by player id ('self' for local)

export function addBubble(id: string, text: string, kind: Bubble['kind'] = 'chat') {
  const ms = kind === 'emote' ? 2500 : Math.min(9000, 3500 + text.length * 60);
  bubbles.set(id, { text, until: performance.now() + ms, kind });
}

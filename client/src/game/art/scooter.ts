// Kick-scooter sprites: parked (side view, used by the rack) and ridden (4 directions).
// A ridden scooter is split into a "back" layer drawn under the rider and a "front"
// layer (stem + handlebar) drawn over them when it's between the rider and the camera.
import type { Dir } from '../../../../shared/protocol';
import { makeCanvas, outline, px, rect, shade, type Ctx } from '../pixel';
import { P } from './palette';

const TIRE = '#2a2a30';

/** Parked/side-view scooter, 14px long, front wheel on the right. (x, y) = rear wheel bottom-left. */
export function paintScooterSide(ctx: Ctx, x: number, y: number, color: string) {
  rect(ctx, x + 1, y - 4, 12, 2, color); rect(ctx, x + 1, y - 4, 12, 1, shade(color, 0.25)); // deck
  rect(ctx, x, y - 3, 3, 3, TIRE); rect(ctx, x + 11, y - 3, 3, 3, TIRE); // wheels
  px(ctx, x + 1, y - 2, P.metal); px(ctx, x + 12, y - 2, P.metal);
  rect(ctx, x + 11, y - 18, 2, 15, P.metal); // stem
  rect(ctx, x + 9, y - 19, 6, 2, P.metalDeep); // handlebar
  px(ctx, x + 9, y - 19, color);
}

export interface RideSprite { back: HTMLCanvasElement; front: HTMLCanvasElement; frontFirst: boolean }

// canvas anchor: rider's feet at (AX, AY)
export const AX = 12, AY = 20;
const SW = 24, SH = 24;
const cache = new Map<string, RideSprite>();

export function getRideSprite(dir: Dir, color: string): RideSprite {
  const key = `${dir}|${color}`;
  let s = cache.get(key);
  if (s) return s;
  const [back, b] = makeCanvas(SW, SH);
  const [front, f] = makeCanvas(SW, SH);
  let frontFirst = false; // draw the "front" layer before the rider (it's behind them)
  if (dir === 'left' || dir === 'right') {
    const m = dir === 'right' ? 1 : -1;
    const X = (dx: number, w: number) => (m === 1 ? AX + dx : AX - dx - w);
    rect(b, X(-8, 15), AY - 2, 15, 2, color); rect(b, X(-8, 15), AY - 2, 15, 1, shade(color, 0.25)); // deck
    rect(b, X(-9, 3), AY - 1, 3, 3, TIRE); rect(b, X(5, 3), AY - 1, 3, 3, TIRE); // wheels
    rect(f, X(5, 2), AY - 15, 2, 14, P.metal); // stem
    rect(f, X(3, 5), AY - 16, 5, 2, P.metalDeep); // handlebar
  } else if (dir === 'down') {
    // front wheel + stem towards the camera
    rect(b, AX - 2, AY - 6, 4, 6, color);
    rect(f, AX - 1, AY - 1, 2, 3, TIRE);
    rect(f, AX - 1, AY - 12, 2, 11, P.metal);
    rect(f, AX - 6, AY - 13, 12, 2, P.metalDeep);
    px(f, AX - 6, AY - 13, color); px(f, AX + 5, AY - 13, color);
  } else {
    // facing away: rear wheel towards us, stem + bar hidden behind the rider's body
    rect(b, AX - 2, AY - 4, 4, 5, color); rect(b, AX - 2, AY - 4, 4, 1, shade(color, 0.25));
    rect(b, AX - 1, AY, 2, 3, TIRE);
    rect(f, AX - 1, AY - 15, 2, 9, P.metal);
    rect(f, AX - 6, AY - 16, 12, 2, P.metalDeep);
    frontFirst = true;
  }
  outline(back);
  outline(front);
  s = { back, front, frontFirst };
  cache.set(key, s);
  return s;
}

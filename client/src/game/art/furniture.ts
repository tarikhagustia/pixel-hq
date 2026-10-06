// Procedural pixel-art furniture. Each piece is painted once into a cached,
// auto-outlined canvas; animated parts (screens, steam, fire…) are drawn per frame.
import { TILE } from '../../../../shared/protocol';
import type { Furniture } from '../map';
import { hash, makeCanvas, outline, px, rect, shade, type Ctx } from '../pixel';
import { CODE_COLORS, P } from './palette';
import { paintScooterSide } from './scooter';

const T = TILE;

export interface Sprite { canvas: HTMLCanvasElement; ox: number; oy: number }

/** How many pixels a piece of furniture extends above its footprint. */
const UP: Partial<Record<Furniture['type'], number>> = {
  desk: 10, sharedTable: 8, meetingTable: 2, sofa: 8, armchair: 6, coffeeTable: 2, plant: 10, bookshelf: 14,
  fireplace: 4, counter: 4, coffeeMachine: 10, mugs: 4, microwave: 6, sink: 4, fridge: 8, waterCooler: 12,
  vending: 8, roundTable: 4, stool: 2, pingpong: 4, arcade: 10, foosball: 4, tvStand: 16, beanbag: 3,
  coatRack: 14, bench: 4, serverRack: 10, printer: 4, boardStand: 18, lamp: 18, sign: 8, chair: 6,
  tree: 38, fountain: 8, flowerBed: 4, picnicTable: 2, lampPost: 30, parasol: 28, pastryCase: 10, register: 6,
  aframe: 10, scooterRack: 20,
};

const cache = new Map<string, Sprite>();

export function getSprite(f: Furniture): Sprite {
  const key = `${f.type}|${f.w}x${f.h}|${f.variant ?? 0}|${f.facing ?? ''}`;
  let s = cache.get(key);
  if (s) return s;
  const up = f.layer === 'obj' ? UP[f.type] ?? 0 : 0;
  const w = f.w * T, h = f.h * T + up;
  const [c, ctx] = makeCanvas(w + 2, h + 2);
  ctx.translate(1, 1 + up); // (0,0) = footprint top-left; negative y = above footprint
  paint(ctx, f, w, f.h * T);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (f.layer !== 'floor' && f.type !== 'window') outline(c);
  s = { canvas: c, ox: 1, oy: 1 + up };
  cache.set(key, s);
  return s;
}

/** Y used for depth-sorting against characters (feet position). */
export function sortY(f: Furniture): number {
  const top = f.y * T;
  const isSeatish = f.type === 'chair' || f.type === 'sofa' || f.type === 'armchair' || f.type === 'stool' || f.type === 'beanbag' || f.type === 'bench';
  if (isSeatish) return f.facing === 'up' ? top + f.h * T + 2 : top + 4;
  if (['coffeeMachine', 'mugs', 'microwave', 'sink', 'register'].includes(f.type)) return top + T + 0.5;
  if (f.type === 'sign') return top + 10;
  return top + f.h * T;
}

// ----------------------------------------------------------------- painters
function paint(ctx: Ctx, f: Furniture, W: number, H: number) {
  const v = f.variant ?? 0;
  switch (f.type) {
    case 'desk': {
      rect(ctx, 0, 0, W, 10, P.woodMid);
      rect(ctx, 0, 0, W, 1, P.woodLight);
      rect(ctx, 0, 10, W, 4, P.woodDark);
      rect(ctx, 1, 14, 2, 2, P.woodDeep); rect(ctx, W - 3, 14, 2, 2, P.woodDeep);
      rect(ctx, 3, 11, 8, 2, shade(P.woodDark, -0.15)); // drawer
      px(ctx, 7, 11, P.yellow);
      // monitor (right half, centred on the chair)
      rect(ctx, 17, -9, 12, 9, P.metalDeep);
      rect(ctx, 18, -8, 10, 7, P.screenOff);
      rect(ctx, 22, 0, 2, 2, P.metalDark);
      rect(ctx, 20, 2, 6, 1, P.metalDark);
      rect(ctx, 19, 5, 9, 2, '#d7dbe0'); rect(ctx, 19, 6, 9, 1, '#b8bec6');
      rect(ctx, 29, 5, 2, 3, '#e8e8e8'); // mouse
      deskExtra(ctx, v);
      break;
    }
    case 'chair': {
      const c = '#4a5878', cl = '#5d6d92', cd = '#36415c';
      if (f.facing === 'up') {
        rect(ctx, 3, 1, 10, 6, cl); // seat
        rect(ctx, 3, 6, 10, 7, c); rect(ctx, 4, 7, 8, 1, cl); // backrest towards viewer
        rect(ctx, 7, 13, 2, 2, cd); rect(ctx, 4, 15, 8, 1, cd);
      } else if (f.facing === 'down') {
        rect(ctx, 3, -6, 10, 8, c); rect(ctx, 4, -5, 8, 1, cl);
        rect(ctx, 3, 2, 10, 7, cl); rect(ctx, 3, 8, 10, 1, c);
        rect(ctx, 7, 9, 2, 3, cd); rect(ctx, 4, 12, 8, 1, cd);
      } else {
        const back = f.facing === 'right' ? 2 : 11;
        rect(ctx, 3, 3, 10, 7, cl);
        rect(ctx, back, -5, 3, 14, c);
        rect(ctx, 7, 10, 2, 3, cd); rect(ctx, 4, 13, 8, 1, cd);
      }
      break;
    }
    case 'stool': {
      rect(ctx, 3, 2, 10, 6, '#c96e3f'); rect(ctx, 3, 2, 10, 1, '#e08a58');
      rect(ctx, 7, 8, 2, 5, P.metalDark); rect(ctx, 4, 13, 8, 1, P.metalDark);
      break;
    }
    case 'armchair': {
      const c = '#a8463e', l = '#c45a50';
      rect(ctx, 1, -2, 14, 14, c);
      rect(ctx, 3, 2, 10, 8, l);
      const back = f.facing === 'right' ? 0 : 11;
      rect(ctx, back, -6, 5, 18, c); rect(ctx, back + 1, -5, 3, 1, l);
      rect(ctx, 2, 12, 2, 2, P.woodDeep); rect(ctx, 12, 12, 2, 2, P.woodDeep);
      break;
    }
    case 'sharedTable': {
      rect(ctx, 0, 0, W, H - 6, '#e8e2d4'); rect(ctx, 0, 0, W, 1, '#fffaf0');
      rect(ctx, 0, H - 6, W, 4, '#b9b1a0');
      rect(ctx, 2, H - 2, 2, 2, P.metalDark); rect(ctx, W - 4, H - 2, 2, 2, P.metalDark);
      rect(ctx, 0, 11, W, 1, '#cfc7b6');
      for (let k = 0; k < 4; k++) {
        const cx = k * 32 + 24;
        // back of north-facing monitor (for the north seats)
        rect(ctx, cx - 6, -8, 12, 9, P.metalDark); rect(ctx, cx - 1, -5, 2, 2, P.metal);
        rect(ctx, cx - 1, 1, 2, 2, P.metalDeep);
        // south-facing monitor
        rect(ctx, cx - 6, 6, 12, 9, P.metalDeep); rect(ctx, cx - 5, 7, 10, 7, P.screenOff);
        rect(ctx, cx - 1, 15, 2, 2, P.metalDark);
        rect(ctx, cx - 5, 19, 10, 2, '#d7dbe0');
        if (k % 2 === 0) { rect(ctx, cx + 8, 18, 3, 3, P.white); px(ctx, cx + 9, 18, '#7a4a2a'); } // mug
        else { rect(ctx, cx - 14, 18, 5, 4, P.paper); rect(ctx, cx - 13, 19, 3, 1, '#9aa'); }
      }
      break;
    }
    case 'meetingTable': {
      rect(ctx, 2, -2, W - 4, H - 4, '#8b5a3c');
      rect(ctx, 0, 0, W, H - 8, '#8b5a3c');
      rect(ctx, 3, 0, W - 6, H - 10, '#a46d47');
      rect(ctx, 4, 1, W - 8, 1, '#b97f55');
      rect(ctx, 0, H - 8, W, 4, '#6b4329');
      rect(ctx, 6, H - 4, 3, 4, P.woodDeep); rect(ctx, W - 9, H - 4, 3, 4, P.woodDeep);
      // laptops / notebooks
      rect(ctx, 14, 3, 10, 7, '#cfd5dc'); rect(ctx, 15, 4, 8, 5, '#3c4a5e');
      rect(ctx, 60, 22, 10, 7, '#cfd5dc'); rect(ctx, 61, 23, 8, 5, '#3c4a5e');
      rect(ctx, 34, 4, 7, 9, P.paper); rect(ctx, 35, 6, 5, 1, '#9aa'); rect(ctx, 35, 8, 4, 1, '#9aa');
      rect(ctx, 44, 16, 8, 6, '#2f3542'); px(ctx, 47, 18, P.green); // speakerphone
      rect(ctx, 76, 6, 3, 4, '#bfe6f5'); rect(ctx, 26, 24, 3, 4, '#bfe6f5'); // water glasses
      break;
    }
    case 'sofa': {
      const c = '#c0674b', l = '#d77f60', d = '#9c4e38';
      if (f.facing === 'down') {
        rect(ctx, 0, -8, W, 11, c); rect(ctx, 2, -7, W - 4, 1, l);
        rect(ctx, 0, 2, W, 10, d);
        for (let i = 0; i < 3; i++) { rect(ctx, 4 + i * 14, 2, 13, 8, l); rect(ctx, 4 + i * 14, 9, 13, 1, c); }
        rect(ctx, 0, -2, 4, 14, c); rect(ctx, W - 4, -2, 4, 14, c);
        rect(ctx, 0, 12, W, 3, d);
      } else {
        rect(ctx, 0, -6, W, 10, d);
        for (let i = 0; i < 3; i++) rect(ctx, 4 + i * 14, -5, 13, 8, l);
        rect(ctx, 0, 3, W, 12, c); rect(ctx, 2, 4, W - 4, 1, l);
        rect(ctx, 0, -6, 4, 21, c); rect(ctx, W - 4, -6, 4, 21, c);
      }
      break;
    }
    case 'coffeeTable': {
      rect(ctx, 0, 2, W, H - 6, P.woodMid); rect(ctx, 0, 2, W, 1, P.woodLight);
      rect(ctx, 0, H - 4, W, 2, P.woodDark);
      rect(ctx, 2, H - 2, 2, 2, P.woodDeep); rect(ctx, W - 4, H - 2, 2, 2, P.woodDeep);
      rect(ctx, 6, 6, 9, 7, P.blue); rect(ctx, 7, 7, 7, 2, P.paper); // magazine
      rect(ctx, 22, 8, 4, 4, P.white); px(ctx, 23, 9, '#7a4a2a');
      rect(ctx, 34, 4, 6, 5, P.pot); rect(ctx, 33, 0, 8, 5, P.leaf); px(ctx, 35, 1, P.leafLight);
      break;
    }
    case 'rug': {
      const cols = [['#d9c7a3', '#b5523b', '#e8d9b8'], ['#8c3b3b', '#e0b252', '#a34a4a'], ['#4b5b9a', '#f6d365', '#5a6bb0']][v];
      rect(ctx, 0, 0, W, H, cols[1]);
      rect(ctx, 2, 2, W - 4, H - 4, cols[0]);
      rect(ctx, 4, 4, W - 8, H - 8, cols[2]);
      for (let i = 6; i < W - 6; i += 6) for (let j = 6; j < H - 6; j += 6) {
        if ((i + j) % 12 === 0) { px(ctx, i, j, cols[1]); px(ctx, i + 1, j + 1, cols[1]); }
      }
      for (let i = 0; i < W; i += 2) { px(ctx, i, -0, shade(cols[1], 0.2)); px(ctx, i, H - 1, shade(cols[1], 0.2)); }
      break;
    }
    case 'doormat': {
      rect(ctx, 0, 2, W, 12, '#7a5236');
      rect(ctx, 2, 4, W - 4, 8, '#9c6b43');
      for (let i = 4; i < W - 4; i += 3) rect(ctx, i, 6, 2, 4, '#7a5236');
      break;
    }
    case 'plant': plant(ctx, v); break;
    case 'bookshelf': {
      rect(ctx, 0, -14, W, H + 14, P.woodDark);
      rect(ctx, 1, -13, W - 2, H + 12, P.woodDeep);
      const rows = Math.floor((H + 12) / 8);
      for (let r = 0; r < rows; r++) {
        const y = -13 + r * 8;
        rect(ctx, 1, y + 7, W - 2, 1, P.woodMid);
        let x = 2;
        while (x < W - 3) {
          const bw = 2 + Math.floor(hash(x, r, v) * 2);
          const bh = 4 + Math.floor(hash(r, x, 7) * 3);
          const col = [P.red, P.blue, P.yellow, P.green, P.purple, P.teal, P.orange][Math.floor(hash(x, r, v + 3) * 7)];
          if (hash(x, r, 11) > 0.12) rect(ctx, x, y + 7 - bh, bw, bh, col);
          x += bw + (hash(x, r, 5) > 0.8 ? 2 : 0);
        }
      }
      break;
    }
    case 'fireplace': {
      rect(ctx, 0, -4, W, H + 4, '#9b8f84');
      for (let j = -4; j < H; j += 4) for (let i = (j / 4) % 2 ? 0 : 3; i < W; i += 6) rect(ctx, i, j, 5, 3, '#b0a497');
      rect(ctx, -0, -4, W, 3, '#6b4a2f');
      rect(ctx, 6, 6, W - 12, H - 8, '#2a1b16');
      rect(ctx, 8, H - 5, W - 16, 2, '#5a3a28'); // logs
      break;
    }
    case 'counter': {
      rect(ctx, 0, 0, W, 6, '#ece8e0'); rect(ctx, 0, 0, W, 1, P.white);
      rect(ctx, 0, 6, W, 10, P.woodMid);
      for (let i = 0; i < W; i += 16) { rect(ctx, i + 1, 7, 14, 8, P.woodDark); rect(ctx, i + 2, 8, 12, 6, P.woodMid); px(ctx, i + 12, 10, P.metal); }
      break;
    }
    case 'coffeeMachine': {
      rect(ctx, 2, -10, 12, 13, '#3a3a40'); rect(ctx, 3, -9, 10, 3, '#55555d');
      px(ctx, 11, -8, P.red);
      rect(ctx, 5, -4, 6, 1, P.metal); rect(ctx, 6, -2, 4, 4, P.white); px(ctx, 7, -1, '#7a4a2a');
      break;
    }
    case 'mugs': {
      [[2, P.red], [6, P.blue], [10, P.yellow]].forEach(([x, c]) => { rect(ctx, x as number, -2, 3, 4, c as string); px(ctx, (x as number) + 3, -1, c as string); });
      break;
    }
    case 'microwave': {
      rect(ctx, 1, -6, 14, 9, '#e6e6e6'); rect(ctx, 2, -5, 8, 6, '#2c3440'); rect(ctx, 11, -5, 3, 1, P.green);
      break;
    }
    case 'sink': {
      rect(ctx, 2, -1, 12, 5, P.metal); rect(ctx, 3, 0, 10, 3, '#c8d4dc'); rect(ctx, 7, -4, 2, 3, P.metalDark);
      break;
    }
    case 'fridge': {
      rect(ctx, 0, -8, W, H + 6, '#e9eef2'); rect(ctx, 0, -8, W, 1, P.white);
      rect(ctx, 0, 6, W, 1, '#b9c2c9');
      rect(ctx, 12, -4, 1, 6, P.metalDark); rect(ctx, 12, 9, 1, 6, P.metalDark);
      px(ctx, 4, -3, P.red); px(ctx, 6, 0, P.yellow); px(ctx, 3, 2, P.blue); rect(ctx, 5, -2, 3, 3, P.paper);
      rect(ctx, 0, H - 2, W, 2, '#b9c2c9');
      break;
    }
    case 'waterCooler': {
      rect(ctx, 3, 0, 10, 15, '#e9eef2'); rect(ctx, 4, -11, 8, 11, '#9fd3f0'); rect(ctx, 5, -10, 2, 8, '#c9ebfb');
      rect(ctx, 6, 4, 4, 2, P.blue); rect(ctx, 6, 7, 4, 1, P.red);
      break;
    }
    case 'vending': {
      rect(ctx, 0, -8, W, H + 8, '#c94a4a'); rect(ctx, 0, -8, W, 2, '#e06a5f');
      rect(ctx, 2, -4, 10, 22, '#a7d3e0');
      for (let r = 0; r < 5; r++) for (let i = 0; i < 3; i++) rect(ctx, 3 + i * 3, -3 + r * 4, 2, 3, CODE_COLORS[(r * 3 + i) % CODE_COLORS.length]);
      rect(ctx, 13, 0, 2, 6, '#3a3a40'); rect(ctx, 2, 20, 10, 3, '#3a2a2a');
      break;
    }
    case 'roundTable': {
      rect(ctx, 1, -4, 14, 9, P.woodMid); rect(ctx, 2, -4, 12, 1, P.woodLight);
      rect(ctx, 0, -2, 16, 5, P.woodMid);
      rect(ctx, 1, 5, 14, 2, P.woodDark);
      rect(ctx, 7, 7, 2, 6, P.woodDeep); rect(ctx, 4, 13, 8, 1, P.woodDeep);
      if (v === 0) { rect(ctx, 5, -2, 3, 3, P.white); px(ctx, 6, -1, '#7a4a2a'); } else { rect(ctx, 6, -3, 4, 3, '#e8b86d'); }
      break;
    }
    case 'pingpong': {
      rect(ctx, 0, -2, W, H - 4, '#2f7d5b'); rect(ctx, 1, -1, W - 2, H - 6, '#3a9a6e');
      rect(ctx, 1, (H - 6) / 2 - 1, W - 2, 1, P.white);
      rect(ctx, W / 2 - 1, -4, 2, H - 2, '#e8e8e8');
      rect(ctx, 0, H - 6, W, 3, '#1f5a40');
      rect(ctx, 3, H - 3, 2, 3, P.metalDark); rect(ctx, W - 5, H - 3, 2, 3, P.metalDark);
      rect(ctx, 8, 6, 4, 4, P.red); rect(ctx, 11, 9, 2, 2, P.woodDark);
      rect(ctx, W - 12, 14, 4, 4, '#2a2a2a'); rect(ctx, W - 13, 17, 2, 2, P.woodDark);
      break;
    }
    case 'arcade': {
      const c = v ? '#6b4fd1' : '#d1494f';
      rect(ctx, 0, -10, W, H + 10, c); rect(ctx, 0, -10, W, 4, shade(c, 0.25));
      rect(ctx, 2, -5, 12, 11, '#141420');
      rect(ctx, 1, 8, 14, 4, shade(c, -0.25));
      px(ctx, 4, 9, P.yellow); px(ctx, 9, 9, P.red); px(ctx, 11, 10, P.blue);
      rect(ctx, 2, 14, 12, 14, shade(c, -0.1)); rect(ctx, 6, 22, 4, 2, '#f6d365');
      break;
    }
    case 'foosball': {
      rect(ctx, 0, -4, W, H - 2, P.woodDark); rect(ctx, 2, -2, W - 4, H - 6, '#3a9a6e');
      rect(ctx, W / 2, -2, 1, H - 6, '#e8f5e8');
      for (let i = 0; i < 5; i++) {
        const x = 6 + i * 9;
        rect(ctx, x, -6, 1, H + 2, P.metal);
        for (let j = 0; j < 2; j++) rect(ctx, x - 1, 2 + j * 10, 3, 3, i % 2 ? P.red : P.blue);
      }
      rect(ctx, 2, H - 4, 3, 4, P.woodDeep); rect(ctx, W - 5, H - 4, 3, 4, P.woodDeep);
      break;
    }
    case 'tvStand': {
      rect(ctx, 0, 8, W, H - 8, P.woodMid); rect(ctx, 0, 8, W, 1, P.woodLight);
      for (let i = 0; i < 4; i++) rect(ctx, 2 + i * 15, 12, 13, 14, P.woodDark);
      rect(ctx, 6, -16, W - 12, 24, '#1b1b22'); rect(ctx, 8, -14, W - 16, 19, '#0f1522');
      rect(ctx, W / 2 - 3, 8, 6, 2, '#1b1b22');
      rect(ctx, 40, 4, 10, 3, '#efefef'); // console
      rect(ctx, 12, 20, 6, 3, '#2a2a33'); px(ctx, 14, 21, P.red); px(ctx, 16, 21, P.blue);
      break;
    }
    case 'beanbag': {
      const c = [P.orange, P.purple, P.teal][v % 3];
      rect(ctx, 1, -1, 14, 13, c); rect(ctx, 0, 2, 16, 8, c);
      rect(ctx, 3, -3, 10, 4, shade(c, 0.2));
      rect(ctx, 3, 1, 4, 2, shade(c, 0.35));
      rect(ctx, 2, 10, 12, 2, shade(c, -0.25));
      break;
    }
    case 'coatRack': {
      rect(ctx, 7, -14, 2, 28, P.woodDeep);
      rect(ctx, 3, 13, 10, 2, P.woodDeep);
      rect(ctx, 2, -12, 5, 10, '#6b8f6a'); rect(ctx, 9, -11, 5, 12, '#c7a46b');
      rect(ctx, 5, -16, 6, 3, '#3b4a6b');
      break;
    }
    case 'bench': {
      rect(ctx, 0, -2, W, 6, P.woodMid); rect(ctx, 0, -2, W, 1, P.woodLight);
      rect(ctx, 0, 4, W, 2, P.woodDark);
      rect(ctx, 2, 6, 2, 6, P.woodDeep); rect(ctx, W - 4, 6, 2, 6, P.woodDeep);
      break;
    }
    case 'serverRack': {
      rect(ctx, 0, -10, W, H + 10, '#26282f'); rect(ctx, 1, -9, W - 2, H + 8, '#32353f');
      for (let y = -8; y < H - 2; y += 4) rect(ctx, 2, y, W - 4, 3, '#1c1e24');
      break;
    }
    case 'printer': {
      rect(ctx, 1, -4, 14, 12, '#d8d8d8'); rect(ctx, 1, -4, 14, 2, '#efefef');
      rect(ctx, 3, -6, 10, 3, P.paper); rect(ctx, 3, 4, 10, 2, '#3a3a40'); px(ctx, 12, 0, P.green);
      rect(ctx, 2, 8, 12, 6, '#bdbdbd');
      break;
    }
    case 'boardStand': {
      rect(ctx, 0, -18, W, 22, '#d0d4da'); rect(ctx, 1, -17, W - 2, 20, P.white);
      rect(ctx, 2, -17, 1, 20, '#e0e4ea'); rect(ctx, W / 3, -17, 1, 20, '#e0e4ea'); rect(ctx, (2 * W) / 3, -17, 1, 20, '#e0e4ea');
      const notes = [P.yellow, P.pink, P.green, P.yellow, P.blue, P.pink, P.yellow];
      notes.forEach((c, i) => rect(ctx, 3 + (i % 3) * 10, -15 + Math.floor(i / 3) * 6, 5, 4, c));
      rect(ctx, 3, 4, 2, 10, P.metalDark); rect(ctx, W - 5, 4, 2, 10, P.metalDark);
      break;
    }
    case 'lamp': {
      rect(ctx, 7, -10, 2, 22, P.metalDeep);
      rect(ctx, 4, 12, 8, 2, P.metalDeep);
      rect(ctx, 3, -18, 10, 8, '#f2dca8'); rect(ctx, 4, -18, 8, 1, '#fff2cf'); rect(ctx, 3, -11, 10, 1, '#d9bd84');
      break;
    }
    case 'sign': {
      rect(ctx, 2, -8, 12, 9, P.woodDark); rect(ctx, 3, -7, 10, 7, '#2f2a33');
      rect(ctx, 7, 1, 2, 9, P.woodDeep); rect(ctx, 4, 10, 8, 2, P.woodDeep);
      break;
    }
    case 'tree': {
      const leaf = v ? '#5c9e45' : '#4f8f3a', light = v ? '#7cc05a' : '#68ab4b', dark = '#3a7230';
      rect(ctx, 13, -8, 6, 21, '#7a5236'); rect(ctx, 13, -8, 2, 21, '#946645');
      rect(ctx, 10, 11, 12, 3, '#6b4a2f'); // roots
      rect(ctx, 4, -32, 24, 24, leaf); rect(ctx, 0, -26, 32, 14, leaf); rect(ctx, 9, -38, 14, 8, leaf);
      rect(ctx, 2, -12, 28, 3, dark);
      rect(ctx, 7, -35, 10, 5, light); rect(ctx, 3, -27, 9, 6, light); rect(ctx, 18, -30, 7, 4, light);
      for (let i = 0; i < 14; i++) {
        const x = 2 + Math.floor(hash(i, 3, v) * 27), y = -34 + Math.floor(hash(i, 7, v) * 22);
        px(ctx, x, y, v ? '#f7b6cf' : dark); // blossoms on variant 1
        if (v) px(ctx, x + 1, y, '#fbd3e2');
      }
      break;
    }
    case 'fountain': {
      const stone = '#b9b2a6', stoneD = '#8f887c', water = '#6fb8d9';
      rect(ctx, 4, 2, W - 8, H - 4, stone); rect(ctx, 0, 8, W, H - 16, stone);
      rect(ctx, 7, 5, W - 14, H - 12, water); rect(ctx, 3, 11, W - 6, H - 22, water);
      rect(ctx, 0, H - 10, W, 3, stoneD); rect(ctx, 4, H - 4, W - 8, 2, stoneD);
      rect(ctx, 4, 2, W - 8, 1, '#d4cec3');
      // centre column and bowl
      rect(ctx, 21, 10, 6, 22, stone); rect(ctx, 21, 10, 2, 22, '#d4cec3');
      rect(ctx, 15, 6, 18, 5, stone); rect(ctx, 16, 5, 16, 2, water); rect(ctx, 15, 10, 18, 1, stoneD);
      rect(ctx, 22, -6, 4, 12, stone); rect(ctx, 21, -8, 6, 3, stoneD);
      break;
    }
    case 'flowerBed': {
      const cols = [[P.pink, P.yellow, P.white], ['#e05a4f', P.orange, P.yellow], [P.purple, P.blue, P.white]][v % 3];
      rect(ctx, 0, 4, W, 10, P.woodMid); rect(ctx, 0, 4, W, 1, P.woodLight); rect(ctx, 0, 12, W, 2, P.woodDark);
      for (let i = 16; i < W; i += 16) rect(ctx, i, 5, 1, 7, P.woodDark);
      rect(ctx, 1, 1, W - 2, 4, '#5a3d2a');
      for (let i = 0; i < W / 4 - 1; i++) {
        const x = 2 + i * 4, y = -3 + Math.floor(hash(i, v) * 3);
        rect(ctx, x + 1, y + 2, 1, 3, P.leafDark); px(ctx, x + 2, y + 3, P.leaf);
        rect(ctx, x, y, 2, 2, cols[i % 3]); px(ctx, x, y, shade(cols[i % 3], 0.3));
      }
      break;
    }
    case 'picnicTable': {
      rect(ctx, 0, 2, W, H - 10, '#b5794a'); rect(ctx, 0, 2, W, 1, '#cf9563');
      for (let y = 6; y < H - 8; y += 5) rect(ctx, 0, y, W, 1, '#94603a');
      rect(ctx, 0, H - 8, W, 3, P.woodDark);
      rect(ctx, 3, H - 5, 3, 5, P.woodDeep); rect(ctx, W - 6, H - 5, 3, 5, P.woodDeep);
      // checked cloth, basket and lemonade
      rect(ctx, 12, 5, 24, 14, P.white);
      for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) rect(ctx, 12 + i * 4, 5 + j * 4, 4, 3, '#e06a5f');
      rect(ctx, 19, 7, 9, 6, '#c79a5b'); rect(ctx, 20, 6, 7, 1, '#a87b42'); rect(ctx, 21, 3, 5, 1, '#a87b42');
      rect(ctx, 6, 8, 3, 4, '#fff0a0'); rect(ctx, 39, 12, 3, 4, '#fff0a0');
      break;
    }
    case 'lampPost': {
      rect(ctx, 7, -22, 2, 34, P.metalDeep);
      rect(ctx, 5, 10, 6, 4, P.metalDeep); rect(ctx, 6, 9, 4, 1, P.metalDark);
      rect(ctx, 3, -30, 10, 2, P.metalDeep);
      rect(ctx, 4, -28, 8, 7, P.metalDeep); rect(ctx, 5, -27, 6, 5, '#ffe9a8'); rect(ctx, 5, -27, 2, 5, '#fff6d6');
      rect(ctx, 5, -21, 6, 1, P.metalDark);
      break;
    }
    case 'parasol': {
      const c = v ? P.teal : '#e05a4f';
      rect(ctx, 7, -20, 2, 24, P.metal);
      rect(ctx, 0, -25, 16, 5, P.white);
      for (let i = 0; i < 16; i += 6) rect(ctx, i, -25, 3, 5, c);
      rect(ctx, 2, -27, 12, 2, c); rect(ctx, 6, -28, 4, 1, c);
      for (let i = 0; i < 16; i += 3) px(ctx, i + 1, -20, shade(c, -0.2));
      rect(ctx, 1, 0, 14, 5, '#efeae0'); rect(ctx, 1, 0, 14, 1, P.white); rect(ctx, 1, 5, 14, 1, '#cfc7b6');
      rect(ctx, 7, 6, 2, 6, P.metalDark); rect(ctx, 4, 12, 8, 2, P.metalDark);
      rect(ctx, 3, 1, 3, 3, P.white); px(ctx, 4, 2, '#7a4a2a'); rect(ctx, 10, 1, 3, 2, '#e8b86d');
      break;
    }
    case 'pastryCase': {
      rect(ctx, 0, 4, W, 12, P.woodMid); rect(ctx, 1, 6, W - 2, 8, P.woodDark);
      rect(ctx, 0, -10, W, 2, P.woodDark);
      rect(ctx, 1, -8, W - 2, 12, '#cfe9f2');
      rect(ctx, 1, -2, W - 2, 1, '#e8f6fa');
      const treats = ['#e0a050', '#f08fb0', '#8a5a34', '#f6d365', '#e0a050', '#c45a50'];
      treats.forEach((c, i) => { rect(ctx, 3 + i * 5, -6, 4, 3, c); px(ctx, 4 + i * 5, -6, shade(c, 0.3)); });
      treats.forEach((c, i) => { rect(ctx, 3 + i * 5, 0, 4, 3, treats[(i + 3) % 6]); });
      for (let i = 0; i < 4; i++) px(ctx, 4 + i, -7 + i, '#ffffff');
      break;
    }
    case 'register': {
      rect(ctx, 3, -6, 10, 6, P.metalDeep); rect(ctx, 4, -5, 7, 3, '#7fdbca');
      rect(ctx, 2, 0, 12, 3, '#55555d'); px(ctx, 12, -4, P.red);
      break;
    }
    case 'aframe': {
      rect(ctx, 2, -10, 12, 20, P.woodDark); rect(ctx, 3, -9, 10, 17, '#2f3a33');
      rect(ctx, 5, -7, 6, 1, '#f3efe6'); rect(ctx, 4, -4, 8, 1, '#d8d4cc'); rect(ctx, 4, -1, 6, 1, '#d8d4cc');
      rect(ctx, 6, 2, 3, 3, P.white); px(ctx, 9, 3, P.white); px(ctx, 7, 3, '#7a4a2a'); px(ctx, 11, 5, P.pink);
      rect(ctx, 3, 10, 2, 3, P.woodDeep); rect(ctx, 11, 10, 2, 3, P.woodDeep);
      break;
    }
    case 'scooterRack': {
      // little parking sign + two scooters standing on a dock plate
      rect(ctx, 1, 12, W - 2, 3, '#6d737d'); rect(ctx, 1, 12, W - 2, 1, '#8a909a');
      rect(ctx, 1, -12, 2, 24, P.metalDark);
      rect(ctx, -1, -20, 7, 8, P.blue); rect(ctx, 1, -18, 1, 5, P.white); rect(ctx, 2, -18, 2, 1, P.white); rect(ctx, 2, -16, 2, 1, P.white); px(ctx, 4, -17, P.white);
      paintScooterSide(ctx, 4, 13, P.teal);
      paintScooterSide(ctx, 17, 13, P.pink);
      break;
    }
    case 'chalkboard': {
      rect(ctx, 0, 2, W, 26, P.woodDark); rect(ctx, 2, 4, W - 4, 22, '#2f3a33');
      rect(ctx, 15, 6, 18, 2, '#f3efe6'); // "MENU"
      for (let i = 0; i < 4; i++) {
        rect(ctx, 5, 11 + i * 4, 14 + (i % 2) * 4, 1, '#d8d4cc');
        rect(ctx, 36, 11 + i * 4, 6, 1, i % 2 ? P.yellow : P.pink);
        for (let k = 22; k < 34; k += 2) px(ctx, k + (i % 2) * 2, 11 + i * 4, '#7d8a80');
      }
      break;
    }
    // ---- wall-mounted
    case 'window': {
      rect(ctx, 0, 1, W, H - 4, '#6b4a3a');
      rect(ctx, 2, 3, W - 4, H - 9, '#9fd3f0');
      rect(ctx, W / 2 - 1, 3, 2, H - 9, '#6b4a3a');
      rect(ctx, -1, H - 6, W + 2, 3, P.woodLight); rect(ctx, -1, H - 3, W + 2, 1, P.woodDark);
      // tiny potted plant on the sill
      rect(ctx, 3, H - 9, 4, 3, P.pot); rect(ctx, 2, H - 12, 6, 3, P.leaf); px(ctx, 4, H - 12, P.leafLight);
      break;
    }
    case 'poster': {
      const bg = ['#253a5e', '#e8d9b8', '#f2c6a0'][v % 3];
      rect(ctx, 2, 2, 12, 15, bg);
      if (v === 0) { rect(ctx, 7, 5, 2, 7, P.white); rect(ctx, 6, 9, 4, 2, P.red); px(ctx, 7, 12, P.orange); px(ctx, 8, 13, P.yellow); px(ctx, 4, 4, P.yellow); px(ctx, 11, 7, P.white); rect(ctx, 4, 14, 8, 1, P.yellow); }
      else if (v === 1) { rect(ctx, 3, 10, 10, 6, P.leafDark); rect(ctx, 5, 7, 6, 4, P.metal); rect(ctx, 7, 5, 2, 3, P.white); rect(ctx, 10, 4, 2, 2, P.orange); }
      else { rect(ctx, 5, 7, 6, 6, '#3a3a40'); px(ctx, 5, 6, '#3a3a40'); px(ctx, 10, 6, '#3a3a40'); px(ctx, 7, 9, P.yellow); px(ctx, 9, 9, P.yellow); rect(ctx, 4, 14, 8, 1, '#9c4e38'); }
      break;
    }
    case 'clock': {
      rect(ctx, 3, 4, 10, 10, P.woodDark); rect(ctx, 2, 6, 12, 6, P.woodDark);
      rect(ctx, 4, 5, 8, 8, P.paper); rect(ctx, 3, 7, 10, 4, P.paper);
      break;
    }
    case 'whiteboard': {
      rect(ctx, 1, 2, W - 2, H - 8, '#c4c9d0'); rect(ctx, 2, 3, W - 4, H - 10, P.white);
      rect(ctx, 5, 6, 12, 1, P.blue); rect(ctx, 5, 9, 8, 1, P.blue); rect(ctx, 5, 12, 10, 1, P.red);
      rect(ctx, 24, 6, 6, 5, 'transparent');
      rect(ctx, 24, 6, 7, 1, P.green); rect(ctx, 24, 6, 1, 6, P.green); rect(ctx, 30, 6, 1, 6, P.green); rect(ctx, 24, 11, 7, 1, P.green);
      rect(ctx, 32, 8, 6, 1, P.purple); rect(ctx, 37, 8, 1, 4, P.purple);
      rect(ctx, 4, H - 6, W - 8, 2, P.metal); px(ctx, 10, H - 7, P.red); px(ctx, 13, H - 7, P.blue);
      break;
    }
    case 'wallTv': {
      rect(ctx, 2, 1, W - 4, H - 6, '#1b1b22'); rect(ctx, 4, 3, W - 8, H - 10, '#0f1522');
      break;
    }
    default:
      rect(ctx, 0, 0, W, H, '#f0f');
  }
}

function deskExtra(ctx: Ctx, v: number) {
  switch (v) {
    case 0: rect(ctx, 4, -1, 5, 4, P.pot); rect(ctx, 3, -6, 7, 5, P.leaf); px(ctx, 5, -5, P.leafLight); px(ctx, 8, -3, P.leafDark); break;
    case 1: rect(ctx, 3, 3, 7, 5, P.paper); rect(ctx, 4, 4, 5, 1, '#aab'); rect(ctx, 11, 1, 3, 4, P.red); px(ctx, 14, 2, P.red); break;
    case 2: rect(ctx, 4, -6, 2, 9, P.metalDeep); rect(ctx, 3, -8, 6, 3, P.yellow); rect(ctx, 3, 3, 4, 1, P.metalDeep); rect(ctx, 10, 3, 4, 4, P.paper); break;
    case 3: rect(ctx, 4, -10, 8, 11, P.metalDeep); rect(ctx, 5, -9, 6, 9, P.screenOff); rect(ctx, 7, 1, 2, 2, P.metalDark); break;
    case 4: rect(ctx, 5, 1, 4, 3, P.yellow); px(ctx, 6, 0, P.yellow); px(ctx, 7, 0, P.yellow); px(ctx, 9, 2, P.orange); px(ctx, 6, 1, P.outline); rect(ctx, 12, 2, 3, 4, P.blue); break;
    case 5: rect(ctx, 5, -2, 4, 4, P.pot); rect(ctx, 6, -7, 2, 6, P.leafDark); px(ctx, 5, -5, P.leafDark); px(ctx, 8, -4, P.leafDark); rect(ctx, 11, 3, 3, 3, P.yellow); rect(ctx, 13, 5, 3, 3, P.pink); break;
  }
}

function plant(ctx: Ctx, v: number) {
  const pot = (x: number, y: number, w: number, h: number) => {
    rect(ctx, x, y, w, h, P.pot); rect(ctx, x - 1, y, w + 2, 2, P.potDark); rect(ctx, x + 1, y + 2, 1, h - 3, '#d98066');
  };
  if (v === 0) {
    pot(4, 7, 8, 7);
    rect(ctx, 2, -6, 12, 12, P.leaf); rect(ctx, 0, -2, 16, 6, P.leaf);
    rect(ctx, 4, -9, 8, 4, P.leafLight);
    [[3, -4], [10, -6], [6, 0], [12, 1], [1, 2]].forEach(([x, y]) => { px(ctx, x, y, P.leafDark); px(ctx, x + 1, y + 1, P.leafDark); });
    [[5, -7], [9, -3], [3, 0]].forEach(([x, y]) => px(ctx, x, y, '#a6db7f'));
  } else if (v === 1) {
    pot(5, 8, 6, 6);
    rect(ctx, 7, -2, 2, 10, P.woodDark);
    [[2, -10], [8, -12], [3, -4], [9, -6], [5, -1]].forEach(([x, y], i) => {
      rect(ctx, x, y, 6, 5, i % 2 ? P.leaf : P.leafLight); px(ctx, x + 2, y + 2, P.leafDark);
    });
  } else if (v === 2) {
    pot(3, 6, 10, 8);
    rect(ctx, 2, -2, 12, 9, P.leafDark); rect(ctx, 3, -4, 10, 6, P.leaf);
    for (let i = 0; i < 5; i++) px(ctx, 4 + i * 2, -3 + (i % 2), P.leafLight);
    px(ctx, 5, -1, P.pink); px(ctx, 10, 0, P.yellow); px(ctx, 8, -3, P.pink);
  } else {
    // outdoor bush / flower bed
    rect(ctx, 0, -2, 16, 14, '#4f8f3a'); rect(ctx, 2, -5, 12, 6, '#5fa446');
    for (let i = 0; i < 5; i++) px(ctx, 2 + i * 3, -3 + (i % 2) * 6, v === 3 ? '#f7a8c4' : '#fff4b8');
    px(ctx, 6, 3, P.leafLight); px(ctx, 11, 0, P.leafLight);
  }
}

// ----------------------------------------------------------------- animation
export interface AnimEnv {
  t: number; // seconds
  occupied: (furnId: string) => Array<{ seatX: number; facing: string }>;
  meetingActive: boolean;
  hour: number;
}

export function drawAnim(ctx: Ctx, f: Furniture, env: AnimEnv) {
  const X = f.x * T, Y = f.y * T;
  const t = env.t;
  switch (f.type) {
    case 'desk': {
      const on = env.occupied(f.id).length > 0;
      screen(ctx, X + 18, Y - 8, 10, 7, on, t, hash(f.x, f.y));
      if ((f.variant ?? 0) === 3) screen(ctx, X + 5, Y - 9, 6, 9, on, t + 3, hash(f.y, f.x));
      break;
    }
    case 'sharedTable': {
      const occ = env.occupied(f.id);
      for (let k = 0; k < 4; k++) {
        const cx = X + k * 32 + 24;
        const on = occ.some((o) => o.facing === 'up' && Math.abs(o.seatX - cx) < 6);
        screen(ctx, cx - 5, Y + 7, 10, 7, on, t + k, hash(k, f.y));
        const back = occ.some((o) => o.facing === 'down' && Math.abs(o.seatX - cx) < 6);
        if (back) { ctx.fillStyle = 'rgba(140,200,255,0.35)'; ctx.fillRect(cx - 7, Y - 10, 14, 2); }
      }
      break;
    }
    case 'coffeeMachine': {
      for (let i = 0; i < 3; i++) {
        const p = (t * 0.6 + i / 3) % 1;
        ctx.fillStyle = `rgba(255,255,255,${0.55 * (1 - p)})`;
        ctx.fillRect(Math.round(X + 7 + Math.sin(p * 6 + i) * 1.5), Math.round(Y - 4 - p * 10), 2, 2);
      }
      break;
    }
    case 'fireplace': {
      const cols = ['#ff9a3c', '#ffcf5a', '#ff6b3c', '#fff1a8'];
      for (let i = 0; i < 10; i++) {
        const h = 3 + Math.abs(Math.sin(t * 7 + i * 1.7)) * 6;
        const x = X + 8 + i * 1.6;
        ctx.fillStyle = cols[i % 4];
        ctx.fillRect(Math.round(x), Math.round(Y + 30 - h), 2, Math.round(h));
      }
      glow(ctx, X + 16, Y + 26, 36 + Math.sin(t * 5) * 2, 'rgba(255,160,60,0.16)');
      break;
    }
    case 'arcade': {
      const c = CODE_COLORS[Math.floor(t * 3 + (f.variant ?? 0) * 2) % CODE_COLORS.length];
      ctx.fillStyle = c; ctx.fillRect(X + 4, Y - 3, 8, 7);
      ctx.fillStyle = '#141420';
      const bx = X + 4 + Math.floor((Math.sin(t * 2.3) * 0.5 + 0.5) * 6);
      const by = Y - 3 + Math.floor((Math.cos(t * 1.7) * 0.5 + 0.5) * 5);
      ctx.fillRect(bx, by, 2, 2);
      glow(ctx, X + 8, Y, 14, 'rgba(160,120,255,0.12)');
      break;
    }
    case 'tvStand': {
      // a tiny platformer playing on the TV
      const x0 = X + 8, y0 = Y - 14, w = 48, h = 19;
      ctx.save();
      ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
      ctx.fillStyle = '#7ec8f0'; ctx.fillRect(x0, y0, w, h);
      ctx.fillStyle = '#5fa446'; ctx.fillRect(x0, y0 + h - 4, w, 4);
      const scroll = Math.floor(t * 12) % 16;
      ctx.fillStyle = '#e0b252';
      for (let i = -1; i < 4; i++) ctx.fillRect(x0 + i * 16 - scroll + 8, y0 + h - 9, 5, 5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x0 + ((Math.floor(t * 5) * 7) % (w - 6)), y0 + 3, 6, 2);
      ctx.fillStyle = P.red;
      const jump = Math.max(0, Math.sin(t * 4)) * 6;
      ctx.fillRect(x0 + 14, Math.round(y0 + h - 8 - jump), 3, 4);
      ctx.restore();
      break;
    }
    case 'serverRack': {
      for (let y = -8, r = 0; y < f.h * T - 2; y += 4, r++) {
        for (let i = 0; i < 3; i++) {
          const on = hash(Math.floor(t * 4 + r * 3 + i * 5), f.x + i, r) > 0.45;
          ctx.fillStyle = on ? (i === 0 ? P.green : i === 1 ? '#5ad1ff' : P.orange) : '#3a3d47';
          ctx.fillRect(X + 3 + i * 3, Y + y + 1, 1, 1);
        }
      }
      break;
    }
    case 'vending': {
      if (Math.floor(t * 2) % 2) { ctx.fillStyle = P.yellow; ctx.fillRect(X + 13, Y - 6, 2, 1); }
      glow(ctx, X + 7, Y + 4, 14, 'rgba(180,230,255,0.10)');
      break;
    }
    case 'lamp': glow(ctx, X + 8, Y - 10, 34, 'rgba(255,214,140,0.18)'); break;
    case 'lampPost': {
      const night = env.hour >= 18 || env.hour < 7;
      if (night) glow(ctx, X + 8, Y - 24, 48, 'rgba(255,220,150,0.28)');
      break;
    }
    case 'fountain': {
      // arcing jets from the top spout and rings on the water
      for (let i = 0; i < 12; i++) {
        const p = (t * 0.9 + i / 12) % 1;
        const side = i % 2 ? 1 : -1;
        const dx = side * (2 + p * 13), dy = -8 - Math.sin(p * Math.PI) * 9 + p * 22;
        ctx.fillStyle = `rgba(220,245,255,${0.9 - p * 0.5})`;
        ctx.fillRect(Math.round(X + 24 + dx), Math.round(Y + dy), 1, 2);
      }
      ctx.fillStyle = 'rgba(230,248,255,0.5)';
      for (let k = 0; k < 2; k++) {
        const r = ((t * 0.5 + k / 2) % 1) * 14;
        ctx.fillRect(Math.round(X + 24 - 6 - r), Math.round(Y + 30 + k * 4), 2, 1);
        ctx.fillRect(Math.round(X + 24 + 5 + r), Math.round(Y + 30 + k * 4), 2, 1);
      }
      break;
    }
    case 'window': {
      const sky = skyColor(env.hour);
      ctx.fillStyle = sky; ctx.fillRect(X + 2, Y + 3, 13, 23); ctx.fillRect(X + 17, Y + 3, 13, 23);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      const cx = X + 2 + ((t * 2 + f.x * 7) % 34) - 6;
      for (const [dx, dy, w] of [[0, 6, 6], [2, 5, 3], [14, 14, 5]] as const) {
        const xx = cx + dx;
        const left = Math.max(X + 2, xx), right = Math.min(X + 30, xx + w);
        if (right > left && !(left < X + 17 && right > X + 15)) ctx.fillRect(left, Y + dy, right - left, 2);
      }
      ctx.fillStyle = '#6b4a3a'; ctx.fillRect(X + 15, Y + 3, 2, 23);
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(X + 4, Y + 5, 1, 4); ctx.fillRect(X + 19, Y + 5, 1, 4);
      break;
    }
    case 'clock': {
      const d = new Date();
      const cx = X + 8, cy = Y + 9;
      const hand = (ang: number, len: number, col: string) => {
        ctx.fillStyle = col;
        for (let i = 0; i <= len; i++) ctx.fillRect(Math.round(cx + Math.sin(ang) * i - 0.5), Math.round(cy - Math.cos(ang) * i - 0.5), 1, 1);
      };
      hand(((d.getHours() % 12) + d.getMinutes() / 60) * (Math.PI / 6), 2, P.outline);
      hand(d.getMinutes() * (Math.PI / 30), 3, '#7a4a2a');
      break;
    }
    case 'wallTv': {
      const x0 = X + 4, y0 = Y + 3, w = f.w * T - 8, h = f.h * T - 10;
      if (env.meetingActive) {
        ctx.fillStyle = '#20304a'; ctx.fillRect(x0, y0, w, h);
        for (let i = 0; i < 4; i++) {
          ctx.fillStyle = ['#5b8fd9', '#6cc070', '#f0a04b', '#9b6bd1'][i];
          ctx.fillRect(x0 + 3 + (i % 2) * 28, y0 + 3 + Math.floor(i / 2) * 9, 26, 7);
        }
        if (Math.floor(t * 2) % 2) { ctx.fillStyle = P.red; ctx.fillRect(x0 + w - 6, y0 + 1, 3, 2); }
      } else {
        ctx.fillStyle = '#142033'; ctx.fillRect(x0, y0, w, h);
        ctx.fillStyle = 'rgba(127,219,202,0.6)';
        ctx.fillRect(x0 + 6, y0 + 8, 6 + Math.floor((Math.sin(t) * 0.5 + 0.5) * 40), 2);
      }
      break;
    }
    case 'sign': {
      ctx.fillStyle = env.meetingActive ? (Math.floor(t * 1.5) % 2 ? '#ff5a5a' : '#d93f3f') : '#4fb36a';
      ctx.fillRect(X + 4, Y - 5, 8, 3);
      if (env.meetingActive) glow(ctx, X + 8, Y - 4, 12, 'rgba(255,80,80,0.2)');
      break;
    }
  }
}

function screen(ctx: Ctx, x: number, y: number, w: number, h: number, on: boolean, t: number, seed: number) {
  if (!on) {
    ctx.fillStyle = P.screenBg; ctx.fillRect(x, y, w, h);
    // drifting screensaver pixel
    const sx = x + Math.floor((Math.sin(t * 0.7 + seed * 10) * 0.5 + 0.5) * (w - 1));
    const sy = y + Math.floor((Math.cos(t * 0.9 + seed * 7) * 0.5 + 0.5) * (h - 1));
    ctx.fillStyle = 'rgba(127,219,202,0.6)'; ctx.fillRect(sx, sy, 1, 1);
    return;
  }
  ctx.fillStyle = '#1b2433'; ctx.fillRect(x, y, w, h);
  const scroll = Math.floor(t * 2);
  for (let r = 0; r < h - 1; r++) {
    const line = r + scroll;
    const indent = Math.floor(hash(line, seed * 100) * 3);
    const len = 2 + Math.floor(hash(seed * 50, line) * (w - 3 - indent));
    ctx.fillStyle = CODE_COLORS[Math.floor(hash(line, 3, seed * 9) * CODE_COLORS.length)];
    ctx.fillRect(x + 1 + indent, y + r + 0.5, Math.min(len, w - 2 - indent), 1);
  }
  if (Math.floor(t * 2.5) % 2) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x + w - 3, y + h - 2, 1, 1); }
  glow(ctx, x + w / 2, y + h / 2 + 4, 14, 'rgba(120,180,255,0.10)');
}

function glow(ctx: Ctx, x: number, y: number, r: number, color: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

export function skyColor(hour: number) {
  if (hour >= 7 && hour < 17) return '#9fd3f0';
  if (hour >= 17 && hour < 19) return '#f4a76b';
  if (hour >= 5 && hour < 7) return '#f6c99b';
  return '#2a3560';
}

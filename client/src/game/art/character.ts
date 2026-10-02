// Procedurally painted, palette-swappable villager-style characters.
import type { Avatar, Dir } from '../../../../shared/protocol';
import { makeCanvas, mix, outline, rect, shade, type Ctx } from '../pixel';

export const FW = 16;
export const FH = 22;
const Y0 = 2;
/** Columns in each direction row: walk0..3, sit0, sit1, blink */
export const COL = { walk: 0, sit: 4, blink: 6 } as const;
const COLS = 7;
const ROWS: Dir[] = ['down', 'up', 'right', 'left'];

const sheets = new Map<string, HTMLCanvasElement>();
export const avatarKey = (a: Avatar) => `${a.skin}${a.hair}${a.hairStyle}${a.shirt}${a.pants}`;

export function getSheet(a: Avatar): HTMLCanvasElement {
  const key = avatarKey(a);
  let s = sheets.get(key);
  if (s) return s;
  const [c, ctx] = makeCanvas(FW * COLS, FH * ROWS.length);
  ROWS.forEach((dir, r) => {
    for (let col = 0; col < COLS; col++) {
      ctx.save();
      if (dir === 'left') {
        ctx.translate(col * FW + FW, r * FH);
        ctx.scale(-1, 1);
      } else ctx.translate(col * FW, r * FH);
      paintFrame(ctx, a, dir === 'left' ? 'right' : dir, col);
      ctx.restore();
    }
  });
  outline(c, '#2b1d16');
  sheets.set(key, c);
  return c;
}

export function frameRect(dir: Dir, col: number) {
  return { sx: col * FW, sy: ROWS.indexOf(dir) * FH };
}

type Pal = ReturnType<typeof palette>;
function palette(a: Avatar) {
  return {
    skin: a.skin, skinD: shade(a.skin, -0.15), blush: mix(a.skin, '#ff6b6b', 0.35),
    hair: a.hair, hairL: shade(a.hair, 0.25), hairD: shade(a.hair, -0.2),
    shirt: a.shirt, shirtD: shade(a.shirt, -0.22), shirtL: shade(a.shirt, 0.18),
    pants: a.pants, pantsD: shade(a.pants, -0.25), shoe: '#3a2a22', eye: '#2b1d16',
  };
}

function paintFrame(ctx: Ctx, a: Avatar, dir: 'down' | 'up' | 'right', col: number) {
  const p = palette(a);
  const sitting = col === 4 || col === 5;
  const step = col === 1 ? 1 : col === 3 ? -1 : 0; // walk phase
  const blink = col === 6;
  const R = (x: number, y: number, w: number, h: number, c: string) => rect(ctx, x, Y0 + y, w, h, c);

  if (dir === 'down') {
    if (a.hairStyle === 'long') R(3, 4, 10, 8, p.hairD);
    // head
    R(5, 3, 6, 7, p.skin); R(4, 4, 8, 5, p.skin); R(5, 9, 6, 1, p.skinD);
    // hair
    hairTop(R, p, a.hairStyle, 'down');
    // face
    if (blink) { R(6, 7, 1, 1, p.eye); R(9, 7, 1, 1, p.eye); }
    else { R(6, 6, 1, 2, p.eye); R(9, 6, 1, 2, p.eye); }
    R(5, 8, 1, 1, p.blush); R(10, 8, 1, 1, p.blush);
    // body
    R(4, 10, 8, 5, p.shirt); R(4, 10, 1, 5, p.shirtD); R(11, 10, 1, 5, p.shirtD);
    R(7, 10, 2, 1, p.skinD); R(5, 11, 1, 1, p.shirtL);
    // arms
    const ls = sitting ? 0 : step, rs = sitting ? 0 : -step;
    R(3, 10, 1, 4 - Math.max(0, ls), p.shirtD); R(3, 14 - Math.max(0, ls), 1, 1, p.skin);
    R(12, 10, 1, 4 - Math.max(0, rs), p.shirtD); R(12, 14 - Math.max(0, rs), 1, 1, p.skin);
    // legs
    R(4, 15, 8, 1, p.pantsD);
    if (sitting) {
      R(4, 16, 8, 1, p.pants); R(4, 17, 3, 1, p.shoe); R(9, 17, 3, 1, p.shoe);
    } else {
      const lUp = step === 1 ? 1 : 0, rUp = step === -1 ? 1 : 0;
      R(4, 16, 3, 2 - lUp, p.pants); R(4, 18 - lUp, 3, 1, p.shoe);
      R(9, 16, 3, 2 - rUp, p.pants); R(9, 18 - rUp, 3, 1, p.shoe);
      R(7, 16, 2, 1, p.pants);
    }
    if (a.hairStyle === 'bun') R(6, -1, 4, 2, p.hair);
  } else if (dir === 'up') {
    R(5, 3, 6, 7, p.skin); R(4, 4, 8, 5, p.skin);
    // body
    R(4, 10, 8, 5, p.shirt); R(4, 10, 1, 5, p.shirtD); R(11, 10, 1, 5, p.shirtD); R(7, 11, 2, 3, p.shirtD);
    if (sitting) {
      // typing: forearms reach forward, alternating
      const tA = col === 4;
      R(3, 10, 1, 3, p.shirtD); R(12, 10, 1, 3, p.shirtD);
      R(3, tA ? 9 : 10, 1, 1, p.skin); R(12, tA ? 10 : 9, 1, 1, p.skin);
      R(4, 15, 8, 1, p.pantsD);
    } else {
      R(3, 10, 1, 4 - Math.max(0, -step), p.shirtD); R(3, 14 - Math.max(0, -step), 1, 1, p.skin);
      R(12, 10, 1, 4 - Math.max(0, step), p.shirtD); R(12, 14 - Math.max(0, step), 1, 1, p.skin);
      R(4, 15, 8, 1, p.pantsD);
      const lUp = step === -1 ? 1 : 0, rUp = step === 1 ? 1 : 0;
      R(4, 16, 3, 2 - lUp, p.pants); R(4, 18 - lUp, 3, 1, p.shoe);
      R(9, 16, 3, 2 - rUp, p.pants); R(9, 18 - rUp, 3, 1, p.shoe);
      R(7, 16, 2, 1, p.pants);
    }
    // back of head
    R(5, 0, 6, 1, p.hair); R(4, 1, 8, 1, p.hair); R(3, 2, 10, 6, p.hair); R(4, 8, 8, 1, p.hair);
    R(5, 2, 2, 1, p.hairL); R(9, 4, 1, 2, p.hairD);
    if (a.hairStyle === 'long') R(4, 8, 8, 5, p.hair), R(4, 12, 8, 1, p.hairD);
    if (a.hairStyle === 'bun') R(6, -1, 4, 2, p.hair), R(7, -1, 1, 1, p.hairL);
    if (a.hairStyle === 'spiky') [4, 6, 9, 11].forEach((x) => R(x, -1, 1, 1, p.hair));
  } else {
    // facing right
    if (a.hairStyle === 'long') R(3, 4, 4, 9, p.hairD);
    R(5, 3, 7, 7, p.skin); R(12, 7, 1, 1, p.skin); R(5, 9, 6, 1, p.skinD);
    R(5, 0, 6, 1, p.hair); R(4, 1, 8, 1, p.hair); R(3, 2, 9, 2, p.hair);
    R(3, 4, 5, 1, p.hair); R(10, 4, 2, 1, p.hair); R(3, 5, 4, 3, p.hair); R(4, 8, 2, 1, p.hair);
    R(5, 1, 3, 1, p.hairL); R(7, 5, 1, 1, p.skinD); // ear
    if (a.hairStyle === 'bun') R(2, 1, 2, 3, p.hair);
    if (a.hairStyle === 'spiky') { R(3, 0, 1, 1, p.hair); R(5, -1, 1, 1, p.hair); R(8, -1, 1, 1, p.hair); R(2, 2, 1, 1, p.hair); }
    if (blink) R(10, 7, 1, 1, p.eye); else R(10, 6, 1, 2, p.eye);
    R(9, 8, 1, 1, p.blush);
    // body
    R(5, 10, 6, 5, p.shirt); R(5, 10, 1, 5, p.shirtD);
    R(5, 15, 6, 1, p.pantsD);
    if (sitting) {
      R(6, 15, 6, 1, p.pants); R(9, 16, 3, 1, p.pants); R(10, 17, 3, 1, p.shoe);
      R(8, 10, 2, 3, p.shirtD); R(10, 13, 1, 1, p.skin);
    } else {
      const sw = sitting ? 0 : step;
      R(7 + sw, 10, 2, 4, p.shirtD); R(7 + sw, 14, 2, 1, p.skin);
      if (step === 0) {
        R(6, 16, 4, 2, p.pants); R(6, 18, 5, 1, p.shoe);
      } else {
        R(5, 16, 6, 1, p.pants); R(4, 17, 2, 1, p.pants); R(9, 17, 2, 1, p.pants);
        R(3, 18, 3, 1, p.shoe); R(9, 18, 3, 1, p.shoe);
      }
    }
  }
}

function hairTop(R: (x: number, y: number, w: number, h: number, c: string) => void, p: Pal, style: Avatar['hairStyle'], _d: 'down') {
  R(5, 0, 6, 1, p.hair); R(4, 1, 8, 1, p.hair); R(3, 2, 10, 2, p.hair);
  R(3, 4, 2, 1, p.hair); R(8, 4, 5, 1, p.hair); R(3, 5, 1, 2, p.hair); R(12, 5, 1, 2, p.hair);
  R(5, 1, 2, 1, p.hairL); R(9, 2, 2, 1, p.hairL);
  if (style === 'spiky') { [4, 6, 9, 11].forEach((x) => R(x, -1, 1, 1, p.hair)); R(6, 4, 1, 1, p.hair); }
}

export const DEFAULT_AVATARS: Avatar[] = [
  { skin: '#f2c6a0', hair: '#5a3825', hairStyle: 'short', shirt: '#4f8a5b', pants: '#3b4a6b' },
  { skin: '#e0a979', hair: '#2b2b33', hairStyle: 'long', shirt: '#c25b7a', pants: '#3e3a52' },
  { skin: '#c68a5e', hair: '#1d1a1a', hairStyle: 'spiky', shirt: '#5b8fd9', pants: '#5a4636' },
  { skin: '#8d5a3b', hair: '#2b1d16', hairStyle: 'bun', shirt: '#f0a04b', pants: '#3b4a6b' },
  { skin: '#f7d7bd', hair: '#d9a54a', hairStyle: 'long', shirt: '#9b6bd1', pants: '#4a5a3b' },
  { skin: '#f2c6a0', hair: '#b4533a', hairStyle: 'short', shirt: '#e06a5f', pants: '#2f3a4f' },
];

export const SKIN_TONES = ['#f7d7bd', '#f2c6a0', '#e0a979', '#c68a5e', '#a86f48', '#8d5a3b', '#6b4430'];
export const HAIR_COLORS = ['#2b1d16', '#1d1a1a', '#5a3825', '#8a5a34', '#b4533a', '#d9a54a', '#e8dcc0', '#7a8fb8', '#d16b9b', '#5fa38a'];
export const CLOTH_COLORS = ['#4f8a5b', '#5b8fd9', '#c25b7a', '#f0a04b', '#9b6bd1', '#e06a5f', '#4fb3a9', '#f6d365', '#e9e4d8', '#3a3f4a', '#3b4a6b', '#5a4636', '#3e3a52', '#2f3a4f'];

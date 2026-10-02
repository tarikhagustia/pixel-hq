// Bakes floors, walls and flat decor into one static canvas.
import { TILE } from '../../../../shared/protocol';
import { MAP_H, MAP_W, type Floor, type OfficeMap } from '../map';
import { hash, makeCanvas, rect, px, shade, type Ctx } from '../pixel';
import { P } from './palette';
import { getSprite } from './furniture';

const T = TILE;

function paintFloor(ctx: Ctx, f: Floor, tx: number, ty: number) {
  const x = tx * T, y = ty * T;
  const n = (a: number, b = 0) => hash(tx, ty, a, b);
  switch (f) {
    case 'wood': case 'woodWarm': case 'lightWood': {
      const base = f === 'wood' ? '#c98d58' : f === 'woodWarm' ? '#b9774a' : '#ddb184';
      rect(ctx, x, y, T, T, base);
      for (let r = 0; r < 4; r++) {
        const py = y + r * 4;
        // subtle per-plank tint
        rect(ctx, x, py, T, 3, shade(base, (n(r) - 0.5) * 0.08));
        rect(ctx, x, py + 3, T, 1, shade(base, -0.18));
        const seam = Math.floor(hash(tx + r * 7, ty * 3 + r) * T);
        rect(ctx, x + seam, py, 1, 3, shade(base, -0.14));
        if (n(r, 9) > 0.8) px(ctx, x + Math.floor(n(r, 3) * 14) + 1, py + 1, shade(base, -0.1));
      }
      break;
    }
    case 'carpetBlue': {
      rect(ctx, x, y, T, T, '#5b6ea8');
      for (let i = 0; i < 16; i += 4) for (let j = 0; j < 16; j += 4) {
        if ((i + j + tx * 4 + ty * 4) % 8 === 0) px(ctx, x + i + 1, y + j + 1, '#6c80bb');
        else px(ctx, x + i + 2, y + j + 2, '#51639a');
      }
      break;
    }
    case 'carpetGreen': {
      rect(ctx, x, y, T, T, '#4f7f86');
      for (let k = 0; k < 6; k++) px(ctx, x + Math.floor(n(k) * 16), y + Math.floor(n(k, 1) * 16), k % 2 ? '#5d8f96' : '#467278');
      if ((tx + ty) % 4 === 0) { px(ctx, x + 8, y + 8, '#6aa0a6'); }
      break;
    }
    case 'checker': {
      const a = (tx + ty) % 2 === 0;
      rect(ctx, x, y, T, T, a ? '#ece3cc' : '#cdbd9c');
      rect(ctx, x, y + 15, T, 1, a ? '#ddd2b8' : '#bfae8c');
      if (n(1) > 0.7) px(ctx, x + 4 + Math.floor(n(2) * 8), y + 4 + Math.floor(n(3) * 8), a ? '#e2d7bd' : '#c3b292');
      break;
    }
    case 'stone': {
      rect(ctx, x, y, T, T, '#a59886');
      const off = ty % 2 ? 4 : 0;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const sx = x + ((i * 8 + off + j * 4) % 16), sy = y + j * 8;
        rect(ctx, sx, sy, 7, 7, shade('#bcb09d', (n(i, j) - 0.5) * 0.12));
        rect(ctx, sx, sy, 7, 1, '#c8bdab');
      }
      break;
    }
    case 'grass': {
      rect(ctx, x, y, T, T, '#6fae4f');
      for (let k = 0; k < 8; k++) {
        const gx = x + Math.floor(n(k) * 15), gy = y + Math.floor(n(k, 2) * 14) + 1;
        px(ctx, gx, gy, '#5b9a42'); px(ctx, gx, gy - 1, '#5b9a42');
      }
      if (n(5) > 0.82) { const fx = x + 3 + Math.floor(n(6) * 10), fy = y + 3 + Math.floor(n(7) * 10); px(ctx, fx, fy, n(8) > 0.5 ? '#fff4b8' : '#f7a8c4'); px(ctx, fx + 1, fy, '#f6d365'); }
      break;
    }
    case 'path': {
      rect(ctx, x, y, T, T, '#8fbd63');
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const sx = x + i * 8 + 1 + Math.floor(n(i, j) * 2), sy = y + j * 8 + 1;
        rect(ctx, sx, sy, 6, 6, '#d2b48c');
        rect(ctx, sx, sy + 5, 6, 1, '#b39470');
      }
      break;
    }
    default:
      rect(ctx, x, y, T, T, '#1d1714');
  }
}

export function paintStatic(map: OfficeMap): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(MAP_W * T, MAP_H * T);
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) paintFloor(ctx, map.floor[y][x], x, y);

  // flat floor decor (rugs, mats)
  for (const f of map.furniture) if (f.layer === 'floor') {
    const s = getSprite(f);
    ctx.drawImage(s.canvas, f.x * T - s.ox, f.y * T - s.oy);
  }

  const isWall = (x: number, y: number) => x < 0 || y < 0 || x >= MAP_W || y >= MAP_H || map.wall[y][x] !== 0;

  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    const w = map.wall[y][x];
    if (!w) continue;
    const X = x * T, Y = y * T;
    const glass = isGlassRoom(x, y);
    if (w === 2) {
      // wallpaper face with wainscot
      rect(ctx, X, Y, T, T, '#efdcb8');
      for (let i = 0; i < T; i += 4) rect(ctx, X + i, Y, 2, T, '#e6cfa6');
      if (map.wall[y + 1]?.[x] !== 2) {
        rect(ctx, X, Y + 6, T, 10, '#9c6b43');
        rect(ctx, X, Y + 6, T, 1, '#b8845a');
        for (let i = 0; i < T; i += 8) rect(ctx, X + i, Y + 7, 1, 7, '#875a37');
        rect(ctx, X, Y + 14, T, 2, '#6b4a2f');
      }
    } else if (w === 3) {
      // glass panel
      rect(ctx, X, Y, T, T, '#a7d3e0');
      rect(ctx, X, Y, T, 2, '#6b4a3a');
      rect(ctx, X, Y + 14, T, 2, '#6b4a3a');
      for (let i = 0; i < 5; i++) px(ctx, X + 3 + i, Y + 11 - i, '#d8f0f6');
      px(ctx, X + 10, Y + 5, '#d8f0f6'); px(ctx, X + 11, Y + 4, '#d8f0f6');
      if ((x - 20) % 3 === 0) rect(ctx, X, Y, 1, T, '#6b4a3a');
    } else {
      // cap
      const base = glass ? '#7a5644' : '#5a3d2e';
      rect(ctx, X, Y, T, T, base);
      rect(ctx, X + 2, Y + 2, T - 4, T - 4, shade(base, 0.12));
      if (!isWall(x, y - 1)) rect(ctx, X, Y, T, 2, P.outline);
      if (!isWall(x - 1, y)) rect(ctx, X, Y, 2, T, P.outline);
      if (!isWall(x + 1, y)) rect(ctx, X + T - 2, Y, 2, T, P.outline);
      if (!isWall(x, y + 1)) rect(ctx, X, Y + T - 2, T, 2, P.outline);
    }
  }

  // soft shadows under walls onto the floor
  ctx.fillStyle = 'rgba(40,20,10,0.18)';
  for (let y = 1; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
    if (map.wall[y][x] === 0 && map.wall[y - 1][x] !== 0 && map.floor[y][x] !== 'void') ctx.fillRect(x * T, y * T, T, 4);
    if (map.wall[y][x] === 0 && x > 0 && map.wall[y][x - 1] !== 0 && map.floor[y][x] !== 'void') ctx.fillRect(x * T, y * T, 2, T);
  }

  // wall decor statics
  for (const f of map.furniture) if (f.layer === 'wall') {
    const s = getSprite(f);
    ctx.drawImage(s.canvas, f.x * T - s.ox, f.y * T - s.oy);
  }
  return canvas;
}

function isGlassRoom(x: number, y: number) {
  return (x === 20 || x === 31) && y >= 3 && y <= 13 || (y === 12 && x >= 20 && x <= 31);
}

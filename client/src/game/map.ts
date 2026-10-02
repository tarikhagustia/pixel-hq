// Office layout data. Everything is expressed in 16px tiles unless noted.
import { TILE, type Dir } from '../../../shared/protocol';

export const MAP_W = 46;
export const MAP_H = 32;

export type Floor =
  | 'void' | 'wood' | 'woodWarm' | 'carpetBlue' | 'checker' | 'stone' | 'carpetGreen' | 'lightWood' | 'grass' | 'path';
export type Wall = 0 | 1 | 2 | 3; // 0 none, 1 cap (top of wall), 2 face (wallpaper), 3 glass panel

export type FurnType =
  | 'desk' | 'chair' | 'sharedTable' | 'meetingTable' | 'sofa' | 'armchair' | 'coffeeTable' | 'rug' | 'plant'
  | 'bookshelf' | 'fireplace' | 'counter' | 'coffeeMachine' | 'microwave' | 'sink' | 'fridge' | 'waterCooler'
  | 'vending' | 'roundTable' | 'stool' | 'pingpong' | 'arcade' | 'foosball' | 'tvStand' | 'beanbag' | 'doormat'
  | 'coatRack' | 'bench' | 'serverRack' | 'printer' | 'whiteboard' | 'window' | 'clock' | 'poster' | 'wallTv'
  | 'lamp' | 'sign' | 'mugs' | 'boardStand';

export interface Furniture {
  id: string;
  type: FurnType;
  x: number; y: number; w: number; h: number; // footprint in tiles
  solid: boolean;
  facing?: Dir;
  variant?: number;
  /** 'floor' = baked under everything, 'wall' = baked on wall, 'obj' = y-sorted with characters */
  layer: 'floor' | 'wall' | 'obj';
  seat?: string; // seat id attached to this furniture (chairs etc.)
}

export type SeatKind = 'desk' | 'shared' | 'meeting' | 'sofa' | 'armchair' | 'stool' | 'beanbag' | 'bench';
export interface Seat {
  id: string;
  x: number; y: number; // world px — character feet position while seated
  facing: Dir;
  kind: SeatKind;
  label: string;
  screen?: string; // furniture id of the monitor this seat looks at
}

export interface Zone {
  id: string;
  name: string;
  icon: string;
  x: number; y: number; w: number; h: number;
}

export const ZONES: Zone[] = [
  { id: 'meeting', name: 'Meeting Room', icon: '🪑', x: 21, y: 3, w: 10, h: 9 },
  { id: 'dev', name: 'Dev Area', icon: '🧑‍💻', x: 1, y: 3, w: 19, h: 14 },
  { id: 'lounge', name: 'Lounge', icon: '🛋️', x: 32, y: 3, w: 13, h: 11 },
  { id: 'shared', name: 'Shared Workstations', icon: '🖥️', x: 1, y: 17, w: 14, h: 11 },
  { id: 'coffee', name: 'Coffee Bar', icon: '☕', x: 15, y: 14, w: 15, h: 8 },
  { id: 'entrance', name: 'Entrance', icon: '🚪', x: 15, y: 22, w: 15, h: 6 },
  { id: 'rec', name: 'Game Corner', icon: '🎮', x: 30, y: 14, w: 15, h: 14 },
  { id: 'outside', name: 'Garden Path', icon: '🌿', x: 0, y: 28, w: 46, h: 4 },
];

export const DOOR = { x: 22, y: 28, w: 2 }; // front door gap in the bottom wall
export const MEETING_DOOR = { x: 25, y: 12, w: 2 };
export const SPAWN = { x: (DOOR.x + 1) * TILE, y: 26 * TILE + 8 };

export interface OfficeMap {
  floor: Floor[][];
  wall: Wall[][];
  furniture: Furniture[];
  seats: Seat[];
  solid: Uint8Array; // MAP_W * MAP_H
}

export function buildMap(): OfficeMap {
  const floor: Floor[][] = Array.from({ length: MAP_H }, () => Array<Floor>(MAP_W).fill('void'));
  const wall: Wall[][] = Array.from({ length: MAP_H }, () => Array<Wall>(MAP_W).fill(0));
  const furniture: Furniture[] = [];
  const seats: Seat[] = [];
  let fid = 0;

  const fillFloor = (x: number, y: number, w: number, h: number, f: Floor) => {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (floor[j]?.[i] !== undefined) floor[j][i] = f;
  };
  const add = (type: FurnType, x: number, y: number, w: number, h: number, opts: Partial<Furniture> = {}) => {
    const f: Furniture = { id: `${type}-${fid++}`, type, x, y, w, h, solid: true, layer: 'obj', ...opts };
    furniture.push(f);
    return f;
  };
  const seat = (
    id: string, tx: number, ty: number, facing: Dir, kind: SeatKind, label: string,
    chair: FurnType | null = 'chair', variant = 0, screen?: string,
  ) => {
    // seat feet position = centre of tile (tx, ty), nudged towards the bottom
    const s: Seat = { id, x: tx * TILE + TILE / 2, y: ty * TILE + 12, facing, kind, label, screen };
    seats.push(s);
    if (chair) add(chair, tx, ty, 1, 1, { solid: false, facing, variant, seat: id });
    return s;
  };

  // ---------------------------------------------------------------- floors
  fillFloor(1, 3, 19, 14, 'wood'); // dev
  fillFloor(20, 3, 12, 11, 'wood'); // around meeting room
  fillFloor(21, 3, 10, 9, 'carpetBlue'); // meeting
  fillFloor(32, 3, 13, 11, 'woodWarm'); // lounge
  fillFloor(1, 17, 14, 11, 'lightWood'); // shared
  fillFloor(15, 14, 15, 8, 'checker'); // coffee
  fillFloor(15, 22, 15, 6, 'stone'); // entrance
  fillFloor(30, 14, 15, 14, 'carpetGreen'); // rec
  fillFloor(0, 29, MAP_W, 3, 'grass');
  fillFloor(DOOR.x, 28, 2, 4, 'path');
  fillFloor(DOOR.x - 1, 30, 4, 2, 'path');

  // ---------------------------------------------------------------- walls
  for (let x = 0; x < MAP_W; x++) { wall[0][x] = 1; wall[1][x] = 2; wall[2][x] = 2; }
  for (let y = 0; y <= 28; y++) { wall[y][0] = 1; wall[y][MAP_W - 1] = 1; }
  for (let x = 0; x < MAP_W; x++) if (x < DOOR.x || x >= DOOR.x + DOOR.w) wall[28][x] = 1;
  // meeting room: glass walls
  for (let y = 3; y <= 13; y++) { wall[y][20] = 1; wall[y][31] = 1; }
  for (let x = 20; x <= 31; x++) {
    if (x >= MEETING_DOOR.x && x < MEETING_DOOR.x + MEETING_DOOR.w) continue;
    wall[12][x] = 1;
    wall[13][x] = 3;
  }
  wall[13][20] = 1; wall[13][31] = 1;
  floor[12][MEETING_DOOR.x] = floor[12][MEETING_DOOR.x + 1] = 'carpetBlue';
  floor[13][MEETING_DOOR.x] = floor[13][MEETING_DOOR.x + 1] = 'carpetBlue';

  // ---------------------------------------------------------------- wall decor
  const wallDeco = (type: FurnType, x: number, w: number, variant = 0, y = 1, h = 2) =>
    add(type, x, y, w, h, { layer: 'wall', solid: false, variant });
  [3, 8, 13, 17].forEach((x) => wallDeco('window', x, 2));
  wallDeco('poster', 6, 1, 0);
  wallDeco('poster', 11, 1, 1);
  wallDeco('clock', 15, 1);
  wallDeco('whiteboard', 22, 3);
  wallDeco('wallTv', 26, 4);
  wallDeco('window', 33, 2);
  wallDeco('window', 43, 2);
  wallDeco('poster', 2, 1, 2, 1);

  // ---------------------------------------------------------------- dev area: 12 personal desks
  const deskCols = [2, 6, 10, 14];
  const deskRows = [5, 9, 13];
  let deskN = 1;
  deskRows.forEach((dy, r) => {
    deskCols.forEach((dx, c) => {
      const d = add('desk', dx, dy, 2, 1, { variant: (r * 4 + c) % 6 });
      // chair sits under the right half of the desk so the monitor is centred above the character
      seat(`desk-${deskN}`, dx + 1, dy + 1, 'up', 'desk', `Desk ${deskN}`, 'chair', 0, d.id);
      deskN++;
    });
  });
  add('plant', 1, 3, 1, 1, { variant: 1 });
  add('plant', 18, 3, 1, 1, { variant: 0 });
  add('plant', 18, 15, 1, 1, { variant: 2 });
  add('lamp', 1, 15, 1, 1);
  add('printer', 18, 9, 1, 1);
  add('bookshelf', 18, 11, 1, 2, { variant: 1 });

  // ---------------------------------------------------------------- shared workstations
  const tables = [19, 24];
  tables.forEach((ty, ti) => {
    const t = add('sharedTable', 2, ty, 8, 2, { variant: ti });
    for (let k = 0; k < 4; k++) {
      const sx = 2 + k * 2 + 1;
      seat(`shared-${ti}-n${k}`, sx, ty - 1, 'down', 'shared', `Workstation ${ti * 8 + k + 1}`, 'chair', 0, t.id);
      seat(`shared-${ti}-s${k}`, sx, ty + 2, 'up', 'shared', `Workstation ${ti * 8 + k + 5}`, 'chair', 0, t.id);
    }
  });
  add('serverRack', 12, 18, 1, 2);
  add('serverRack', 13, 18, 1, 2, { variant: 1 });
  add('boardStand', 12, 23, 2, 1);
  add('plant', 13, 26, 1, 1, { variant: 1 });
  add('plant', 1, 17, 1, 1, { variant: 2 });
  add('plant', 11, 26, 1, 1, { variant: 0 });

  // ---------------------------------------------------------------- meeting room
  add('meetingTable', 23, 6, 6, 3);
  [24, 26, 27].forEach((x, i) => seat(`meet-n${i}`, x, 5, 'down', 'meeting', 'Meeting chair'));
  [24, 25, 27].forEach((x, i) => seat(`meet-s${i}`, x, 9, 'up', 'meeting', 'Meeting chair'));
  seat('meet-w', 22, 7, 'right', 'meeting', 'Meeting chair');
  seat('meet-e', 29, 7, 'left', 'meeting', 'Meeting chair');
  add('plant', 21, 3, 1, 1, { variant: 0 });
  add('plant', 30, 3, 1, 1, { variant: 1 });
  add('plant', 30, 10, 1, 1, { variant: 2 });
  add('plant', 21, 10, 1, 1, { variant: 0 });
  add('sign', 24, 14, 1, 1, { solid: false, layer: 'obj' });

  // ---------------------------------------------------------------- lounge
  add('rug', 33, 5, 8, 6, { layer: 'floor', solid: false, variant: 0 });
  add('bookshelf', 41, 2, 2, 2, { variant: 0 });
  add('fireplace', 37, 2, 2, 2);
  add('sofa', 34, 5, 3, 1, { facing: 'down' });
  add('sofa', 34, 10, 3, 1, { facing: 'up' });
  ['a', 'b', 'c'].forEach((s, i) => seats.push({ id: `sofa-n-${s}`, x: (34 + i) * TILE + 8, y: 5 * TILE + 13, facing: 'down', kind: 'sofa', label: 'Sofa' }));
  ['a', 'b', 'c'].forEach((s, i) => seats.push({ id: `sofa-s-${s}`, x: (34 + i) * TILE + 8, y: 10 * TILE + 13, facing: 'up', kind: 'sofa', label: 'Sofa' }));
  add('coffeeTable', 34, 7, 3, 2);
  seat('arm-w', 32, 8, 'right', 'armchair', 'Armchair', 'armchair');
  seat('arm-e', 38, 8, 'left', 'armchair', 'Armchair', 'armchair');
  add('plant', 32, 3, 1, 1, { variant: 1 });
  add('plant', 44, 3, 1, 1, { variant: 2 });
  add('plant', 44, 12, 1, 1, { variant: 0 });
  add('lamp', 39, 5, 1, 1);
  add('beanbag', 42, 8, 1, 1, { solid: false, variant: 2, seat: 'bean-l1' });
  seats.push({ id: 'bean-l1', x: 42 * TILE + 8, y: 8 * TILE + 12, facing: 'left', kind: 'beanbag', label: 'Bean bag' });

  // ---------------------------------------------------------------- coffee bar
  add('counter', 16, 15, 6, 1);
  add('coffeeMachine', 16, 15, 1, 1, { solid: false });
  add('mugs', 17, 15, 1, 1, { solid: false });
  add('microwave', 19, 15, 1, 1, { solid: false });
  add('sink', 20, 15, 1, 1, { solid: false });
  add('fridge', 22, 14, 1, 2);
  add('waterCooler', 23, 15, 1, 1);
  add('vending', 28, 14, 1, 2);
  add('roundTable', 18, 18, 1, 1);
  seat('stool-1', 17, 18, 'right', 'stool', 'Stool', 'stool');
  seat('stool-2', 19, 18, 'left', 'stool', 'Stool', 'stool');
  add('roundTable', 24, 18, 1, 1, { variant: 1 });
  seat('stool-3', 23, 18, 'right', 'stool', 'Stool', 'stool');
  seat('stool-4', 25, 18, 'left', 'stool', 'Stool', 'stool');
  add('plant', 15, 20, 1, 1, { variant: 1 });
  add('plant', 29, 20, 1, 1, { variant: 0 });

  // ---------------------------------------------------------------- entrance
  add('rug', 19, 23, 8, 4, { layer: 'floor', solid: false, variant: 1 });
  add('doormat', DOOR.x, 27, 2, 1, { layer: 'floor', solid: false });
  add('plant', 20, 27, 1, 1, { variant: 1 });
  add('plant', 25, 27, 1, 1, { variant: 1 });
  add('coatRack', 16, 23, 1, 1);
  add('bench', 27, 24, 2, 1, { solid: false, seat: 'bench-1' });
  seats.push({ id: 'bench-1', x: 27 * TILE + 16, y: 24 * TILE + 12, facing: 'down', kind: 'bench', label: 'Bench' });
  add('plant', 15, 27, 1, 1, { variant: 2 });
  add('plant', 29, 27, 1, 1, { variant: 2 });

  // ---------------------------------------------------------------- game corner
  add('rug', 32, 22, 9, 5, { layer: 'floor', solid: false, variant: 2 });
  add('pingpong', 33, 16, 4, 2);
  add('arcade', 40, 14, 1, 2, { variant: 0 });
  add('arcade', 42, 14, 1, 2, { variant: 1 });
  add('foosball', 39, 18, 3, 2);
  add('tvStand', 34, 21, 4, 2);
  [33, 35, 37].forEach((x, i) => {
    add('beanbag', x, 25, 1, 1, { solid: false, variant: i, seat: `bean-${i}` });
    seats.push({ id: `bean-${i}`, x: x * TILE + 8, y: 25 * TILE + 12, facing: 'up', kind: 'beanbag', label: 'Bean bag' });
  });
  add('plant', 44, 15, 1, 1, { variant: 0 });
  add('plant', 44, 27, 1, 1, { variant: 1 });
  add('plant', 30, 27, 1, 1, { variant: 2 });
  add('lamp', 43, 22, 1, 1);

  // ---------------------------------------------------------------- outside decor
  for (let x = 2; x < MAP_W - 2; x += 3) {
    if (Math.abs(x - DOOR.x) < 3) continue;
    add('plant', x, 29, 1, 1, { variant: 3 + (x % 2) });
  }

  // ---------------------------------------------------------------- collision grid
  const solid = new Uint8Array(MAP_W * MAP_H);
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (wall[y][x] !== 0 || floor[y][x] === 'void') solid[y * MAP_W + x] = 1;
    }
  }
  for (const f of furniture) {
    if (!f.solid || f.layer !== 'obj') continue;
    for (let j = f.y; j < f.y + f.h; j++) for (let i = f.x; i < f.x + f.w; i++) if (j >= 0 && i >= 0) solid[j * MAP_W + i] = 1;
  }
  // outside edges
  for (let x = 0; x < MAP_W; x++) solid[(MAP_H - 1) * MAP_W + x] = 1;

  return { floor, wall, furniture, seats, solid };
}

export function zoneAt(px: number, py: number): Zone | undefined {
  const tx = Math.floor(px / TILE);
  const ty = Math.floor(py / TILE);
  return ZONES.find((z) => tx >= z.x && tx < z.x + z.w && ty >= z.y && ty < z.y + z.h);
}

export const zoneById = (id: string) => ZONES.find((z) => z.id === id);

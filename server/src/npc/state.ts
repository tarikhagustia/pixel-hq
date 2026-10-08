// Server-authoritative simulation for office NPCs: movement, desk schedules, and chat replies.
// Reuses the exact same map data (walls/seats/collision grid) that the client paints from, so
// NPCs can never clip through furniture and always end up sitting in a real seat.
import type { Dir, PlayerState } from '../../../shared/protocol';
import { TILE } from '../../../shared/protocol';
import { buildMap, MAP_W, MAP_H, zoneAt, zoneById, type Seat } from '../../../client/src/game/map';
import { ALL_NPCS, type NpcDef, type NpcKind } from './roster';
import { idleLine as _idleLine, reply, type ChatTurn } from './brain';

const map = buildMap();
const seatById = new Map(map.seats.map((s) => [s.id, s]));
const defById = new Map(ALL_NPCS.map((d) => [d.id, d]));

const WORKER_SPEED = 42; // px/s — deliberately slower than a real player's walk; calm office, not a footrace
const DOG_SPEED = 58;

const BREAK_SEATS = map.seats.filter((s) => (['stool', 'sofa', 'armchair', 'bench', 'beanbag'] as Seat['kind'][]).includes(s.kind));
const DESK_SEATS = map.seats.filter((s) => s.kind === 'desk' || s.kind === 'shared');
const DEV_ZONE = zoneById('dev');
const SHARED_ZONE = zoneById('shared');

function free(tx: number, ty: number) {
  return tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && !map.solid[ty * MAP_W + tx];
}

/** All walkable tiles outside the meeting room, precomputed once for Bit's wandering. */
const ROAM_TILES: Array<{ x: number; y: number }> = [];
for (let ty = 0; ty < MAP_H; ty++) {
  for (let tx = 0; tx < MAP_W; tx++) {
    if (!free(tx, ty)) continue;
    const wx = tx * TILE + 8, wy = ty * TILE + 8;
    if (zoneAt(wx, wy)?.id === 'meeting') continue;
    ROAM_TILES.push({ x: wx, y: wy });
  }
}

function randomPointInZone(zone: { x: number; y: number; w: number; h: number } | undefined) {
  if (!zone) return null;
  for (let i = 0; i < 20; i++) {
    const tx = zone.x + Math.floor(Math.random() * zone.w);
    const ty = zone.y + Math.floor(Math.random() * zone.h);
    if (free(tx, ty)) return { x: tx * TILE + 8, y: ty * TILE + 8 };
  }
  return null;
}

function bfsPath(fromX: number, fromY: number, toX: number, toY: number): Array<{ x: number; y: number }> | null {
  const sx = Math.floor(fromX / TILE), sy = Math.floor(fromY / TILE);
  const gx = Math.floor(toX / TILE), gy = Math.floor(toY / TILE);
  if (!free(gx, gy)) return null;
  const startIdx = sy * MAP_W + sx, targetIdx = gy * MAP_W + gx;
  if (startIdx === targetIdx) return [];
  const prev = new Int32Array(MAP_W * MAP_H).fill(-1);
  prev[startIdx] = startIdx;
  const q = [startIdx];
  while (q.length) {
    const cur = q.shift()!;
    if (cur === targetIdx) break;
    const cx = cur % MAP_W, cy = (cur / MAP_W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const ni = ny * MAP_W + nx;
      if (free(nx, ny) && prev[ni] === -1) { prev[ni] = cur; q.push(ni); }
    }
  }
  if (prev[targetIdx] === -1) return null;
  const tiles: number[] = [];
  for (let c = targetIdx; c !== prev[c]; c = prev[c]) tiles.push(c);
  tiles.reverse();
  return tiles.map((i) => ({ x: (i % MAP_W) * TILE + 8, y: ((i / MAP_W) | 0) * TILE + 12 }));
}

interface Live extends PlayerState {
  _path: Array<{ x: number; y: number }>;
  _walking: boolean;
  _dwellUntil: number;
  _pendingSeat: string | null;
  _pendingActivity: string;
  _speed: number;
  _dirty: boolean;
  _lastZone: string;
}

const npcs = new Map<string, Live>();
const dmHistory = new Map<string, ChatTurn[]>(); // key `${npcId}:${playerId}`

const WORKING_LINE = '💻 Coding';
const BREAK_LINE = '☕ Break';
const STRETCH_LINE = '🚶 Stretching legs';

function makeLive(def: NpcDef): Live {
  const base: PlayerState = {
    id: def.id, name: def.name, avatar: def.avatar,
    x: 0, y: 0, dir: 'down', moving: false, seat: null, ride: false,
    status: 'available', mic: false, cam: false, screen: false, speaking: false, inMeeting: false,
    zone: 'entrance', activity: '', isNpc: true, npcKind: def.kind,
  };
  return { ...base, _path: [], _walking: false, _dwellUntil: 0, _pendingSeat: null, _pendingActivity: '', _speed: WORKER_SPEED, _dirty: true, _lastZone: 'entrance' };
}

export function initNpcs() {
  npcs.clear();
  for (const def of ALL_NPCS) {
    const n = makeLive(def);
    if (def.kind === 'worker' && def.homeSeat) {
      const s = seatById.get(def.homeSeat)!;
      n.x = s.x; n.y = s.y; n.dir = s.facing; n.seat = def.homeSeat; n.activity = WORKING_LINE;
      n._dwellUntil = performance.now() + 15000 + Math.random() * 40000;
    } else if (def.kind === 'dog') {
      n.x = 36 * TILE; n.y = 9 * TILE; n.dir = 'down'; n.activity = '🐾 Patrolling';
      n._speed = DOG_SPEED; n._dwellUntil = performance.now() + 2000;
    } else if (def.kind === 'barista') {
      n.x = 18 * TILE + 8; n.y = 16 * TILE + 12; n.dir = 'up'; n.activity = '☕ Brewing';
      n._dwellUntil = performance.now() + 10000 + Math.random() * 10000;
    } else if (def.kind === 'duck') {
      const s = DESK_SEATS[Math.floor(Math.random() * DESK_SEATS.length)];
      n.x = s.x + 6; n.y = s.y - 6; n.dir = 'down'; n.activity = '🦆 Watching silently';
      n._dwellUntil = performance.now() + 180000 + Math.random() * 180000;
    }
    n.zone = zoneAt(n.x, n.y - 2)?.id ?? 'entrance';
    n._lastZone = n.zone;
    npcs.set(def.id, n);
  }
}

export function isNpc(id: string): boolean { return npcs.has(id); }
export function getNpcDef(id: string): NpcDef | undefined { return defById.get(id); }
export function npcPlayerStates(): PlayerState[] {
  return [...npcs.values()].map(({ _path, _walking, _dwellUntil, _pendingSeat, _pendingActivity, _speed, _dirty, _lastZone, ...p }) => p);
}

function allOccupiedSeats(excludeId: string, playerSeats: Set<string>): Set<string> {
  const occ = new Set(playerSeats);
  for (const o of npcs.values()) if (o.id !== excludeId && o.seat) occ.add(o.seat);
  return occ;
}

function pickFreeSeat(pool: Seat[], occ: Set<string>): Seat | null {
  const free = pool.filter((s) => !occ.has(s.id));
  if (!free.length) return null;
  return free[Math.floor(Math.random() * free.length)];
}

function walkTo(n: Live, tx: number, ty: number, pendingSeat: string | null, activity: string) {
  const path = bfsPath(n.x, n.y, tx, ty);
  n._pendingSeat = pendingSeat;
  n._pendingActivity = activity;
  if (!path || path.length === 0) { arrive(n); return; }
  n._path = path;
  n._walking = true;
  n.seat = null;
  n.moving = true;
  n._dirty = true;
}

function arrive(n: Live) {
  n._walking = false;
  n.moving = false;
  n._path = [];
  n.seat = n._pendingSeat;
  if (n._pendingSeat) {
    const s = seatById.get(n._pendingSeat);
    if (s) { n.x = s.x; n.y = s.y; n.dir = s.facing; }
  }
  if (n._pendingActivity && n._pendingActivity !== n.activity) n.activity = n._pendingActivity;
  n._dirty = true;
  scheduleDecision(n, 0); // dwell is set by decide() itself per-kind
  decide(n, performance.now());
}

function scheduleDecision(n: Live, ms: number) { n._dwellUntil = performance.now() + ms; }

function decide(n: Live, now: number, playerSeats: Set<string> = new Set()) {
  const def = defById.get(n.id)!;
  switch (def.kind) {
    case 'worker': return decideWorker(n, def, now, playerSeats);
    case 'dog': return decideDog(n, now);
    case 'barista': return decideBarista(n, now);
    case 'duck': return decideDuck(n, def, now, playerSeats);
  }
}

function decideWorker(n: Live, def: NpcDef, now: number, playerSeats: Set<string>) {
  const occ = allOccupiedSeats(n.id, playerSeats);
  const atHome = n.seat === def.homeSeat;
  if (!atHome) {
    // Prefer heading back to the desk; otherwise keep socialising.
    if (def.homeSeat && !occ.has(def.homeSeat) && Math.random() < 0.7) {
      const s = seatById.get(def.homeSeat)!;
      walkTo(n, s.x, s.y, def.homeSeat, WORKING_LINE);
      return;
    }
    const seat = pickFreeSeat(BREAK_SEATS, occ);
    if (seat) { walkTo(n, seat.x, seat.y, seat.id, BREAK_LINE); return; }
    const pt = randomPointInZone(DEV_ZONE) ?? randomPointInZone(SHARED_ZONE);
    if (pt) { walkTo(n, pt.x, pt.y, null, STRETCH_LINE); return; }
    scheduleDecision(n, 5000);
    return;
  }
  // At the desk: decide whether to keep working or take a break.
  const roll = Math.random();
  if (roll < 0.35) {
    const seat = pickFreeSeat(BREAK_SEATS, occ);
    if (seat) { walkTo(n, seat.x, seat.y, seat.id, BREAK_LINE); return; }
  } else if (roll < 0.55) {
    const pt = randomPointInZone(DEV_ZONE) ?? randomPointInZone(SHARED_ZONE);
    if (pt) { walkTo(n, pt.x, pt.y, null, STRETCH_LINE); return; }
  }
  n.activity = WORKING_LINE;
  scheduleDecision(n, 20000 + Math.random() * 45000);
}

function decideDog(n: Live, now: number) {
  if (Math.random() < 0.22) {
    n.activity = '😴 Napping';
    n.dir = 'down';
    scheduleDecision(n, 8000 + Math.random() * 12000);
    return;
  }
  const pt = ROAM_TILES[Math.floor(Math.random() * ROAM_TILES.length)];
  n.activity = '🐾 Patrolling';
  walkTo(n, pt.x, pt.y, null, '🐾 Patrolling');
}

function decideBarista(n: Live, now: number) {
  n.activity = '☕ Brewing';
  // small shuffle within the counter footprint so Beanie doesn't look frozen
  if (Math.random() < 0.5) {
    const bx = 17 * TILE + 8 + Math.floor(Math.random() * 3) * TILE;
    walkTo(n, bx, 16 * TILE + 12, null, '☕ Brewing');
  } else {
    scheduleDecision(n, 15000 + Math.random() * 20000);
  }
}

function decideDuck(n: Live, def: NpcDef, now: number, playerSeats: Set<string>) {
  const occ = allOccupiedSeats(n.id, playerSeats);
  const seat = pickFreeSeat(DESK_SEATS, occ);
  if (seat) { n.x = seat.x + 6; n.y = seat.y - 6; n._dirty = true; }
  n.activity = '🦆 Watching silently';
  scheduleDecision(n, 180000 + Math.random() * 180000);
}

/** Advance all NPCs by dt seconds. Call at the same cadence as the player movement tick. */
export function tickNpcs(dt: number, playerSeats: Set<string>) {
  const now = performance.now();
  const snapshot: Array<[string, number, number, Dir, 0 | 1, string | null, 0 | 1]> = [];
  const presence: Array<{ id: string; p: Partial<PlayerState> }> = [];

  for (const n of npcs.values()) {
    if (n._walking) {
      const wp = n._path[0];
      if (wp) {
        const dx = wp.x - n.x, dy = wp.y - n.y, d = Math.hypot(dx, dy);
        const step = n._speed * dt;
        if (d < Math.max(2, step)) {
          n.x = wp.x; n.y = wp.y;
          n._path.shift();
        } else {
          n.x += (dx / d) * step; n.y += (dy / d) * step;
          if (Math.abs(dx) > Math.abs(dy)) n.dir = dx > 0 ? 'right' : 'left';
          else n.dir = dy > 0 ? 'down' : 'up';
        }
        n._dirty = true;
      }
      if (!n._path.length) arrive(n);
    } else if (now >= n._dwellUntil) {
      decide(n, now, playerSeats);
    }

    const zone = zoneAt(n.x, n.y - 2)?.id ?? n.zone;
    if (zone !== n._lastZone) {
      n._lastZone = zone; n.zone = zone;
      presence.push({ id: n.id, p: { zone } });
    }

    if (n._dirty) {
      snapshot.push([n.id, Math.round(n.x * 10) / 10, Math.round(n.y * 10) / 10, n.dir, n.moving ? 1 : 0, n.seat, 0]);
      n._dirty = false;
    }
  }
  return { snapshot, presence };
}

/** A player sent a DM to an NPC — returns the NPC's reply text. */
export async function npcReplyTo(npcId: string, _playerId: string, playerText: string): Promise<string> {
  const def = defById.get(npcId);
  if (!def) return '...';
  const key = `${npcId}:${_playerId}`;
  const history = dmHistory.get(key) ?? [];
  history.push({ from: 'player', text: playerText });
  const text = await reply(def, playerText, history);
  history.push({ from: 'npc', text });
  dmHistory.set(key, history.slice(-12));
  return text;
}

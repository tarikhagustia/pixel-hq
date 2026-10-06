// The game loop: local movement & collision, remote interpolation, camera and rendering.
import { EMOTES, TILE, type Dir, type PlayerState } from '../../../shared/protocol';
import { send } from '../net/socket';
import { bubbles, local, persistPosition, remotes, type LiveBody } from '../state/live';
import { get, patchMe, persistProfile, set } from '../state/store';
import { COL, FH, FW, frameRect, getSheet } from './art/character';
import { AX, AY, getRideSprite } from './art/scooter';
import { drawAnim, getSprite, sortY, type AnimEnv } from './art/furniture';
import { paintStatic } from './art/tiles';
import { consume, endFrame, initInput, isDown } from './input';
import { buildMap, MAP_H, MAP_W, MEETING_DOOR, zoneAt, type OfficeMap, type Seat } from './map';
import { makeCanvas, outline, rect } from './pixel';
import { footstep, unlockAudio, type Surface } from './sfx';

const WALK = 78; // px / s
const RUN = 128;
const RIDE = 150; // on a scooter
const RIDE_BOOST = 205;
const SEND_HZ = 15;
const STEP_RADIUS = TILE * 7; // how far away other people's footsteps are audible
export const VOICE_RADIUS = TILE * 6;

interface Drawable { y: number; draw: () => void }

export class Engine {
  readonly map: OfficeMap = buildMap();
  private ctx: CanvasRenderingContext2D;
  private staticLayer: HTMLCanvasElement;
  private seatById = new Map<string, Seat>();
  private zoom = 3;
  private baseZoom = 3; // auto-fit zoom for this window; the user's zoom is an offset from it
  private wheelAcc = 0;
  private dpr = 1;
  private cam = { x: 0, y: 0 };
  private raf = 0;
  private last = 0;
  private sendAcc = 0;
  private lastSent = '';
  private posSaveAcc = 0;
  private path: Array<{ x: number; y: number }> = [];
  private pathSeat: string | null = null;
  private preSit: { x: number; y: number } | null = null;
  private cat = { x: 36 * TILE, y: 9 * TILE, tx: 36 * TILE, ty: 9 * TILE, dir: 1, napUntil: 0, frame: 0 };
  private catSprites: HTMLCanvasElement[];
  private lastStep = new Map<string, number>(); // body id -> last footstep index
  private rugs: OfficeMap['furniture'];
  private racks: OfficeMap['furniture'];
  private motes = Array.from({ length: 18 }, (_, i) => ({ x: Math.random(), y: Math.random(), s: 0.2 + Math.random() * 0.5, w: i }));

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.staticLayer = paintStatic(this.map);
    for (const s of this.map.seats) this.seatById.set(s.id, s);
    this.catSprites = [paintCat(0), paintCat(1), paintCat(2)];
    this.rugs = this.map.furniture.filter((f) => f.type === 'rug' || f.type === 'doormat');
    this.racks = this.map.furniture.filter((f) => f.type === 'scooterRack');
    initInput();
    window.addEventListener('keydown', unlockAudio);
    window.addEventListener('pointerdown', unlockAudio);
    canvas.addEventListener('click', this.onClick);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('resize', this.resize);
    window.addEventListener('pagehide', persistPosition);
    this.resize();
    this.cam.x = local.x; this.cam.y = local.y;
  }

  start() {
    this.last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.update(dt, now / 1000);
      this.render(now / 1000);
      endFrame();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('pagehide', persistPosition);
    this.canvas.removeEventListener('click', this.onClick);
    this.canvas.removeEventListener('wheel', this.onWheel);
  }

  // ------------------------------------------------------------ public actions
  /** Walk out of the meeting room and stand just outside its door. */
  leaveMeeting() {
    this.standUp();
    this.teleport((MEETING_DOOR.x + 1) * TILE, (MEETING_DOOR.y + 3) * TILE + 6, 'down');
  }

  teleport(x: number, y: number, dir: Dir = 'down') {
    local.x = x; local.y = y; local.dir = dir; this.path = [];
    this.flushMove(true);
  }

  emote(e: string) { send({ t: 'emote', e }); }

  goTo(playerId: string) {
    const r = remotes.get(playerId);
    if (r) this.walkTo(r.x, r.y + 10, null);
  }

  // ------------------------------------------------------------ update
  private update(dt: number, t: number) {
    const st = get();
    if (st.phase !== 'office') return;

    // emotes 1-8
    EMOTES.forEach((e, i) => { if (consume(String(i + 1))) this.emote(e); });

    let ix = 0, iy = 0;
    if (isDown('arrowleft', 'a')) ix -= 1;
    if (isDown('arrowright', 'd')) ix += 1;
    if (isDown('arrowup', 'w')) iy -= 1;
    if (isDown('arrowdown', 's')) iy += 1;
    if (ix || iy) this.path = [];

    // follow click-path
    if (!ix && !iy && this.path.length) {
      const wp = this.path[0];
      const dx = wp.x - local.x, dy = wp.y - local.y;
      const d = Math.hypot(dx, dy);
      if (d < 2) {
        this.path.shift();
        if (!this.path.length && this.pathSeat) { this.sit(this.pathSeat); this.pathSeat = null; }
      } else { ix = dx / d; iy = dy / d; }
    }

    const nearSeat = this.nearestFreeSeat();
    const nearRack = !local.seat && !local.ride && !nearSeat && this.nearRack();
    if (consume('e') || consume(' ')) {
      if (local.seat) this.standUp();
      else if (local.ride) this.setRide(false);
      else if (nearSeat) this.sit(nearSeat.id);
      else if (nearRack) this.setRide(true);
    }

    if ((ix || iy) && local.seat) this.standUp();

    const moving = !!(ix || iy) && !local.seat;
    if (moving) {
      const len = Math.hypot(ix, iy);
      const boost = isDown('shift');
      const sp = (local.ride ? (boost ? RIDE_BOOST : RIDE) : boost ? RUN : WALK) * dt;
      const vx = (ix / len) * sp, vy = (iy / len) * sp;
      if (Math.abs(ix) > Math.abs(iy) + 0.01) local.dir = ix > 0 ? 'right' : 'left';
      else if (iy) local.dir = iy > 0 ? 'down' : 'up';
      if (!this.collides(local.x + vx, local.y)) local.x += vx;
      if (!this.collides(local.x, local.y + vy)) local.y += vy;
      local.animT += local.ride ? 0 : dt * (boost ? 1.6 : 1);
    } else local.animT = 0;
    local.moving = moving;

    // hint text
    const hint = local.seat ? 'E — stand up'
      : local.ride ? 'E — hop off the scooter'
      : nearSeat ? `E — sit (${nearSeat.label})`
      : nearRack ? 'E — grab a scooter 🛴' : null;
    if (hint !== st.hint) set({ hint });

    // zone tracking (meeting room is a private audio space)
    const z = zoneAt(local.x, local.y - 2);
    if (z && z.id !== st.me.zone) {
      const inMeeting = z.id === 'meeting';
      patchMe({ zone: z.id, inMeeting });
      send({ t: 'presence', p: { zone: z.id, inMeeting } });
    }

    // periodically remember where we are, so a refresh can put us back here
    this.posSaveAcc += dt;
    if (this.posSaveAcc >= 2) { this.posSaveAcc = 0; persistPosition(); }

    // network
    this.sendAcc += dt;
    if (this.sendAcc >= 1 / SEND_HZ) { this.sendAcc = 0; this.flushMove(false); }

    // remotes: smooth towards target
    for (const r of remotes.values()) {
      const k = 1 - Math.pow(0.0001, dt); // frame-rate independent lerp
      r.x += (r.tx - r.x) * k;
      r.y += (r.ty - r.y) * k;
      r.animT = r.moving ? r.animT + dt : 0;
    }

    this.footsteps(st.players, st.me.zone);

    this.updateCat(dt, t);

    // camera
    const vw = this.canvas.width / this.zoom, vh = this.canvas.height / this.zoom;
    const tx = local.x, ty = local.y - 8;
    this.cam.x += (tx - this.cam.x) * Math.min(1, dt * 8);
    this.cam.y += (ty - this.cam.y) * Math.min(1, dt * 8);
    const mw = MAP_W * TILE, mh = MAP_H * TILE;
    this.cam.x = vw >= mw ? mw / 2 : Math.max(vw / 2, Math.min(mw - vw / 2, this.cam.x));
    this.cam.y = vh >= mh ? mh / 2 : Math.max(vh / 2, Math.min(mh - vh / 2, this.cam.y));
  }

  /** Play a footstep each time a walking body plants a foot (twice per 4-frame walk cycle). */
  private footsteps(players: Record<string, PlayerState>, myZone: string) {
    const vol = get().settings.sfxVolume;
    const bodies: Array<[string, LiveBody]> = [['self', local], ...remotes];
    for (const [id, b] of bodies) {
      if (!b.moving || b.ride) { this.lastStep.delete(id); continue; }
      const idx = Math.floor(b.animT * 4);
      if (this.lastStep.get(id) === idx) continue;
      this.lastStep.set(id, idx);
      if (id === 'self') { footstep(this.surfaceAt(b.x, b.y - 2), vol * 0.7); continue; }
      // others: fade with distance, and respect meeting-room isolation like voice does
      const p = players[id];
      if (!p || (p.zone === 'meeting') !== (myZone === 'meeting')) continue;
      const dx = b.x - local.x, d = Math.hypot(dx, b.y - local.y);
      if (d >= STEP_RADIUS) continue;
      const fall = 1 - d / STEP_RADIUS;
      footstep(this.surfaceAt(b.x, b.y - 2), vol * 0.5 * fall * fall, dx / STEP_RADIUS);
    }
    for (const id of this.lastStep.keys()) if (id !== 'self' && !remotes.has(id)) this.lastStep.delete(id);
  }

  private surfaceAt(px: number, py: number): Surface {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    if (this.rugs.some((f) => tx >= f.x && tx < f.x + f.w && ty >= f.y && ty < f.y + f.h)) return 'soft';
    switch (this.map.floor[ty]?.[tx]) {
      case 'wood': case 'woodWarm': case 'lightWood': return 'wood';
      case 'checker': case 'stone': case 'terracotta': return 'hard';
      case 'carpetBlue': case 'carpetGreen': return 'soft';
      case 'grass': return 'grass';
      case 'path': return 'gravel';
      default: return 'wood';
    }
  }

  private flushMove(force: boolean) {
    const key = `${local.x.toFixed(1)},${local.y.toFixed(1)},${local.dir},${local.moving},${local.seat},${local.ride}`;
    if (!force && key === this.lastSent) return;
    this.lastSent = key;
    send({ t: 'move', m: { x: local.x, y: local.y, dir: local.dir, moving: local.moving, seat: local.seat, ride: local.ride } });
  }

  private collides(x: number, y: number) {
    const pts = [[x - 5, y - 4], [x + 5, y - 4], [x - 5, y], [x + 5, y]];
    return pts.some(([px, py]) => this.solidAt(px, py));
  }
  private solidAt(px: number, py: number) {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return true;
    return this.map.solid[ty * MAP_W + tx] === 1;
  }

  private occupiedSeats() {
    const occ = new Set<string>();
    for (const r of remotes.values()) if (r.seat) occ.add(r.seat);
    return occ;
  }

  private nearestFreeSeat(): Seat | null {
    if (local.seat) return null;
    const occ = this.occupiedSeats();
    let best: Seat | null = null, bd = 20;
    for (const s of this.map.seats) {
      if (occ.has(s.id)) continue;
      const d = Math.hypot(s.x - local.x, s.y - local.y);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  private nearRack() {
    return this.racks.some((f) => Math.hypot(f.x * TILE + f.w * TILE / 2 - local.x, (f.y + 1) * TILE - local.y) < 28);
  }

  private setRide(on: boolean) {
    local.ride = on;
    this.flushMove(true);
  }

  private sit(id: string) {
    const s = this.seatById.get(id);
    if (!s || this.occupiedSeats().has(id)) return;
    this.preSit = { x: local.x, y: local.y };
    local.seat = id; local.ride = false; local.x = s.x; local.y = s.y; local.dir = s.facing; local.moving = false;
    this.flushMove(true);
    if (s.kind === 'desk' || s.kind === 'shared') {
      const st = get();
      if (st.me.status === 'available' && !sessionStorageFlag('sat-tip')) {
        // gentle tip, once per session
        import('../state/store').then(({ toast }) => toast('Tip: set your status to Busy to focus — proximity audio pauses.'));
      }
    }
  }

  private standUp() {
    if (!local.seat) return;
    const s = this.seatById.get(local.seat);
    local.seat = null;
    if (s && this.collides(local.x, local.y)) {
      const back = this.preSit && !this.collides(this.preSit.x, this.preSit.y) ? this.preSit : this.freeSpotNear(s.x, s.y);
      local.x = back.x; local.y = back.y;
    }
    this.preSit = null;
    this.flushMove(true);
  }

  private freeSpotNear(x: number, y: number) {
    for (let r = 4; r < 64; r += 4) for (let a = 0; a < 16; a++) {
      const px = x + Math.cos((a / 16) * Math.PI * 2) * r, py = y + Math.sin((a / 16) * Math.PI * 2) * r;
      if (!this.collides(px, py)) return { x: px, y: py };
    }
    return { x, y };
  }

  // ------------------------------------------------------------ click-to-walk
  private screenToWorld(cx: number, cy: number) {
    const rectB = this.canvas.getBoundingClientRect();
    const sx = (cx - rectB.left) * this.dpr, sy = (cy - rectB.top) * this.dpr;
    const { ox, oy } = this.viewOrigin();
    return { x: sx / this.zoom + ox, y: sy / this.zoom + oy };
  }

  private onClick = (e: MouseEvent) => {
    if (get().phase !== 'office') return;
    const w = this.screenToWorld(e.clientX, e.clientY);
    // clicked a person?
    const st = get();
    for (const [id, r] of remotes) {
      if (w.x > r.x - 8 && w.x < r.x + 8 && w.y > r.y - 22 && w.y < r.y + 2) {
        set({ selected: st.selected === id ? null : id });
        return;
      }
    }
    set({ selected: null });
    // clicked a seat?
    const seat = this.map.seats.find((s) => Math.abs(s.x - w.x) < 8 && w.y > s.y - 18 && w.y < s.y + 4);
    if (seat) { this.walkTo(seat.x, seat.y, seat.id); return; }
    this.walkTo(w.x, w.y, null);
  };

  private walkTo(x: number, y: number, seatId: string | null) {
    if (local.seat) this.standUp();
    const start = { tx: Math.floor(local.x / TILE), ty: Math.floor((local.y - 2) / TILE) };
    let goal = { tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) };
    const free = (tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < MAP_W && ty < MAP_H && !this.map.solid[ty * MAP_W + tx];
    if (seatId && !free(goal.tx, goal.ty)) {
      // seat on a solid piece (sofa): path to the tile in front of it
      const s = this.seatById.get(seatId)!;
      const off: Record<Dir, [number, number]> = { down: [0, 1], up: [0, -1], left: [-1, 0], right: [1, 0] };
      goal = { tx: goal.tx + off[s.facing][0], ty: goal.ty + off[s.facing][1] };
    }
    if (!free(goal.tx, goal.ty)) return;
    const prev = new Int32Array(MAP_W * MAP_H).fill(-1);
    const q = [start.ty * MAP_W + start.tx];
    prev[q[0]] = q[0];
    const target = goal.ty * MAP_W + goal.tx;
    while (q.length) {
      const cur = q.shift()!;
      if (cur === target) break;
      const cx = cur % MAP_W, cy = (cur / MAP_W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy, ni = ny * MAP_W + nx;
        if (free(nx, ny) && prev[ni] === -1) { prev[ni] = cur; q.push(ni); }
      }
    }
    if (prev[target] === -1) return;
    const tiles: number[] = [];
    for (let c = target; c !== prev[c]; c = prev[c]) tiles.push(c);
    tiles.reverse();
    this.path = tiles.map((i) => ({ x: (i % MAP_W) * TILE + 8, y: ((i / MAP_W) | 0) * TILE + 12 }));
    if (!seatId) this.path.push({ x, y: Math.max(y, (goal.ty * TILE) + 6) });
    this.pathSeat = seatId;
  }

  // ------------------------------------------------------------ cat
  private updateCat(dt: number, t: number) {
    const c = this.cat;
    if (t < c.napUntil) { c.frame = 2; return; }
    const dx = c.tx - c.x, dy = c.ty - c.y, d = Math.hypot(dx, dy);
    if (d < 1) {
      if (Math.random() < 0.3) c.napUntil = t + 6 + Math.random() * 10;
      const zx = 32 + Math.random() * 11, zy = 4 + Math.random() * 8;
      const tx = zx * TILE, ty = zy * TILE;
      if (!this.collides(tx, ty)) { c.tx = tx; c.ty = ty; }
      return;
    }
    const step = Math.min(d, 22 * dt);
    const nx = c.x + (dx / d) * step, ny = c.y + (dy / d) * step;
    if (this.solidAt(nx, ny)) { c.tx = c.x; c.ty = c.y; return; }
    c.x = nx; c.y = ny;
    c.dir = dx >= 0 ? 1 : -1;
    c.frame = Math.floor(t * 6) % 2;
  }

  // ------------------------------------------------------------ rendering
  private resize = () => {
    this.dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth, h = window.innerHeight;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    const target = Math.min(this.canvas.width / (TILE * 24), this.canvas.height / (TILE * 15));
    this.baseZoom = Math.max(2, Math.floor(target));
    this.applyZoom();
    this.ctx.imageSmoothingEnabled = false;
  };

  // zoom stays an integer number of device pixels per art pixel, so the pixel art stays crisp
  private zoomRange() { return { min: Math.max(1, Math.round(this.dpr)), max: Math.round(8 * this.dpr) }; }
  private applyZoom() {
    const { min, max } = this.zoomRange();
    this.zoom = Math.max(min, Math.min(max, this.baseZoom + get().settings.zoom));
  }

  /** Zoom in (+1) / out (-1) one step, or reset to the auto-fit level with 0. */
  zoomBy(step: number) {
    const { min, max } = this.zoomRange();
    const z = step === 0 ? this.baseZoom : Math.max(min, Math.min(max, this.zoom + step));
    set((s) => ({ settings: { ...s.settings, zoom: z - this.baseZoom } }));
    persistProfile();
    this.applyZoom();
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault(); // also swallows trackpad pinch (ctrl+wheel) so the page itself doesn't zoom
    this.wheelAcc += e.deltaY * (e.ctrlKey ? 4 : 1);
    if (Math.abs(this.wheelAcc) < 60) return;
    this.zoomBy(this.wheelAcc < 0 ? 1 : -1);
    this.wheelAcc = 0;
  };

  private viewOrigin() {
    const vw = this.canvas.width / this.zoom, vh = this.canvas.height / this.zoom;
    // snap to the device pixel grid to avoid shimmering
    const ox = Math.round((this.cam.x - vw / 2) * this.zoom) / this.zoom;
    const oy = Math.round((this.cam.y - vh / 2) * this.zoom) / this.zoom;
    return { ox, oy };
  }

  private render(t: number) {
    const ctx = this.ctx;
    const st = get();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1d1714';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    const { ox, oy } = this.viewOrigin();
    const Z = this.zoom;
    ctx.setTransform(Z, 0, 0, Z, -ox * Z, -oy * Z);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.staticLayer, 0, 0);

    const hour = new Date().getHours();
    const players = st.players;
    const meetingActive = Object.values(players).some((p) => p.inMeeting) || st.me.inMeeting;
    const occBySeat = new Map<string, true>();
    for (const r of remotes.values()) if (r.seat) occBySeat.set(r.seat, true);
    if (local.seat) occBySeat.set(local.seat, true);
    const env: AnimEnv = {
      t, hour, meetingActive,
      occupied: (fid) => this.map.seats.filter((s) => s.screen === fid && occBySeat.has(s.id)).map((s) => ({ seatX: s.x, facing: s.facing })),
    };

    // wall/floor animations
    for (const f of this.map.furniture) if (f.layer !== 'obj') drawAnim(ctx, f, env);

    this.drawLightBeams(ctx, t, hour);

    // proximity range ring
    if (st.settings.showRange && !st.me.inMeeting) {
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1 / Z * 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.ellipse(local.x, local.y - 2, VOICE_RADIUS, VOICE_RADIUS * 0.8, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }

    // y-sorted drawables
    const list: Drawable[] = [];
    for (const f of this.map.furniture) {
      if (f.layer !== 'obj') continue;
      const s = getSprite(f);
      list.push({ y: sortY(f), draw: () => { ctx.drawImage(s.canvas, f.x * TILE - s.ox, f.y * TILE - s.oy); drawAnim(ctx, f, env); } });
    }
    const voice = new Set(st.voicePeers);
    const selfState = { ...st.me, id: 'self' } as unknown as PlayerState;
    list.push({ y: local.y, draw: () => this.drawCharacter(ctx, local, selfState, t, false, true) });
    for (const [id, r] of remotes) {
      const p = players[id];
      if (p) list.push({ y: r.y, draw: () => this.drawCharacter(ctx, r, p, t, voice.has(id), false) });
    }
    const cat = this.cat;
    list.push({
      y: cat.y, draw: () => {
        const img = this.catSprites[cat.frame];
        ctx.save(); ctx.translate(Math.round(cat.x), Math.round(cat.y));
        if (cat.dir < 0) ctx.scale(-1, 1);
        ctx.fillStyle = 'rgba(30,15,10,0.25)'; ctx.fillRect(-5, -1, 10, 2);
        ctx.drawImage(img, -7, -11);
        ctx.restore();
        if (cat.frame === 2) { // zzz
          ctx.fillStyle = 'rgba(255,255,255,0.8)';
          const k = (t % 2) / 2;
          ctx.fillRect(Math.round(cat.x + 4 + k * 4), Math.round(cat.y - 12 - k * 6), 2, 1);
        }
      },
    });
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw();

    this.drawTint(ctx, hour);

    // --- screen-space overlay: names, mic icons, bubbles
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const toScreen = (x: number, y: number) => ({ x: (x - ox) * Z, y: (y - oy) * Z });
    const overlays: Array<() => void> = [];
    const label = (b: LiveBody, p: Partial<PlayerState> & { name: string }, id: string, isSelf: boolean) => {
      const sitOff = b.seat ? 2 : b.ride ? -2 : 0;
      const s = toScreen(b.x, b.y - 23 + sitOff);
      overlays.push(() => this.drawLabel(ctx, s.x, s.y, p, isSelf, voice.has(id), t, st.settings.showNames, st.selected === id));
      const bub = bubbles.get(id);
      if (bub) {
        if (performance.now() > bub.until) bubbles.delete(id);
        else overlays.push(() => this.drawBubble(ctx, s.x, s.y - 18 * this.dpr, bub.text, bub.kind, t, bub.until));
      }
    };
    label(local, st.me, 'self', true);
    for (const [id, r] of remotes) { const p = players[id]; if (p) label(r, p, id, false); }
    overlays.forEach((f) => f());
  }

  private drawCharacter(ctx: CanvasRenderingContext2D, b: LiveBody, p: PlayerState, t: number, linked: boolean, isSelf: boolean) {
    const sheet = getSheet(p.avatar);
    const x = Math.round(b.x), y = Math.round(b.y);
    // shadow
    ctx.fillStyle = 'rgba(30,15,10,0.28)';
    ctx.beginPath(); ctx.ellipse(x, y - 1, 6, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    if (linked || (isSelf && p.speaking)) {
      ctx.strokeStyle = p.speaking ? 'rgba(120,230,140,0.9)' : 'rgba(120,230,140,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(x, y - 1, 8, 3, 0, 0, Math.PI * 2); ctx.stroke();
    }
    if (p.inMeeting) {
      ctx.strokeStyle = 'rgba(176,132,255,0.8)';
      ctx.beginPath(); ctx.ellipse(x, y - 1, 9, 3.4, 0, 0, Math.PI * 2); ctx.stroke();
    }
    let col: number;
    let top = y - 20;
    const ride = b.ride && !b.seat ? getRideSprite(b.dir, p.avatar.shirt) : null;
    if (ride) {
      col = COL.walk; // standing on the deck
      top = y - 22;
    } else if (b.seat) {
      const typing = b.dir === 'up';
      col = COL.sit + (typing && Math.floor(t * 6 + x) % 2 ? 1 : 0);
      top = b.dir === 'up' ? y - 23 : y - 19;
      if (p.status === 'away') col = COL.sit;
    } else if (b.moving) {
      col = COL.walk + (Math.floor(b.animT * 8) % 4);
    } else {
      // idle: occasional blink
      col = (Math.floor(t * 10 + x * 0.37) % 40 === 0) && b.dir !== 'up' ? COL.blink : COL.walk;
    }
    const bob = b.moving && !ride && (col === 1 || col === 3) ? -1 : 0;
    const { sx, sy } = frameRect(b.dir, col);
    ctx.globalAlpha = p.status === 'away' ? 0.7 : 1;
    if (ride) {
      if (ride.frontFirst) ctx.drawImage(ride.front, x - AX, y - AY);
      ctx.drawImage(ride.back, x - AX, y - AY);
    }
    ctx.drawImage(sheet, sx, sy, FW, FH, x - 8, top + bob, FW, FH);
    if (ride && !ride.frontFirst) ctx.drawImage(ride.front, x - AX, y - AY);
    ctx.globalAlpha = 1;
  }

  private drawLabel(ctx: CanvasRenderingContext2D, x: number, y: number, p: Partial<PlayerState> & { name: string }, isSelf: boolean, linked: boolean, t: number, showNames: boolean, selected: boolean) {
    const d = this.dpr;
    const fs = Math.round(Math.max(11, Math.min(16, this.zoom * 3.6)) * d);
    ctx.font = `${fs}px "Pixelify Sans", "VT323", monospace`;
    const name = showNames || isSelf || selected ? p.name : '';
    const w = name ? ctx.measureText(name).width : 0;
    const dot = fs * 0.5;
    const padX = 6 * d;
    const bw = w + dot + padX * 2 + (name ? 4 * d : 0);
    const bh = fs + 6 * d;
    const bx = Math.round(x - bw / 2), by = Math.round(y - bh);
    ctx.fillStyle = selected ? 'rgba(255,233,168,0.95)' : isSelf ? 'rgba(60,40,30,0.82)' : 'rgba(30,22,18,0.72)';
    roundRect(ctx, bx, by, bw, bh, 4 * d); ctx.fill();
    if (p.speaking) { ctx.strokeStyle = '#7ee08a'; ctx.lineWidth = 2 * d; roundRect(ctx, bx, by, bw, bh, 4 * d); ctx.stroke(); }
    // status dot
    const sc = p.inMeeting ? '#b084ff' : p.status === 'busy' ? '#ef5b5b' : p.status === 'away' ? '#f3c24f' : '#5fd17a';
    ctx.fillStyle = sc;
    ctx.beginPath(); ctx.arc(bx + padX + dot / 2, by + bh / 2, dot / 2, 0, Math.PI * 2); ctx.fill();
    if (name) {
      ctx.fillStyle = selected ? '#3a2618' : '#fff6e5';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, bx + padX + dot + 4 * d, by + bh / 2 + d);
    }
    // mic state badge
    const ix = bx + bw + 3 * d, iy = by + bh / 2;
    if (p.mic === false) {
      drawMicOff(ctx, ix, iy - 6 * d, d);
    } else if (p.speaking) {
      ctx.fillStyle = '#7ee08a';
      for (let i = 0; i < 3; i++) {
        const h = (3 + Math.abs(Math.sin(t * 12 + i * 1.3)) * 7) * d;
        ctx.fillRect(ix + i * 3 * d, iy - h / 2, 2 * d, h);
      }
    } else if (linked) {
      ctx.fillStyle = 'rgba(126,224,138,0.7)';
      ctx.fillRect(ix, iy - 2 * d, 2 * d, 4 * d);
    }
  }

  private drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, kind: 'chat' | 'emote', t: number, until: number) {
    const d = this.dpr;
    const remain = until - performance.now();
    ctx.globalAlpha = Math.min(1, remain / 400);
    if (kind === 'emote') {
      const fs = 26 * d;
      ctx.font = `${fs}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      const hop = Math.abs(Math.sin(t * 6)) * 4 * d;
      ctx.fillText(text, x, y - hop);
      ctx.textAlign = 'left'; ctx.globalAlpha = 1;
      return;
    }
    const fs = Math.round(13 * d);
    ctx.font = `${fs}px "Pixelify Sans", "VT323", monospace`;
    const lines = wrap(ctx, text, 180 * d).slice(0, 4);
    const lh = fs + 3 * d;
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 14 * d;
    const h = lines.length * lh + 10 * d;
    const bx = Math.round(x - w / 2), by = Math.round(y - h);
    ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = '#4a3326'; ctx.lineWidth = 2 * d;
    roundRect(ctx, bx, by, w, h, 6 * d); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 5 * d, by + h - 1); ctx.lineTo(x, by + h + 6 * d); ctx.lineTo(x + 5 * d, by + h - 1); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillRect(x - 4 * d, by + h - 3 * d, 8 * d, 3 * d);
    ctx.fillStyle = '#3a2618'; ctx.textBaseline = 'top';
    lines.forEach((l, i) => ctx.fillText(l, bx + 7 * d, by + 6 * d + i * lh));
    ctx.globalAlpha = 1;
  }

  private drawLightBeams(ctx: CanvasRenderingContext2D, t: number, hour: number) {
    if (hour < 6 || hour >= 19) return;
    const warm = hour >= 16;
    ctx.fillStyle = warm ? 'rgba(255,190,120,0.10)' : 'rgba(255,245,200,0.11)';
    for (const f of this.map.furniture) {
      if (f.type !== 'window') continue;
      const x = f.x * TILE, y = (f.y + f.h) * TILE; // just below the wall it's set in
      ctx.beginPath();
      ctx.moveTo(x + 2, y); ctx.lineTo(x + 30, y); ctx.lineTo(x + 44, y + 52); ctx.lineTo(x + 14, y + 52); ctx.closePath();
      ctx.fill();
      // dust motes
      ctx.save();
      ctx.fillStyle = 'rgba(255,250,220,0.55)';
      for (const m of this.motes) {
        const my = ((m.y + t * 0.02 * m.s) % 1) * 48;
        const mx = 8 + m.x * 22 + my * 0.27 + Math.sin(t * m.s + m.w) * 2;
        if ((m.w + f.x) % 3 === 0) ctx.fillRect(Math.round(x + mx), Math.round(y + my), 1, 1);
      }
      ctx.restore();
    }
  }

  private drawTint(ctx: CanvasRenderingContext2D, hour: number) {
    let c: string | null = null;
    if (hour >= 19 || hour < 5) c = 'rgba(30,40,90,0.22)';
    else if (hour >= 17) c = 'rgba(255,140,60,0.08)';
    else if (hour < 7) c = 'rgba(255,170,120,0.08)';
    if (!c) return;
    ctx.fillStyle = c;
    ctx.fillRect(0, 0, MAP_W * TILE, MAP_H * TILE);
  }
}

// ------------------------------------------------------------ helpers
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, max: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > max && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines.map((l) => (ctx.measureText(l).width > max ? l.slice(0, 24) + '…' : l));
}

function drawMicOff(ctx: CanvasRenderingContext2D, x: number, y: number, d: number) {
  ctx.fillStyle = '#ef5b5b';
  roundRect(ctx, x, y, 12 * d, 12 * d, 3 * d); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillRect(x + 5 * d, y + 2 * d, 2 * d, 5 * d);
  ctx.fillRect(x + 3 * d, y + 7 * d, 6 * d, 1 * d);
  ctx.fillRect(x + 5.5 * d, y + 8 * d, 1 * d, 2 * d);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.2 * d;
  ctx.beginPath(); ctx.moveTo(x + 2.5 * d, y + 2.5 * d); ctx.lineTo(x + 9.5 * d, y + 9.5 * d); ctx.stroke();
}

function paintCat(frame: number) {
  const [c, ctx] = makeCanvas(14, 12);
  const o = '#e8a35a', d = '#c47f3c', w = '#fff3e0';
  if (frame === 2) {
    // curled up asleep
    rect(ctx, 2, 6, 10, 5, o); rect(ctx, 3, 5, 8, 1, o); rect(ctx, 9, 4, 4, 4, o);
    rect(ctx, 9, 3, 1, 1, o); rect(ctx, 12, 3, 1, 1, o); rect(ctx, 4, 7, 5, 1, d); rect(ctx, 2, 10, 6, 1, w);
    rect(ctx, 10, 6, 2, 1, d);
  } else {
    rect(ctx, 2, 5, 8, 4, o); rect(ctx, 3, 6, 6, 1, d);
    rect(ctx, 9, 2, 4, 4, o); rect(ctx, 9, 1, 1, 1, o); rect(ctx, 12, 1, 1, 1, o); rect(ctx, 11, 3, 1, 1, '#2b1d16');
    rect(ctx, 0, frame ? 3 : 4, 2, 2, o); rect(ctx, 1, 5, 1, 1, o);
    const legs = frame ? [3, 8] : [4, 7];
    legs.forEach((lx) => rect(ctx, lx, 9, 1, 2, o));
    rect(ctx, 9, 5, 3, 1, w);
  }
  outline(c);
  return c;
}

function sessionStorageFlag(k: string) {
  try {
    if (sessionStorage.getItem(k)) return true;
    sessionStorage.setItem(k, '1');
  } catch { /* ignore */ }
  return false;
}

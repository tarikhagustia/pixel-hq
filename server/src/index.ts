import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { WebSocketServer, WebSocket } from 'ws';

config();
import {
  type Avatar, type ChatMessage, type ClientMsg, type PlayerState, type ServerMsg,
  type RTCIceServerLike, MAX_CHAT_LEN, MAX_NAME_LEN, NEARBY_CHAT_RADIUS, EMOTES,
} from '../../shared/protocol';

const PORT = Number(process.env.PORT ?? 3001);
const MAX_PLAYERS = Number(process.env.MAX_PLAYERS ?? 16);
const TICK_HZ = 15;
const HISTORY = 60;
const ICE_SERVERS: RTCIceServerLike[] = process.env.ICE_SERVERS
  ? JSON.parse(process.env.ICE_SERVERS)
  : [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];

// ---------------------------------------------------------------- static files
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_DIR = process.env.STATIC_DIR ?? path.resolve(__dirname, '../../client/dist');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, players: clients.size }));
    return;
  }
  const urlPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let file = path.normalize(path.join(STATIC_DIR, urlPath));
  if (!file.startsWith(STATIC_DIR)) { res.writeHead(403); res.end(); return; }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(STATIC_DIR, 'index.html');
  if (!fs.existsSync(file)) { res.writeHead(404); res.end('Client not built. Run `npm run build` or use `npm run dev`.'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

// ---------------------------------------------------------------- presence
interface Client {
  ws: WebSocket;
  id: string;
  state: PlayerState | null; // null until `join`
  dirty: boolean;
  alive: boolean;
  chatBucket: number;
}

const clients = new Map<string, Client>();
const history: ChatMessage[] = [];

const send = (c: Client, msg: ServerMsg) => {
  if (c.ws.readyState === WebSocket.OPEN) c.ws.send(JSON.stringify(msg));
};
const broadcast = (msg: ServerMsg, except?: string) => {
  const data = JSON.stringify(msg);
  for (const c of clients.values()) {
    if (c.state && c.id !== except && c.ws.readyState === WebSocket.OPEN) c.ws.send(data);
  }
};

const clean = (s: unknown, max: number) =>
  String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);

const HEX = /^#[0-9a-fA-F]{6}$/;
const sanitizeAvatar = (a: Partial<Avatar> | undefined): Avatar => ({
  skin: HEX.test(a?.skin ?? '') ? a!.skin! : '#f2c6a0',
  hair: HEX.test(a?.hair ?? '') ? a!.hair! : '#5a3825',
  hairStyle: (['short', 'long', 'bun', 'spiky'] as const).includes(a?.hairStyle as never) ? a!.hairStyle! : 'short',
  shirt: HEX.test(a?.shirt ?? '') ? a!.shirt! : '#4f8a5b',
  pants: HEX.test(a?.pants ?? '') ? a!.pants! : '#3b4a6b',
});
const num = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

/** Players inside the meeting room cannot "hear" players outside it and vice versa. */
const sameRoom = (a: PlayerState, b: PlayerState) => (a.zone === 'meeting') === (b.zone === 'meeting');

function handle(c: Client, msg: ClientMsg) {
  if (msg.t === 'ping') { send(c, { t: 'pong' }); return; }

  if (msg.t === 'join') {
    if (c.state) return;
    const joined = [...clients.values()].filter((o) => o.state).length;
    if (joined >= MAX_PLAYERS) { send(c, { t: 'error', message: 'Office is full.' }); c.ws.close(); return; }
    c.state = {
      id: c.id,
      name: clean(msg.name, MAX_NAME_LEN) || 'Guest',
      avatar: sanitizeAvatar(msg.avatar),
      x: num(msg.x, 0, 5000, 300), y: num(msg.y, 0, 5000, 300),
      dir: 'down', moving: false, seat: null, ride: false,
      status: 'available', mic: false, cam: false, screen: false, speaking: false, inMeeting: false, zone: 'entrance',
    };
    send(c, {
      t: 'welcome', selfId: c.id, iceServers: ICE_SERVERS, history,
      players: [...clients.values()].filter((o) => o.state && o.id !== c.id).map((o) => o.state!),
    });
    broadcast({ t: 'joined', player: c.state }, c.id);
    console.log(`[+] ${c.state.name} (${c.id}) — ${clients.size} connected`);
    return;
  }

  const s = c.state;
  if (!s) return;

  switch (msg.t) {
    case 'move': {
      const m = msg.m;
      s.x = num(m.x, 0, 5000, s.x);
      s.y = num(m.y, 0, 5000, s.y);
      if (['up', 'down', 'left', 'right'].includes(m.dir)) s.dir = m.dir;
      s.moving = !!m.moving;
      s.seat = typeof m.seat === 'string' ? m.seat.slice(0, 32) : null;
      s.ride = !!m.ride && !s.seat;
      c.dirty = true;
      break;
    }
    case 'presence': {
      const p = msg.p ?? {};
      const patch: Partial<PlayerState> = {};
      if (p.status && ['available', 'busy', 'away'].includes(p.status)) patch.status = p.status;
      for (const k of ['mic', 'cam', 'screen', 'speaking', 'inMeeting'] as const) {
        if (typeof p[k] === 'boolean') patch[k] = p[k];
      }
      if (typeof p.zone === 'string') patch.zone = p.zone.slice(0, 24);
      Object.assign(s, patch);
      broadcast({ t: 'presence', id: c.id, p: patch }, c.id);
      break;
    }
    case 'profile': {
      s.name = clean(msg.name, MAX_NAME_LEN) || s.name;
      s.avatar = sanitizeAvatar(msg.avatar);
      broadcast({ t: 'presence', id: c.id, p: { name: s.name, avatar: s.avatar } }, c.id);
      break;
    }
    case 'chat': {
      // token bucket: ~5 messages burst, refills 1/s
      if (c.chatBucket <= 0) { send(c, { t: 'error', message: 'Slow down a little!' }); return; }
      c.chatBucket--;
      const text = clean(msg.text, MAX_CHAT_LEN);
      if (!text) return;
      const out: ChatMessage = {
        id: crypto.randomUUID(), channel: msg.channel, from: c.id, fromName: s.name, text, ts: Date.now(),
      };
      if (msg.channel === 'global') {
        history.push(out);
        if (history.length > HISTORY) history.shift();
        broadcast({ t: 'chat', msg: out });
      } else if (msg.channel === 'nearby') {
        for (const o of clients.values()) {
          if (!o.state) continue;
          const d = Math.hypot(o.state.x - s.x, o.state.y - s.y);
          if (o.id === c.id || (d <= NEARBY_CHAT_RADIUS && sameRoom(s, o.state))) send(o, { t: 'chat', msg: out });
        }
      } else if (msg.channel === 'dm') {
        const target = msg.to ? clients.get(msg.to) : undefined;
        if (!target?.state) { send(c, { t: 'error', message: 'That person is no longer here.' }); return; }
        out.to = target.id;
        send(target, { t: 'chat', msg: out });
        send(c, { t: 'chat', msg: out });
      }
      break;
    }
    case 'emote': {
      if (EMOTES.includes(msg.e)) broadcast({ t: 'emote', id: c.id, e: msg.e });
      break;
    }
    case 'signal': {
      const target = clients.get(msg.to);
      if (target?.state) send(target, { t: 'signal', from: c.id, data: msg.data });
      break;
    }
  }
}

// ---------------------------------------------------------------- websocket
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 256 * 1024 });

wss.on('connection', (ws) => {
  const c: Client = { ws, id: crypto.randomBytes(5).toString('hex'), state: null, dirty: false, alive: true, chatBucket: 5 };
  clients.set(c.id, c);
  ws.on('pong', () => { c.alive = true; });
  ws.on('message', (raw) => {
    let msg: ClientMsg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg && typeof msg === 'object' && 't' in msg) handle(c, msg);
  });
  ws.on('close', () => {
    clients.delete(c.id);
    if (c.state) {
      broadcast({ t: 'left', id: c.id });
      console.log(`[-] ${c.state.name} (${c.id}) — ${clients.size} connected`);
    }
  });
});

// Movement snapshots: only players that moved since the last tick.
setInterval(() => {
  const s: Extract<ServerMsg, { t: 'snapshot' }>['s'] = [];
  for (const c of clients.values()) {
    if (c.state && c.dirty) {
      const p = c.state;
      s.push([p.id, Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, p.dir, p.moving ? 1 : 0, p.seat, p.ride ? 1 : 0]);
      c.dirty = false;
    }
  }
  if (s.length) broadcast({ t: 'snapshot', s });
}, 1000 / TICK_HZ);

// Chat rate-limit refill + heartbeat
setInterval(() => { for (const c of clients.values()) c.chatBucket = Math.min(5, c.chatBucket + 1); }, 1000);
setInterval(() => {
  for (const c of clients.values()) {
    if (!c.alive) { c.ws.terminate(); continue; }
    c.alive = false;
    c.ws.ping();
  }
}, 15000);

server.listen(PORT, () => console.log(`Pixel HQ server on http://localhost:${PORT} (ws: /ws)`));

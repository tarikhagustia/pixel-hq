// WebSocket connection: translates server messages into store/live updates.
import type { ClientMsg, RTCIceServerLike, ServerMsg, SignalData } from '../../../shared/protocol';
import { get, set, toast } from '../state/store';
import { addBubble, local, remotes } from '../state/live';

type SignalHandler = (from: string, data: SignalData) => void;

let ws: WebSocket | null = null;
let signalHandler: SignalHandler | null = null;
let pingTimer: number | undefined;
export let iceServers: RTCIceServerLike[] = [];

export function onSignal(h: SignalHandler) { signalHandler = h; }

export function send(msg: ClientMsg) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

export function connect(): Promise<void> {
  return new Promise((resolve, reject) => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = (import.meta.env.VITE_WS_URL as string | undefined) ?? `${proto}://${location.host}/ws`;
    ws = new WebSocket(url);
    let welcomed = false;

    ws.onopen = () => {
      const { me } = get();
      send({ t: 'join', name: me.name, avatar: me.avatar, x: local.x, y: local.y });
      pingTimer = window.setInterval(() => send({ t: 'ping' }), 20000);
    };
    ws.onerror = () => { if (!welcomed) reject(new Error('Could not reach the office server.')); };
    ws.onclose = () => {
      clearInterval(pingTimer);
      if (welcomed) {
        toast('Disconnected from the office — reconnecting…');
        remotes.clear();
        set({ players: {}, voicePeers: [] });
        setTimeout(() => connect().catch(() => toast('Still offline. Retrying…')), 2000);
      }
    };
    ws.onmessage = (ev) => {
      let msg: ServerMsg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.t === 'welcome') { welcomed = true; resolve(); }
      handle(msg);
    };
  });
}

function handle(msg: ServerMsg) {
  switch (msg.t) {
    case 'welcome': {
      iceServers = msg.iceServers;
      const players = Object.fromEntries(msg.players.map((p) => [p.id, p]));
      for (const p of msg.players) remotes.set(p.id, { x: p.x, y: p.y, tx: p.x, ty: p.y, dir: p.dir, moving: p.moving, seat: p.seat, animT: 0 });
      set({ selfId: msg.selfId, players, chat: msg.history, phase: 'office' });
      // re-announce presence (useful after reconnects)
      const { me } = get();
      send({ t: 'presence', p: { status: me.status, mic: me.mic, cam: me.cam, screen: me.screen, inMeeting: me.inMeeting, zone: me.zone } });
      send({ t: 'move', m: { x: local.x, y: local.y, dir: local.dir, moving: false, seat: local.seat } });
      break;
    }
    case 'joined': {
      const p = msg.player;
      remotes.set(p.id, { x: p.x, y: p.y, tx: p.x, ty: p.y, dir: p.dir, moving: p.moving, seat: p.seat, animT: 0 });
      set((s) => ({ players: { ...s.players, [p.id]: p } }));
      toast(`${p.name} walked into the office`);
      break;
    }
    case 'left': {
      const name = get().players[msg.id]?.name;
      remotes.delete(msg.id);
      set((s) => {
        const players = { ...s.players };
        delete players[msg.id];
        return { players, selected: s.selected === msg.id ? null : s.selected };
      });
      if (name) toast(`${name} headed home`);
      break;
    }
    case 'snapshot': {
      for (const [id, x, y, dir, moving, seat] of msg.s) {
        const r = remotes.get(id);
        if (!r) continue;
        r.tx = x; r.ty = y; r.dir = dir; r.moving = !!moving; r.seat = seat;
        // snap if we fell far behind (teleport / seat)
        if (Math.hypot(r.x - x, r.y - y) > 64) { r.x = x; r.y = y; }
      }
      break;
    }
    case 'presence': {
      set((s) => {
        const p = s.players[msg.id];
        if (!p) return s;
        return { players: { ...s.players, [msg.id]: { ...p, ...msg.p } } };
      });
      break;
    }
    case 'chat': {
      const m = msg.msg;
      const { selfId, ui } = get();
      const mine = m.from === selfId;
      if (m.channel === 'nearby') addBubble(mine ? 'self' : m.from, m.text);
      set((s) => {
        const unread = { ...s.unread, dm: { ...s.unread.dm } };
        const chatVisible = s.ui.chat;
        if (!mine) {
          if (m.channel === 'dm') {
            if (!(chatVisible && ui.tab === 'dm' && ui.dmWith === m.from)) unread.dm[m.from] = (unread.dm[m.from] ?? 0) + 1;
          } else if (!(chatVisible && ui.tab === m.channel)) unread[m.channel]++;
        }
        return { chat: [...s.chat, m].slice(-300), unread };
      });
      if (m.channel === 'dm' && !mine && !(ui.chat && ui.tab === 'dm' && ui.dmWith === m.from)) toast(`💌 ${m.fromName}: ${m.text.slice(0, 60)}`);
      break;
    }
    case 'emote': {
      addBubble(msg.id === get().selfId ? 'self' : msg.id, msg.e, 'emote');
      break;
    }
    case 'signal': signalHandler?.(msg.from, msg.data); break;
    case 'error': toast(msg.message); break;
  }
}

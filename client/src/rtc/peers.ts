// WebRTC mesh for proximity voice + meeting video.
//
// Every pair of players gets at most one RTCPeerConnection, opened only while they
// "should hear" each other (near each other, or both inside the meeting room).
// Each connection carries three fixed transceivers — 0: mic, 1: camera, 2: screen —
// so toggling camera/screen is just `replaceTrack`, with no renegotiation.
// The player with the lexicographically smaller id always makes the offer (no glare).
import type { PlayerState, SignalData } from '../../../shared/protocol';
import { iceServers, onSignal, send } from '../net/socket';
import { local, remotes } from '../state/live';
import { get, set, type Me } from '../state/store';
import { media } from './media';
import { VOICE_RADIUS } from '../game/engine';

const DISCONNECT_RADIUS = VOICE_RADIUS * 1.35;
const FULL_VOLUME_RADIUS = 40;

export interface RemoteMedia { cam?: MediaStream; screen?: MediaStream }

interface Peer {
  id: string;
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  media: RemoteMedia;
  pending: RTCIceCandidateInit[];
}

const peers = new Map<string, Peer>();
const cooldown = new Map<string, number>();
const listeners = new Set<() => void>();
let timer: number | undefined;

export const subscribeMedia = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
const bump = () => listeners.forEach((l) => l());
export const remoteMedia = (id: string): RemoteMedia => peers.get(id)?.media ?? {};

function localTrack(i: number) {
  return i === 0 ? media.audio : i === 1 ? media.cam : media.screen;
}

function distanceTo(id: string) {
  const r = remotes.get(id);
  return r ? Math.hypot(r.x - local.x, r.y - local.y) : Infinity;
}

function shouldConnect(me: Me, p: PlayerState, existing: boolean) {
  if (me.inMeeting && p.inMeeting) return true;
  if (me.inMeeting !== p.inMeeting) return false; // meeting room is acoustically private
  if (me.status !== 'available' || p.status !== 'available') return false; // busy/away pause proximity audio
  return distanceTo(p.id) < (existing ? DISCONNECT_RADIUS : VOICE_RADIUS);
}

function volumeFor(me: Me, p: PlayerState) {
  if (me.inMeeting && p.inMeeting) return 1;
  const d = distanceTo(p.id);
  if (d <= FULL_VOLUME_RADIUS) return 1;
  if (d >= VOICE_RADIUS) return Math.max(0, 0.15 * (1 - (d - VOICE_RADIUS) / (DISCONNECT_RADIUS - VOICE_RADIUS)));
  return 1 - ((d - FULL_VOLUME_RADIUS) / (VOICE_RADIUS - FULL_VOLUME_RADIUS)) * 0.85;
}

function createPeer(id: string): Peer {
  const pc = new RTCPeerConnection({ iceServers: iceServers as RTCIceServer[] });
  const audio = new Audio();
  audio.autoplay = true;
  const peer: Peer = { id, pc, audio, media: {}, pending: [] };
  peers.set(id, peer);

  pc.onicecandidate = (e) => { if (e.candidate) send({ t: 'signal', to: id, data: { kind: 'ice', candidate: e.candidate.toJSON() } }); };
  pc.ontrack = (e) => {
    const idx = pc.getTransceivers().indexOf(e.transceiver);
    const stream = new MediaStream([e.track]);
    if (idx === 0) { audio.srcObject = stream; audio.play().catch(() => {}); }
    else if (idx === 1) peer.media.cam = stream;
    else if (idx === 2) peer.media.screen = stream;
    bump();
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') closePeer(id, true, 4000);
    syncVoicePeers();
  };
  return peer;
}

async function startCall(id: string) {
  const peer = createPeer(id);
  const { pc } = peer;
  for (let i = 0; i < 3; i++) {
    const t = pc.addTransceiver(i === 0 ? 'audio' : 'video', { direction: 'sendrecv' });
    await t.sender.replaceTrack(localTrack(i));
  }
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  send({ t: 'signal', to: id, data: { kind: 'offer', sdp: offer.sdp! } });
}

function closePeer(id: string, notify: boolean, cool = 2500) {
  const p = peers.get(id);
  if (!p) return;
  peers.delete(id);
  cooldown.set(id, performance.now() + cool);
  try { p.pc.close(); } catch { /* ignore */ }
  p.audio.srcObject = null;
  if (notify) send({ t: 'signal', to: id, data: { kind: 'bye' } });
  syncVoicePeers();
  bump();
}

async function flushPending(p: Peer) {
  for (const c of p.pending.splice(0)) await p.pc.addIceCandidate(c).catch(() => {});
}

async function handleSignal(from: string, data: SignalData) {
  const st = get();
  try {
    if (data.kind === 'offer') {
      const p = st.players[from];
      if (!p || !shouldConnect(st.me, p, true)) { send({ t: 'signal', to: from, data: { kind: 'bye' } }); return; }
      if (peers.has(from)) closePeer(from, false, 0);
      const peer = createPeer(from);
      await peer.pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
      const ts = peer.pc.getTransceivers();
      for (let i = 0; i < ts.length; i++) {
        ts[i].direction = 'sendrecv';
        await ts[i].sender.replaceTrack(localTrack(i));
      }
      const answer = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(answer);
      send({ t: 'signal', to: from, data: { kind: 'answer', sdp: answer.sdp! } });
      await flushPending(peer);
    } else if (data.kind === 'answer') {
      const peer = peers.get(from);
      if (!peer || peer.pc.signalingState !== 'have-local-offer') return;
      await peer.pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
      await flushPending(peer);
    } else if (data.kind === 'ice') {
      const peer = peers.get(from);
      if (!peer) return;
      if (peer.pc.remoteDescription) await peer.pc.addIceCandidate(data.candidate as RTCIceCandidateInit).catch(() => {});
      else peer.pending.push(data.candidate as RTCIceCandidateInit);
    } else if (data.kind === 'bye') {
      closePeer(from, false, 3000);
    }
  } catch (err) {
    console.warn('signal error', err);
    closePeer(from, true, 4000);
  }
}

function syncVoicePeers() {
  const ids = [...peers.values()].filter((p) => p.pc.connectionState === 'connected').map((p) => p.id).sort();
  const cur = get().voicePeers;
  if (ids.join() !== cur.join()) set({ voicePeers: ids });
}

function tick() {
  const st = get();
  if (st.phase !== 'office' || !st.selfId) return;
  const now = performance.now();
  for (const p of Object.values(st.players)) {
    const peer = peers.get(p.id);
    const want = shouldConnect(st.me, p, !!peer);
    if (want && !peer && st.selfId < p.id && (cooldown.get(p.id) ?? 0) < now) {
      startCall(p.id).catch((e) => { console.warn(e); closePeer(p.id, true, 4000); });
    } else if (!want && peer) {
      closePeer(p.id, true);
    }
    if (peer) peer.audio.volume = Math.max(0, Math.min(1, volumeFor(st.me, p) * st.settings.volume));
  }
  for (const id of peers.keys()) if (!st.players[id]) closePeer(id, false);
  syncVoicePeers();
}

export function startRTC() {
  onSignal((from, data) => { void handleSignal(from, data); });
  media.onTrack((kind, track) => {
    const idx = kind === 'audio' ? 0 : kind === 'cam' ? 1 : 2;
    for (const p of peers.values()) {
      const t = p.pc.getTransceivers()[idx];
      t?.sender.replaceTrack(track).catch(() => {});
    }
  });
  clearInterval(timer);
  timer = window.setInterval(tick, 300);
}

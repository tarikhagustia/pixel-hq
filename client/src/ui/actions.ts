// UI-level actions shared by components (keeps components thin).
import type { Avatar, ChatChannel, Status } from '../../../shared/protocol';
import { connect, send } from '../net/socket';
import { media } from '../rtc/media';
import { startRTC } from '../rtc/peers';
import { get, patchMe, persistProfile, set } from '../state/store';
import type { Engine } from '../game/engine';
import { unlockAudio } from '../game/sfx';

let engine: Engine | null = null;
export const bindEngine = (e: Engine | null) => { engine = e; };
export const getEngine = () => engine;

/** Connect using whatever name/avatar is already in the store (manual join or restored from a refresh). */
export async function enterOffice(): Promise<void> {
  set({ phase: 'connecting' });
  try {
    startRTC();
    await connect();
    void media.initMic();
  } catch (err) {
    set({ phase: 'join' });
    throw err;
  }
}

export function setStatus(status: Status) {
  patchMe({ status });
  send({ t: 'presence', p: { status } });
}

export function toggleMic() { media.setMic(!get().me.mic); }
export function toggleCam() { void media.setCam(!get().me.cam); }
export function toggleMusic() {
  unlockAudio();
  set((s) => ({ settings: { ...s.settings, music: !s.settings.music } }));
  persistProfile();
}
export function toggleScreen() { void media.setScreen(!get().me.screen); }

export function leaveMeeting() {
  if (get().me.screen) void media.setScreen(false);
  engine?.leaveMeeting();
}

export function sendChat(channel: ChatChannel, text: string, to?: string) {
  const t = text.trim();
  if (!t) return;
  send({ t: 'chat', channel, text: t, to });
}

export function openDM(id: string) {
  set((s) => ({
    ui: { ...s.ui, chat: true, tab: 'dm', dmWith: id },
    unread: { ...s.unread, dm: { ...s.unread.dm, [id]: 0 } },
    selected: null,
  }));
}

export function updateProfile(name: string, avatar: Avatar) {
  patchMe({ name, avatar });
  persistProfile();
  if (get().phase === 'office') send({ t: 'profile', name, avatar });
}

export function emote(e: string) { engine?.emote(e); }
export function walkToPlayer(id: string) { engine?.goTo(id); set({ selected: null }); }

// Debug handle for automated tests: open the app with ?debug
if (typeof location !== 'undefined' && location.search.includes('debug')) {
  void Promise.all([import('../state/live'), import('../state/store')]).then(([live, store]) => {
    (window as unknown as Record<string, unknown>).__pixelhq = { live, store, engine: () => engine };
  });
}

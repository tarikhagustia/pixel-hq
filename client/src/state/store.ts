// UI-facing reactive state (React subscribes here). High-frequency motion lives in ./live.ts.
import { create } from 'zustand';
import type { Avatar, ChatMessage, PlayerState, Status } from '../../../shared/protocol';
import { DEFAULT_AVATARS } from '../game/art/character';

export type ChatTab = 'global' | 'nearby' | 'dm';

export interface Me {
  name: string;
  avatar: Avatar;
  status: Status;
  mic: boolean;
  cam: boolean;
  screen: boolean;
  speaking: boolean;
  inMeeting: boolean;
  zone: string;
}

export interface Settings {
  volume: number; // 0..1 master volume for other people
  micId: string;
  camId: string;
  showNames: boolean;
  showRange: boolean;
}

export interface Toast { id: number; text: string }

interface State {
  phase: 'join' | 'connecting' | 'office';
  selfId: string | null;
  me: Me;
  players: Record<string, PlayerState>;
  chat: ChatMessage[];
  unread: { global: number; nearby: number; dm: Record<string, number> };
  ui: { chat: boolean; people: boolean; settings: boolean; tab: ChatTab; dmWith: string | null; emotes: boolean };
  voicePeers: string[]; // ids of peers we currently have an audio link with
  selected: string | null; // clicked player
  hint: string | null;
  toasts: Toast[];
  settings: Settings;
  micAvailable: boolean;
}

const saved = (() => {
  try { return JSON.parse(localStorage.getItem('pixelhq:profile') ?? 'null') as Partial<Me & { settings: Settings }> | null; }
  catch { return null; }
})();

export const useStore = create<State>(() => ({
  phase: 'join',
  selfId: null,
  me: {
    name: saved?.name ?? '',
    avatar: saved?.avatar ?? DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)],
    status: 'available', mic: true, cam: false, screen: false, speaking: false, inMeeting: false, zone: 'entrance',
  },
  players: {},
  chat: [],
  unread: { global: 0, nearby: 0, dm: {} },
  ui: { chat: true, people: false, settings: false, tab: 'global', dmWith: null, emotes: false },
  voicePeers: [],
  selected: null,
  hint: null,
  toasts: [],
  settings: { volume: 1, micId: '', camId: '', showNames: true, showRange: true, ...(saved?.settings ?? {}) },
  micAvailable: false,
}));

export const set = useStore.setState;
export const get = useStore.getState;

export function persistProfile() {
  const { me, settings } = get();
  try { localStorage.setItem('pixelhq:profile', JSON.stringify({ name: me.name, avatar: me.avatar, settings })); } catch { /* private mode */ }
}

let toastId = 0;
export function toast(text: string) {
  const id = ++toastId;
  set((s) => ({ toasts: [...s.toasts, { id, text }].slice(-4) }));
  setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3500);
}

export function patchMe(p: Partial<Me>) {
  set((s) => ({ me: { ...s.me, ...p } }));
}

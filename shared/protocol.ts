// Shared wire protocol between client and server.
// Keep this file dependency-free so both sides can import it.

export type Dir = 'down' | 'up' | 'left' | 'right';
export type Status = 'available' | 'busy' | 'away';
export type HairStyle = 'short' | 'long' | 'bun' | 'spiky';

export interface Avatar {
  skin: string;
  hair: string;
  hairStyle: HairStyle;
  shirt: string;
  pants: string;
}

/** Fields that change every frame while moving — sent in compact snapshots. */
export interface Motion {
  x: number;
  y: number;
  dir: Dir;
  moving: boolean;
  seat: string | null;
  ride: boolean; // on a scooter
}

/** Slower-changing presence fields. */
export interface Presence {
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

export interface PlayerState extends Motion, Presence {
  id: string;
}

export type ChatChannel = 'global' | 'nearby' | 'dm';

export interface ChatMessage {
  id: string;
  channel: ChatChannel;
  from: string;
  fromName: string;
  to?: string;
  text: string;
  ts: number;
}

// ---------- client -> server ----------
export type ClientMsg =
  | { t: 'join'; name: string; avatar: Avatar; x: number; y: number }
  | { t: 'move'; m: Motion }
  | { t: 'presence'; p: Partial<Omit<Presence, 'name' | 'avatar'>> }
  | { t: 'profile'; name: string; avatar: Avatar }
  | { t: 'chat'; channel: ChatChannel; to?: string; text: string }
  | { t: 'signal'; to: string; data: SignalData }
  | { t: 'emote'; e: string }
  | { t: 'ping' };

// ---------- server -> client ----------
export type ServerMsg =
  | { t: 'welcome'; selfId: string; players: PlayerState[]; history: ChatMessage[]; iceServers: RTCIceServerLike[] }
  | { t: 'joined'; player: PlayerState }
  | { t: 'left'; id: string }
  | { t: 'snapshot'; s: Array<[string, number, number, Dir, 0 | 1, string | null, 0 | 1]> }
  | { t: 'presence'; id: string; p: Partial<Presence> }
  | { t: 'chat'; msg: ChatMessage }
  | { t: 'signal'; from: string; data: SignalData }
  | { t: 'emote'; id: string; e: string }
  | { t: 'error'; message: string }
  | { t: 'pong' };

export type SignalData =
  | { kind: 'offer'; sdp: string }
  | { kind: 'answer'; sdp: string }
  | { kind: 'ice'; candidate: RTCIceCandidateInitLike }
  | { kind: 'bye' };

export interface RTCIceServerLike {
  urls: string | string[];
  username?: string;
  credential?: string;
}
export interface RTCIceCandidateInitLike {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

// ---------- shared constants ----------
export const TILE = 16;
/** Radius (px, world space) for proximity chat delivery. */
export const NEARBY_CHAT_RADIUS = TILE * 6;
export const MAX_CHAT_LEN = 500;
export const MAX_NAME_LEN = 20;
export const EMOTES = ['👋', '👍', '❤️', '😂', '🎉', '☕', '🤔', '🔥'];

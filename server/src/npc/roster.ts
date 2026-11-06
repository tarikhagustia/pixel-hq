// The cast of office NPCs. Pure data — behavior lives in behavior.ts, dialogue in brain.ts.
import type { Avatar } from '../../../shared/protocol';

export type NpcKind = 'worker' | 'dog' | 'barista' | 'duck';

export interface NpcDef {
  id: string;
  name: string;
  kind: NpcKind;
  avatar: Avatar;
  personality: string; // one-line flavor used to pick/seed dialogue; the AI hook can use this as a system prompt later
  /** Desk seat this worker "belongs to" when sitting down to work. Workers only. */
  homeSeat?: string;
}

// Avatars reuse the exact same palette-swappable character sheet as real players —
// just different skin/hair/shirt/pants combos so each NPC reads as a distinct person.
// (Previously had 10 generic desk-worker NPCs with identical work/break behavior,
// just different names/avatars — trimmed down to the 3 NPCs with actually distinct
// sprites and behavior: the dog, the barista, and the rubber duck.)

export const BIT: NpcDef = {
  id: 'npc-bit', name: '(NPC) Bit', kind: 'dog', personality: 'Office corgi. Good boy. Occasionally files bug reports by barking at monitors.',
  avatar: { skin: '#e8a35a', hair: '#c47f3c', hairStyle: 'short', shirt: '#e8a35a', pants: '#e8a35a' },
};

export const BEANIE: NpcDef = {
  id: 'npc-beanie', name: '(NPC) Beanie', kind: 'barista', personality: 'Café barista, suspiciously calm, speaks fluent coffee pun.',
  avatar: { skin: '#f2c6a0', hair: '#2b2b33', hairStyle: 'short', shirt: '#9c6b43', pants: '#5a4636' },
};

export const QUACKY: NpcDef = {
  id: 'npc-quacky', name: '(NPC) Quacky', kind: 'duck', personality: 'A rubber duck. Debugging companion. Mostly silent, occasionally profound.',
  avatar: { skin: '#f6d365', hair: '#f6d365', hairStyle: 'short', shirt: '#f6d365', pants: '#e0a050' },
};

export const ALL_NPCS: NpcDef[] = [BIT, BEANIE, QUACKY];

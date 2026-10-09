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
export const WORKERS: NpcDef[] = [
  { id: 'npc-dina', name: '(NPC) Dina', kind: 'worker', homeSeat: 'desk-1', personality: 'Chipper frontend dev, way too into CSS animations.',
    avatar: { skin: '#f2c6a0', hair: '#b4533a', hairStyle: 'long', shirt: '#4fb3a9', pants: '#3b4a6b' } },
  { id: 'npc-raka', name: '(NPC) Raka', kind: 'worker', homeSeat: 'desk-2', personality: 'Backend dev, deadpan, blames everything on cache.',
    avatar: { skin: '#c68a5e', hair: '#1d1a1a', hairStyle: 'short', shirt: '#3a3f4a', pants: '#2f3a4f' } },
  { id: 'npc-sari', name: '(NPC) Sari', kind: 'worker', homeSeat: 'desk-5', personality: 'QA lead, finds bugs for sport, slightly too enthusiastic about edge cases.',
    avatar: { skin: '#f7d7bd', hair: '#2b2b33', hairStyle: 'bun', shirt: '#c25b7a', pants: '#3e3a52' } },
  { id: 'npc-budi', name: '(NPC) Budi', kind: 'worker', homeSeat: 'desk-6', personality: 'DevOps, always "just restarting something", suspicious of Mondays.',
    avatar: { skin: '#8d5a3b', hair: '#2b1d16', hairStyle: 'spiky', shirt: '#5b8fd9', pants: '#5a4636' } },
  { id: 'npc-wulan', name: '(NPC) Wulan', kind: 'worker', homeSeat: 'desk-9', personality: 'Product manager, speaks exclusively in roadmaps and vibes.',
    avatar: { skin: '#e0a979', hair: '#d9a54a', hairStyle: 'long', shirt: '#9b6bd1', pants: '#4a5a3b' } },
  { id: 'npc-eko', name: '(NPC) Eko', kind: 'worker', homeSeat: 'desk-10', personality: 'Intern, visibly overwhelmed, drinks coffee like water.',
    avatar: { skin: '#f2c6a0', hair: '#5a3825', hairStyle: 'short', shirt: '#e06a5f', pants: '#3b4a6b' } },
  { id: 'npc-maya', name: '(NPC) Maya', kind: 'worker', homeSeat: 'shared-0-n0', personality: 'Designer, judges your font choices silently.',
    avatar: { skin: '#f7d7bd', hair: '#5a3825', hairStyle: 'bun', shirt: '#f0a04b', pants: '#3e3a52' } },
  { id: 'npc-galih', name: '(NPC) Galih', kind: 'worker', homeSeat: 'shared-0-n2', personality: 'Data analyst, answers every question with "it depends on the sample size".',
    avatar: { skin: '#c68a5e', hair: '#2b1d16', hairStyle: 'short', shirt: '#5b8fd9', pants: '#2f3a4f' } },
  { id: 'npc-intan', name: '(NPC) Intan', kind: 'worker', homeSeat: 'shared-1-n0', personality: 'HR, unreasonably warm, remembers everyone\'s birthday.',
    avatar: { skin: '#f2c6a0', hair: '#b4533a', hairStyle: 'long', shirt: '#4f8a5b', pants: '#3b4a6b' } },
  { id: 'npc-fajar', name: '(NPC) Fajar', kind: 'worker', homeSeat: 'shared-1-n2', personality: 'Senior eng, 10x in his own mind, still uses vim for everything.',
    avatar: { skin: '#8d5a3b', hair: '#1d1a1a', hairStyle: 'spiky', shirt: '#3a3f4a', pants: '#5a4636' } },
];

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

export const ALL_NPCS: NpcDef[] = [...WORKERS, BIT, BEANIE, QUACKY];

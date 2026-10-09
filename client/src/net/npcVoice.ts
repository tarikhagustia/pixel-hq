// Plays the Animal-Crossing-style "animalese" SFX when an NPC's chat message arrives,
// with volume falling off by distance from the local player (same feel as footsteps).
import type { PlayerState } from '../../../shared/protocol';
import { local, remotes } from '../state/live';
import { get } from '../state/store';
import { npcTalk, voiceFingerprint } from '../game/sfx';

const TALK_RADIUS = 260; // px — beyond this, an NPC's chatter is inaudible

export function playNpcTalk(npc: PlayerState | undefined, text: string) {
  if (!npc?.npcKind) return;
  const r = remotes.get(npc.id);
  const dist = r ? Math.hypot(r.x - local.x, r.y - local.y) : 0;
  if (dist > TALK_RADIUS) return;
  const fall = 1 - dist / TALK_RADIUS;
  const volume = Math.max(0, fall * fall) * get().settings.sfxVolume;
  npcTalk(npc.npcKind, text.length, voiceFingerprint(npc.id), volume);
}

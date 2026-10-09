// Plays the Animal-Crossing-style "animalese" SFX when an NPC's chat message arrives.
// DMs are an intentional 1:1 interaction the player can open from anywhere (People Panel,
// Direct tab) — unlike footsteps/ambient sound, they should NOT be gated by map distance,
// otherwise the talk SFX silently plays at ~0 volume whenever the player isn't standing
// right next to the NPC's sprite, which looks like "sound isn't working" to the user.
import type { PlayerState } from '../../../shared/protocol';
import { get } from '../state/store';
import { npcTalk, voiceFingerprint } from '../game/sfx';

export function playNpcTalk(npc: PlayerState | undefined, text: string) {
  if (!npc?.npcKind) return;
  const volume = get().settings.sfxVolume;
  if (volume <= 0.001) return;
  npcTalk(npc.npcKind, text.length, voiceFingerprint(npc.id), volume);
}

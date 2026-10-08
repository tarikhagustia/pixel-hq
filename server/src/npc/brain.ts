// 🔌 AI PLUGIN POINT.
//
// Today this returns a canned, personality-flavored one-liner so NPCs feel alive without
// any external dependency. To wire in a real LLM later: replace the body of `reply()` with
// a call to your model of choice (OpenAI/Claude/local), using `npc.personality` as the system
// prompt and `history` for short-term context. Nothing else in the codebase needs to change —
// the server calls `reply()` and broadcasts whatever string comes back as a chat message.
import type { NpcDef } from './roster';

export interface ChatTurn { from: 'player' | 'npc'; text: string }

const WORKER_LINES = [
  "honestly? still waiting for the build to finish.",
  "don't look at my code right now, it's held together with hope.",
  "did you try turning it off and on again? kidding. mostly.",
  "I pushed a fix. I did not test the fix. we live dangerously here.",
  "it works on my machine, which is the only machine that matters to me personally.",
  "ask me again after this coffee. actually ask me after the next one too.",
  "the deadline moved again. I've stopped being surprised, only tired.",
  "I have 47 browser tabs open and I refuse to explain any of them.",
  "that bug isn't a bug, it's a feature nobody documented yet.",
  "standup ran 40 minutes today. we talked about a button for 35 of them.",
];

const BIT_LINES = ['*wags tail*', 'woof!', '*tilts head*', '*sniffs your shoes, approves*', '*flops over dramatically*', '*brings you an imaginary ball*'];

const BEANIE_LINES = [
  "that'll be one existential crisis, oat milk, to go?",
  "we're out of regular, but I've got a blend called 'Monday Survival'.",
  "espresso shot number four of the day — for you, not me. I've had seven.",
  "the secret ingredient is I simply care about you getting through this meeting.",
  "latte art's a bit rough today, consider it abstract.",
];

const QUACKY_LINES = [
  "...",
  "*stares*",
  "have you explained the bug to me yet?",
  "*small squeak*",
  "the duck has no notes. the duck believes in you.",
];

function pick(arr: string[], seed: number) {
  return arr[Math.abs(seed) % arr.length];
}

/** Ambient one-liner said without being prompted (idle chatter, desk mutters, etc). */
export function idleLine(npc: NpcDef, seed: number): string {
  switch (npc.kind) {
    case 'dog': return pick(BIT_LINES, seed);
    case 'barista': return pick(BEANIE_LINES, seed);
    case 'duck': return pick(QUACKY_LINES, seed);
    default: return pick(WORKER_LINES, seed);
  }
}

/**
 * Reply to a direct message from a player. Swap this implementation for an LLM call when ready —
 * signature is intentionally async so that drop-in works with zero other changes.
 */
export async function reply(npc: NpcDef, playerText: string, _history: ChatTurn[]): Promise<string> {
  const seed = hashStr(playerText) + npc.id.length;
  const lines = npc.kind === 'dog' ? BIT_LINES : npc.kind === 'barista' ? BEANIE_LINES : npc.kind === 'duck' ? QUACKY_LINES : WORKER_LINES;
  return pick(lines, seed);
}

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

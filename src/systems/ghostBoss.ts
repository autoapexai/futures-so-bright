/**
 * GHOST DUSTERS bosses: level 10 is the Stay Puft Marshmallow Man (owner request). Later big
 * bosses reuse the normal progression (Boss.ts) exactly as ON A MISSION does. Strictly G-rated:
 * cheerful-goofy stomp; when beaten he melts into a harmless puddle of marshmallow fluff.
 */
import type { BossDef } from './Boss';

/** Level-10 GHOST DUSTERS-only big boss (replaces Monsieur Mirror for this mode only). */
export const STAY_PUFT: BossDef = {
  level: 10,
  rank: 1,
  modeId: 'staypuft',
  name: 'STAY PUFT MARSHMALLOW MAN',
  dogs: 0,
  tint: '#ffffff',
  style: 'solid',
  signature: 'strut',
  blurb: 'STAY PUFT MARSHMALLOW MAN: a giant cheerful marshmallow man in a blue sailor hat with a red ribbon collar; stomps goofily; melts into harmless fluff when beaten',
  patterns: ['slam', 'aimed', 'spray'],
  taunts: [
    'GOT ANY SMORE ROOM?',
    'I AM JUST A BIG SOFTIE!',
    'STOMP STOMP... GIGGLE!',
    'PLEASE DO NOT EAT ME. OR DO. I AM FLUFF.',
  ],
};

/** GHOST DUSTERS only: Stay Puft on level 10; null elsewhere (fall through to normal bosses / minis). */
export function ghostBossForLevel(level: number): BossDef | null {
  return level === 10 ? STAY_PUFT : null;
}

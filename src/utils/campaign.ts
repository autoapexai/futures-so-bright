/**
 * STORY PROGRESSION (Dan, 2026-10-08):
 *
 *   dog mode (the normal game)  ->  CAT MODE = PART TWO: DOGS AND CATS IN SPACE  ->  PLATYPUS MODE + MANATEE MODE
 *
 * - Beating dog mode (clearing level 111, i.e. beating the level 111 boss, in a normal or fan-mode
 *   run; the vehicle modes ON A MISSION / GHOST DUSTERS don't count) invents the CAT SPACE SUIT and
 *   unlocks CAT MODE. Until then the cats can't breathe in space (see systems/catSuitScene.ts).
 * - CAT MODE is part two: dogs AND cats fly together (a team-up, cats in space suits), a bit harder.
 * - Beating part two (clearing its level 111) unlocks PLATYPUS MODE and MANATEE MODE together. Each
 *   swaps the dogs for that animal (helmets on), at part two's final difficulty.
 *
 * Unlocks and each mode's best score live in localStorage next to the rest of the progress
 * (utils/storage.ts). Story-mode runs are local-only: they never write to the shared leaderboard.
 *
 * Fairness rules (Dan): harder but playable. Only hazard SPEED and spawn DENSITY scale, and the
 * speed never goes above dog mode's own fastest (level 111), so hazards never arrive faster than
 * anything a dog-mode player already faces: reaction windows never get shorter than dog mode's
 * minimum. Hitboxes, the post-hit grace, shade drain, hit damage, continues and shields are dog
 * mode's exactly. Bosses: same patterns, a shorter pause between volleys (never below dog mode's
 * fastest boss cadence) and one extra projectile per volley; same shot speed, telegraphs and HP.
 */
import { hazardLevers, clampLevel, MAX_LEVEL, type HazardLevers } from './difficulty';
import type { BossTuning } from '../systems/Boss';

export type Campaign = 'dog' | 'part2' | 'platypus' | 'manatee';
export const STORY_CAMPAIGNS: readonly Exclude<Campaign, 'dog'>[] = ['part2', 'platypus', 'manatee'];

/** Player-facing mode names (English in every language, like every mode name). */
export const CAMPAIGN_NAME: Record<Exclude<Campaign, 'dog'>, string> = {
  part2: 'CAT MODE',
  platypus: 'PLATYPUS MODE',
  manatee: 'MANATEE MODE',
};

/** Title cards shown as a run starts (English, like mode names). */
export const CAMPAIGN_CARD: Record<Exclude<Campaign, 'dog'>, [string, string]> = {
  part2: ['PART TWO', 'DOGS AND CATS IN SPACE'],
  platypus: ['PLATYPUS MODE', 'PLATYPUSES IN SPACE'],
  manatee: ['MANATEE MODE', 'MANATEES IN SPACE'],
};

/** Part two ramps linearly from START at level 1 to END at level 111. */
export const PART2_START = 1.25;
export const PART2_END = 1.5;
/** PLATYPUS / MANATEE: flat at part two's final multiplier on every level. */
export const ANIMAL_MULT = PART2_END;
/** Bosses in story modes: one more projectile per volley. */
export const SEQUEL_EXTRA_VOLLEY = 1;
/** Shortest phase-1 seconds between volleys dog mode ever uses (rank-12 boss / level-109 mini). */
export const BOSS_FIRE_FLOOR = 0.95;
export const MINI_FIRE_FLOOR = 1.3;

/** Difficulty multiplier vs dog mode for this campaign on this level (1 = dog mode). */
export function campaignMult(c: Campaign, level: number): number {
  if (c === 'dog') return 1;
  if (c === 'part2') {
    const x = (clampLevel(level) - 1) / (MAX_LEVEL - 1);
    return PART2_START + (PART2_END - PART2_START) * x;
  }
  return ANIMAL_MULT;
}

/** Dog mode's fastest hazard speed lever (level 111): story modes never exceed it. */
export const DOG_MAX_SPEED = hazardLevers(MAX_LEVEL).speed;

/** Dog mode's densest hazard spawning (level 111). */
export const DOG_MAX_DENSITY = hazardLevers(MAX_LEVEL).density;
/** Story-mode spawn density never goes above dog mode's densest x this (tuned with part-two-sim). */
export const DENSITY_HEADROOM = 1.1;

/** Hazard levers for a story-mode level: dog mode's, with speed and density scaled (see header). */
export function campaignLevers(level: number, c: Campaign, headroom = DENSITY_HEADROOM): HazardLevers {
  const base = hazardLevers(level);
  if (c === 'dog') return base;
  const k = campaignMult(c, level);
  return {
    ...base,
    speed: Math.min(base.speed * k, Math.max(base.speed, DOG_MAX_SPEED)),
    density: Math.min(base.density * k, Math.max(base.density, DOG_MAX_DENSITY * headroom)),
  };
}

/**
 * Boss / mini-boss tuning in a story mode (k = campaignMult; k <= 1 returns it unchanged): volleys
 * come sooner (seconds between volleys / sqrt(k), floored at dog mode's fastest cadence) with one
 * extra projectile. Shot speed, HP, stun, weak-spot timing and telegraphs stay dog mode's.
 */
export function sequelTuning(t: BossTuning, mini: boolean, k: number): BossTuning {
  if (!(k > 1)) return t;
  const floor = mini ? MINI_FIRE_FLOOR : BOSS_FIRE_FLOOR;
  const fire = t.fireEvery <= floor ? t.fireEvery : Math.max(floor, t.fireEvery / Math.sqrt(k));
  return { ...t, fireEvery: +fire.toFixed(3), volley: +(t.volley + SEQUEL_EXTRA_VOLLEY).toFixed(2) };
}

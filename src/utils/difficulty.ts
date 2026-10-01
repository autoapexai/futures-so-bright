/**
 * Levels 1-111. 5 is the original game (all factors exactly 1).
 * Must match the tables in supabase/fsb_leaderboard.sql (plausibility cap).
 * The selector offers 1-10 (11 only for the current #1, as a perk); 11 is also the gold clone
 * button's start level. Levels 11-111 are the gold "beyond 10" zone, earned by climbing:
 * beating 10 promotes to 11, and so on up to 111 (clearing 111 is a victory).
 */
import { t } from '../i18n';
export const MIN_DIFFICULTY = 1;
export const MAX_PUBLIC_DIFFICULTY = 10;
export const SECRET_DIFFICULTY = 11;
/** First level of the gold zone (= SECRET_DIFFICULTY, the start level of the clone button). */
export const FIRST_GOLD_LEVEL = 11;
/** Top level: clearing it wins the run. */
export const MAX_LEVEL = 111;
export const DEFAULT_DIFFICULTY = 5;
/** Highest score the shared board accepts (fsb_scores check + fsb_submit_score). */
export const SCORE_CAP = 777_777_777;

/** Speed factor per difficulty as the server's plausibility cap assumes it (see hazardSpeedFactor for play). */
const SPEED = [0.7, 0.775, 0.85, 0.925, 1, 1.09, 1.18, 1.27, 1.36, 1.45, 1.55];
/** Point multiplier applied to every point earned in a run. */
const POINTS = [0.6, 0.7, 0.8, 0.9, 1, 1.2, 1.4, 1.6, 1.8, 2.0, 2.5];

function idx(d: number): number {
  const n = Math.round(Number(d));
  if (!Number.isFinite(n)) return DEFAULT_DIFFICULTY - 1;
  return Math.min(SECRET_DIFFICULTY, Math.max(MIN_DIFFICULTY, n)) - 1;
}

export function clampDifficulty(d: number): number {
  return idx(d) + 1;
}

/** Any playable level 1-111 (clampDifficulty stays 1-11: the selector / saved start level). */
export function clampLevel(d: number): number {
  const n = Math.round(Number(d));
  if (!Number.isFinite(n)) return MIN_DIFFICULTY;
  return Math.min(MAX_LEVEL, Math.max(MIN_DIFFICULTY, n));
}

export function speedFactor(d: number): number {
  return SPEED[idx(d)];
}

/** Original spawn density factor (kept for reference; play uses hazardDensityFactor). */
export function densityFactor(d: number): number {
  return SPEED[idx(d)];
}

export function pointMultiplier(d: number): number {
  return POINTS[idx(d)];
}

/**
 * Hazard tuning (2026-09-29, Dan). SPEED / POINTS above stay as they are: POINTS is
 * still the per-level point multiplier, and SPEED is still what the server's
 * plausibility cap assumes (actual speeds are now <= those, so every legit score
 * stays under the unchanged cap). Gameplay hazards instead use:
 *
 *   base  = ORIGINAL difficulty-1 levers for levels 1-10, ORIGINAL difficulty-5 levers for 11
 *   ease  = target: 1 -> 10x easier, 2 -> 9x ... 9 -> 2x, 10 -> 1x (= original level 1); 11 -> 1x
 *
 * Every level eases the SAME levers with the SAME exponents; only the strength S
 * differs. S was calibrated per level with scripts/difficulty-sim.ts (bisection) so a
 * new player's average time-to-death is ~ease x the original level 1's. Survival
 * doesn't grow linearly with S (the distance ramp still ends long runs), hence the table.
 * S falls strictly from 1 to 10 and 11 has the faster base, so the curve rises strictly.
 */
export const EASE_TARGET = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 1];
const EASE_STRENGTH = [12.82, 9.37, 7.0, 5.19, 3.88, 2.89, 2.35, 1.91, 1.48, 1, 1];
/** Exponent of S for spawn interval, ramp length, drain, hit damage, hit grace. */
const EASE_EXP = 0.5;
/** Exponent of S for hazard / scroll speed (gentler, so the screen still moves). */
const SPEED_EASE_EXP = 0.2;

export interface HazardLevers {
  /** Scroll (= hazard approach) speed and speed-ramp factor (was speedFactor). */
  speed: number;
  /** Spawn density factor: the spawn interval is divided by this (was densityFactor). */
  density: number;
  /** Multiplier on the distance over which hazards ramp to full density (8000 originally). */
  rampMul: number;
  /** Multiplier on shade drain per second. */
  drainMul: number;
  /** Multiplier on shade lost per hit (0.28 originally). */
  hitDamageMul: number;
  /** Multiplier on the post-hit invulnerability window (0.85 s originally). */
  hitGraceMul: number;
}

/**
 * Gold zone (levels 12-111): level 11's levers (original difficulty 5, strength 1) tightened
 * further on every level with diminishing steps, x = sqrt((level - 11) / 100): 0 at 11, 0.1 at
 * 12, 0.3 at 20, 0.62 at 50, 0.94 at 100, 1 at 111. Every level is strictly harder than the one
 * before, the steps shrink as you climb, and x is bounded (1 at 111), so 111 is the hardest
 * level but each lever stays within a fixed limit. Each lever moves from its level-11 value
 * toward its 111 value:
 */
const GOLD = {
  /** Hazard / scroll speed x (1 + SPEED x). Stays <= 1.55, the server's plausibility speed for 11+. */
  speed: 0.4,
  /** Spawn density x (1 + DENSITY x). */
  density: 0.6,
  /** Ramp to full density over 1 / (1 + RAMP x) of the distance. */
  ramp: 0.5,
  /** Shade drain x (1 + DRAIN x). */
  drain: 0.5,
  /** Shade lost per single-dog hit x (1 + DAMAGE x). */
  damage: 0.4,
  /** Post-hit grace / (1 + GRACE x). */
  grace: 0.4,
};

/** 0 at level 11, rising strictly (with shrinking steps) to 1 at level 111. */
export function goldProgress(d: number): number {
  const n = clampLevel(d);
  return n <= FIRST_GOLD_LEVEL ? 0 : Math.sqrt((n - FIRST_GOLD_LEVEL) / (MAX_LEVEL - FIRST_GOLD_LEVEL));
}

export function easeStrength(d: number): number {
  return EASE_STRENGTH[idx(d)];
}

/** Base speed / density before easing: original level 1 (0.7) for 1-10, original level 5 (1.0) for 11-111. */
export function hazardBaseFactor(d: number): number {
  return clampLevel(d) >= FIRST_GOLD_LEVEL ? SPEED[DEFAULT_DIFFICULTY - 1] : SPEED[0];
}

/** All hazard levers for a level (strength override is for the calibration script). */
export function hazardLevers(d: number, strength = easeStrength(d)): HazardLevers {
  const base = hazardBaseFactor(d);
  const e = Math.pow(strength, EASE_EXP);
  const x = goldProgress(d);
  return {
    speed: base * Math.pow(strength, -SPEED_EASE_EXP) * (1 + GOLD.speed * x),
    density: (base / e) * (1 + GOLD.density * x),
    rampMul: e / (1 + GOLD.ramp * x),
    drainMul: (1 / e) * (1 + GOLD.drain * x),
    hitDamageMul: (1 / e) * (1 + GOLD.damage * x),
    hitGraceMul: e / (1 + GOLD.grace * x),
  };
}

export function difficultyLabel(d: number): string {
  const c = clampDifficulty(d);
  const mult = `${pointMultiplier(c).toFixed(1)}x`;
  return c === SECRET_DIFFICULTY ? t('diff_eleven', { m: mult }) : t('diff_label', { c, m: mult });
}

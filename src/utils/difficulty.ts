/**
 * Difficulty 1-11. 5 is the original game (all factors exactly 1).
 * Must match the tables in supabase/fsb_leaderboard.sql (plausibility cap).
 * 11 is hidden: only the current #1 on the shared board can select it.
 */
export const MIN_DIFFICULTY = 1;
export const MAX_PUBLIC_DIFFICULTY = 10;
export const SECRET_DIFFICULTY = 11;
export const DEFAULT_DIFFICULTY = 5;

/** Base scroll speed and speed-ramp factor. */
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

export function speedFactor(d: number): number {
  return SPEED[idx(d)];
}

/** Obstacle spawn density factor (spawn interval is divided by this). */
export function densityFactor(d: number): number {
  return SPEED[idx(d)];
}

export function pointMultiplier(d: number): number {
  return POINTS[idx(d)];
}

export function difficultyLabel(d: number): string {
  const c = clampDifficulty(d);
  const mult = `${pointMultiplier(c).toFixed(1)}x`;
  return c === SECRET_DIFFICULTY ? `11 · SHADES ON · ${mult}` : `DIFFICULTY ${c} · ${mult}`;
}

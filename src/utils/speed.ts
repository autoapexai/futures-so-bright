/**
 * GAME SPEED (pause menu): 1.0 - 11.1 in 0.1 steps (102 settings), saved per device.
 *
 * Integer math: the speed is always held as integer TENTHS (10 = 1.0 ... 111 = 11.1), never as a
 * float that gets 0.1 added to it, so 5.5 is exactly 55 and can't drift to 5.4999999.
 *
 * Time: the play simulation runs speed x faster (a fast-forward of the same game: hazards,
 * player, bosses, level timers and ON A MISSION alike). Each frame's game time
 * (dt * tenths / 10) is split into ceil(tenths / 10) equal substeps, so a substep is never longer
 * than a 1.0 frame: at 11.1 every collision / pickup check runs 12 times a frame, exactly as
 * often per unit of game time as at 1.0, so nothing can tunnel through a hit or a pickup.
 *
 * Points: every point earned is multiplied by the speed, on top of the level multiplier
 * (boss bonuses included). scalePoints() multiplies by the integer tenths first and divides by 10
 * once (one rounding step, deterministic in IEEE doubles). Points are NOT rounded per award, so
 * fractions never get lost or invented; the score shown and submitted is floor(score), capped
 * at SCORE_CAP (777,777,777), exactly as before. At 1.0 the original value is returned
 * untouched, so 1.0 is bit-for-bit today's scoring.
 */
export const SPEED_MIN = 10;
export const SPEED_MAX = 111;
export const SPEED_DEFAULT = 10;
/** Number of settings (1.0 ... 11.1). */
export const SPEED_STEPS = SPEED_MAX - SPEED_MIN + 1;

/**
 * Public board + DEV BOARD: the server knows about speed (supabase/fsb_speed_scores.sql, applied
 * 2026-10-02 Pacific Time), so speed runs go on the boards like any other run. A run whose top
 * speed was above 1.0 sends it as p_speed (tenths) to fsb_submit_score / fsb_dev_submit, which
 * scale their plausibility and ticket checks by it. 1.0 runs send today's body (no p_speed).
 * (false = the pre-migration rule: any run above 1.0 stays on this device's board.)
 */
export const SPEED_ON_PUBLIC_BOARD = true;

const KEY = 'fsb_speed_tenths';

export function clampSpeed(t: number): number {
  if (!Number.isFinite(t)) return SPEED_DEFAULT;
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, Math.round(t)));
}

/** "1.0", "5.5", "11.1" (integer tenths -> text; no float formatting involved). */
export function fmtSpeed(t: number): string {
  const c = clampSpeed(t);
  return `${Math.floor(c / 10)}.${c % 10}`;
}

/** Points earned at this speed (see the header). */
export function scalePoints(points: number, tenths: number): number {
  if (tenths === SPEED_DEFAULT) return points;
  return (points * tenths) / 10;
}

/** Substeps per frame: each one is at most one 1.0 frame of game time. */
export function speedSubsteps(tenths: number): number {
  return Math.max(1, Math.ceil(tenths / 10));
}

export function loadSpeed(): number {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null || !/^\d{2,3}$/.test(raw)) return SPEED_DEFAULT;
    return clampSpeed(Number(raw));
  } catch {
    return SPEED_DEFAULT;
  }
}

export function saveSpeed(t: number): void {
  try {
    localStorage.setItem(KEY, String(clampSpeed(t)));
  } catch {
    /* storage blocked */
  }
}

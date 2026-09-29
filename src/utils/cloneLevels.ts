/**
 * Clone levels: the progression past difficulty 11, *inside* a difficulty-11 run.
 *
 * - A difficulty-11 run starts at level 11 with 1 ship.
 * - Surviving LEVEL_SECONDS of play time (pauses excluded) on the current level
 *   passes it; the run moves up exactly one level (no skipping).
 * - On each level-up the ship count is set to shipsForLevel(level), so lost
 *   clones come back.
 * - Speed and points stay those of difficulty 11 (the run is still submitted as
 *   difficulty 11); clone levels are shown in-game only.
 */

/** Play-time seconds needed to pass a level. */
export const LEVEL_SECONDS = 30;

/** First clone level (the level a difficulty-11 run starts on). */
export const FIRST_CLONE_LEVEL = 11;

/** At most this many ships (player + clones) are drawn / collide; the rest are a reserve. */
export const MAX_DRAWN_SHIPS = 24;

/**
 * Number of ships on a clone level.
 *
 *   level: 11  12  13  14  15  16  17  18   19   20  ...
 *   ships:  1   2   3   4  16  32  64 128  256  512  ... (doubling, no level cap)
 *
 * i.e. levels 11-14 give (level - 10) ships, level 15 gives 16, and every level
 * after 15 doubles the previous one: ships = 16 * 2^(level - 15).
 * Levels below 11 return 1. Returned as a JS number: exact up to level 64
 * (2^53); beyond that it is a (huge) floating-point approximation, and
 * Infinity past ~level 1038 — far beyond any run the server accepts (1 h).
 */
export function shipsForLevel(level: number): number {
  const n = Math.floor(level);
  if (!Number.isFinite(n) || n <= FIRST_CLONE_LEVEL) return 1;
  if (n <= 14) return n - 10;
  return 16 * Math.pow(2, n - 15);
}

/** Compact ship count for HUD / banner text: 16384 -> "16,384", 1.2e18 -> "1.2e18". */
export function formatShips(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  if (n < 1e15) return Math.round(n).toLocaleString('en-US');
  return n.toExponential(1).replace('e+', 'e');
}

export function shipsLabel(n: number): string {
  return `${formatShips(n)} ${n === 1 ? 'SHIP' : 'SHIPS'}`;
}

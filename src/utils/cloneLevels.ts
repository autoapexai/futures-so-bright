/**
 * Clone levels: the gold zone, levels 11-111.
 *
 * - A run reaches level 11 by beating 10 (or starts there with the gold clone button), 1 ship.
 * - Surviving LEVEL_SECONDS of play time (pauses excluded) on the current level
 *   passes it: a promotion interstitial, then the next level starts fresh (exactly one level).
 * - On each level-up the ship count is set to shipsForLevel(level), so lost
 *   clones come back. Hazards tighten every level (utils/difficulty.ts hazardLevers).
 * - Points stay those of level 11; the run is submitted as the level it ended on (11-111).
 *   Clearing 111 wins the run.
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

/** Dogs a gold-zone swarm can lose before only the lead dog is left (levels 15+). */
export const SWARM_LIVES = 4;

/**
 * Dogs lost per hit on a gold-zone level (lead dog, drawn clone, or running out of shade).
 * Levels 11-14: one dog per hit, as always (they carry 1-4 dogs). From level 15 the swarm doubles
 * every level, so a hit costs a quarter of the level's full swarm: every level 15-111 has the same
 * SWARM_LIVES hits of margin (instead of thousands to ~10^30), and the doubling count stays
 * the swarm's look. Lost dogs come back on the next level.
 */
export function shipHitCost(level: number): number {
  const n = Math.floor(level);
  if (!Number.isFinite(n) || n < 15) return 1;
  return Math.max(1, Math.ceil(shipsForLevel(n) / SWARM_LIVES));
}

/** Compact ship count for HUD / banner text: 16384 -> "16,384", 1.2e18 -> "1.2e18". */
export function formatShips(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  if (n < 1e15) return Math.round(n).toLocaleString('en-US');
  return n.toExponential(1).replace('e+', 'e');
}

export function shipsLabel(n: number): string {
  return `${formatShips(n)} ${n === 1 ? 'DOG' : 'DOGS'}`;
}

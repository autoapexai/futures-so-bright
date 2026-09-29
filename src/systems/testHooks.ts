/**
 * Test-only hooks, bundled only when built with FSB_TEST=1 (see vite.config.ts).
 * Production builds compile the import out, so none of this ships to players.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { shipsForLevel } from '../utils/cloneLevels';
import { CLONE_SLOTS } from '../entities/Formation';

export function installTestHooks(game: unknown): void {
  const g = game as any;
  (window as any).__fsbTest = {
    state: () => ({
      state: g.state,
      level: g.level,
      ships: g.ships,
      drawn: 1 + g.formation.occupiedCount,
      levelTime: g.levelTime,
      runTime: g.runTime,
      score: g.score,
      runDifficulty: g.runDifficulty,
      cloneOpen: g.cloneOpen,
      ticketPending: g.ticketPending,
    }),
    /** Jump the current difficulty-11 run to a clone level (as if every earlier level was passed). */
    setLevel: (n: number) => {
      g.level = n - 1;
      g.levelTime = 0;
      g.levelUp();
    },
    /** Put the run 1 s short of passing the current level. */
    nearPass: () => {
      g.levelTime = 29;
    },
    /** Freeze shade drain so a long idle test run doesn't end. */
    fullCharge: () => {
      g.charge = 1;
    },
    shipsForLevel,
    CLONE_SLOTS,
    game: g,
  };
}

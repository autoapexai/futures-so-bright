/**
 * Sanity check: cat gag only on levels 100-111, at most once per run.
 * Run: npx tsx scripts/cat-check.ts
 */
import { mulberry32, subSeed } from '../src/utils/rng';
import {
  CAT_LEVEL_MAX,
  CAT_LEVEL_MIN,
  catShouldFire,
  catStageDelay,
} from '../src/systems/silly';

let ok = true;
const assert = (cond: boolean, msg: string): void => {
  if (!cond) {
    ok = false;
    console.error('FAIL:', msg);
  } else {
    console.log('ok:', msg);
  }
};

// Delay is in [3, 20).
for (let seed = 1; seed <= 200; seed++) {
  const d = catStageDelay(mulberry32(subSeed(seed, 999)));
  if (!(d >= 3 && d < 20)) {
    ok = false;
    console.error('FAIL: delay out of range', d, 'seed', seed);
    break;
  }
}
assert(ok, 'catStageDelay always in [3, 20)');

// Never below 100, never above 111, never during tutorial/boss, never if already shown.
assert(!catShouldFire(-1, false, false, 99, 10, 5), 'no fire on level 99');
assert(!catShouldFire(-1, false, false, 112, 10, 5), 'no fire on level 112');
assert(!catShouldFire(0, false, false, 100, 10, 5), 'no fire during tutorial');
assert(!catShouldFire(-1, true, false, 100, 10, 5), 'no fire during boss');
assert(!catShouldFire(-1, false, true, 100, 10, 5), 'no fire if already shown');
assert(!catShouldFire(-1, false, false, 105, 2, 5), 'no fire before delay');
assert(catShouldFire(-1, false, false, 100, 5, 5), 'fires on level 100 at delay');
assert(catShouldFire(-1, false, false, 105, 12, 5), 'fires on mid mini-boss level');
assert(catShouldFire(-1, false, false, 111, 20, 5), 'fires on level 111');

// Simulate a run climbing 1..111: fires exactly once, only in 100-111.
const rng = mulberry32(subSeed(424242, 999));
const nextCatAt = catStageDelay(rng);
let catShown = false;
let fires = 0;
const fireLevels: number[] = [];
for (let level = 1; level <= 111; level++) {
  // 30 s stage sampled every 0.5 s; skip boss window (levelTime clamped / boss up near end).
  for (let levelTime = 0; levelTime < 28; levelTime += 0.5) {
    const hasBoss = false; // boss only after ~30 s
    if (catShouldFire(-1, hasBoss, catShown, level, levelTime, nextCatAt)) {
      catShown = true;
      fires++;
      fireLevels.push(level);
    }
  }
}
assert(fires === 1, `exactly one fire per run (got ${fires} @ ${fireLevels.join(',')})`);
assert(fireLevels[0]! >= CAT_LEVEL_MIN && fireLevels[0]! <= CAT_LEVEL_MAX, 'fire level in 100-111');

// Direct LEVEL SELECT start at 100+: still exactly once.
catShown = false;
fires = 0;
const delay2 = catStageDelay(mulberry32(subSeed(7, 999)));
for (let levelTime = 0; levelTime < 28; levelTime += 0.25) {
  if (catShouldFire(-1, false, catShown, 100, levelTime, delay2)) {
    catShown = true;
    fires++;
  }
}
assert(fires === 1, `LEVEL SELECT L100 fires once (got ${fires})`);

// After shown, later levels in window never fire again.
assert(!catShouldFire(-1, false, true, 107, 20, 0), 'no second fire later in window');

console.log(ok ? 'CAT CHECK OK' : 'CAT CHECK FAILED');
process.exit(ok ? 0 : 1);

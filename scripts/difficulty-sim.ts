/**
 * Headless time-to-death simulation for the difficulty levels (not part of the game bundle).
 * Uses the real WorldSpawner / Player / collision code and the real difficulty levers, and
 * re-implements the charge / scroll / hit parts of Game.tick() for the non-clone path.
 *
 * "New player" bot: re-plans every REACT s (human reaction lag), sees hazards only
 * LOOK s ahead, misses each hazard with prob MISS, aims with noise, grabs circles when low.
 *
 * MODE 'pack' (phase 3, levels 1-10): the 4-dog pack (lose a dog per hit or empty shade, the
 * rest grow, last dog = death) and the ring-gate boost, on top of the 'after' levers.
 *
 * Run: npx esbuild scripts/difficulty-sim.ts --bundle --platform=node --format=esm \
 *        --define:window=globalThis --outfile=/tmp/fsb-sim.mjs && node /tmp/fsb-sim.mjs [before|after]
 */
import { WorldSpawner, aabb, circleRect, type Obstacle } from '../src/entities/Obstacles';
import { Player } from '../src/entities/Player';
import * as D from '../src/utils/difficulty';
import { Formation } from '../src/entities/Formation';
import { breedScale } from '../src/render/shipSprite';

let seed = 1;
Math.random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const W = 960, H = 540, TOP = 60, BOT = 60, LEFT = 20;
const REACT = 0.3, LOOK = 0.75, MISS = 0.3, NOISE = 22;
const MODE = process.argv[2] ?? 'after';

function hits(o: Obstacle, hb: { x: number; y: number; w: number; h: number }): boolean {
  if (o.kind === 'ring') {
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    const nx = (hb.x + hb.w / 2 - cx) / (o.w / 2), ny = (hb.y + hb.h / 2 - cy) / (o.h / 2);
    const d2 = nx * nx + ny * ny;
    return d2 < 1.05 && d2 > 0.42;
  }
  if (o.kind === 'flare') return circleRect(o.x + o.w / 2, o.y + o.h / 2, o.w * 0.38, hb.x, hb.y, hb.w, hb.h);
  return aabb(hb.x, hb.y, hb.w, hb.h, o.x, o.y, o.w, o.h);
}

function levers(d: number, strength?: number) {
  if (MODE === 'before') return { speed: D.speedFactor(d), density: D.densityFactor(d), rampMul: 1, drainMul: 1, hitDamageMul: 1, hitGraceMul: 1 };
  return D.hazardLevers(d, strength);
}

function run(d: number, strength?: number, cap = 1200): number {
  const L = levers(d, strength);
  const world = new WorldSpawner();
  const p = new Player();
  world.reset();
  p.reset(H);
  let distance = 0, charge = 1, t = 0, targetY = p.y, replan = 0;
  const missed = new WeakSet<Obstacle>();
  const seen = new WeakSet<Obstacle>();
  const dt = 1 / 60;
  const m = L.speed;
  while (t < cap) {
    t += dt;
    const scroll = 240 * m + distance * 0.035 * m;
    replan -= dt;
    if (replan <= 0) {
      replan = REACT;
      // blocked y-intervals for hazards within LOOK seconds ahead
      const blocked: [number, number][] = [];
      for (const o of world.obstacles) {
        if (!seen.has(o)) { seen.add(o); if (Math.random() < MISS) missed.add(o); }
        if (missed.has(o)) continue;
        if (o.x > p.x + scroll * LOOK || o.x + o.w < p.x - 40) continue;
        if (o.kind === 'ring') { blocked.push([o.y - 14, o.y + o.h * 0.2]); blocked.push([o.y + o.h * 0.8, o.y + o.h + 14]); }
        else blocked.push([o.y - 16, o.y + o.h + 16]);
      }
      const free = (y: number) => blocked.every(([a, b]) => y < a || y > b);
      let want = p.y;
      if (charge < 0.6) {
        let best: number | null = null;
        for (const c of world.collectibles) if (c.x > p.x && c.x < p.x + scroll * LOOK * 1.5) best = best === null || Math.abs(c.y - p.y) < Math.abs(best - p.y) ? c.y : best;
        if (best !== null) want = best;
      }
      if (!free(want)) {
        let found = want;
        for (let k = 1; k < 40; k++) {
          const up = want - k * 10, dn = want + k * 10;
          if (up > TOP && free(up)) { found = up; break; }
          if (dn < H - BOT && free(dn)) { found = dn; break; }
        }
        want = found;
      }
      targetY = want + (Math.random() * 2 - 1) * NOISE;
    }
    const dy = targetY - p.y;
    const axis = { x: 0, y: Math.max(-1, Math.min(1, dy / 30)) };
    p.update(dt, axis, false, W, H, 1, TOP, BOT, LEFT);
    world.update(dt, scroll, W, H, distance, TOP, H - BOT, L.density, L.rampMul);
    distance += scroll * dt * 0.35;
    charge -= (0.048 + distance * 0.000003) * L.drainMul * dt;
    if (charge <= 0) return t;
    const hb = p.hitbox;
    for (const c of world.collectibles) if (c.alive && circleRect(c.x, c.y, c.r, hb.x, hb.y, hb.w, hb.h)) { c.alive = false; charge = Math.min(1, charge + 0.22); }
    if (p.invuln <= 0) for (const o of world.obstacles) {
      if (o.alive && hits(o, hb)) {
        charge -= 0.28 * L.hitDamageMul;
        p.invuln = 0.85 * L.hitGraceMul;
        if (charge <= 0) return t;
        break;
      }
    }
  }
  return cap;
}

/** Phase-3 rules: dog pack (N0 = 4, s(n) = 0.5^(ln n / ln 4)) + gate boost (+0.28 shade). */
function runPack(d: number, cap = 1200): number {
  const L = D.hazardLevers(d);
  const world = new WorldSpawner();
  const p = new Player();
  const f = new Formation();
  world.reset();
  p.reset(H);
  let ships = 4;
  f.fill(3, p.x, p.y);
  const setK = () => {
    const k = ships <= 1 ? 1 : Math.pow(0.5, Math.log(ships) / Math.log(4));
    p.scale = breedScale(p.breed) * k; p.w = 52 * p.scale; p.h = 28 * p.scale;
    for (const s of f.slots) if (s.occupied) s.scale = breedScale(s.breed) * k;
    f.setSpread(k / 0.5);
  };
  setK();
  const grace = 0.85 * L.hitGraceMul;
  const lose = (slot: (typeof f.slots)[number] | null): boolean => {
    ships--;
    if (ships <= 0) return true;
    if (slot) f.empty(slot); else f.dropOutermost();
    setK();
    p.invuln = Math.max(p.invuln, grace);
    for (const s of f.slots) if (s.occupied) s.invuln = Math.max(s.invuln, grace);
    return false;
  };
  let distance = 0, charge = 1, t = 0, targetY = p.y, replan = 0;
  const missed = new WeakSet<Obstacle>();
  const seen = new WeakSet<Obstacle>();
  const passed = new WeakSet<Obstacle>();
  const dt = 1 / 60;
  const m = L.speed;
  const chb = { x: 0, y: 0, w: 0, h: 0 };
  while (t < cap) {
    t += dt;
    const scroll = 240 * m + distance * 0.035 * m;
    replan -= dt;
    if (replan <= 0) {
      replan = REACT;
      const up = f.extUp + 16, dn = f.extDown + 16;
      const blocked: [number, number][] = [];
      for (const o of world.obstacles) {
        if (!seen.has(o)) { seen.add(o); if (Math.random() < MISS) missed.add(o); }
        if (missed.has(o)) continue;
        if (o.x > p.x + scroll * LOOK || o.x + o.w < p.x - 40 - f.extLeft) continue;
        if (o.kind === 'ring') { blocked.push([o.y - dn, o.y + o.h * 0.2 + up - 16]); blocked.push([o.y + o.h * 0.8 - dn + 16, o.y + o.h + up]); }
        else blocked.push([o.y - dn, o.y + o.h + up]);
      }
      const free = (y: number) => blocked.every(([a, b]) => y < a || y > b);
      let want = p.y;
      if (charge < 0.6) {
        let best: number | null = null;
        for (const c of world.collectibles) if (c.x > p.x && c.x < p.x + scroll * LOOK * 1.5) best = best === null || Math.abs(c.y - p.y) < Math.abs(best - p.y) ? c.y : best;
        if (best !== null) want = best;
      }
      if (!free(want)) {
        let found = want;
        for (let k = 1; k < 40; k++) {
          const u = want - k * 10, w = want + k * 10;
          if (u > TOP + f.extUp && free(u)) { found = u; break; }
          if (w < H - BOT - f.extDown && free(w)) { found = w; break; }
        }
        want = found;
      }
      targetY = want + (Math.random() * 2 - 1) * NOISE;
    }
    const axis = { x: 0, y: Math.max(-1, Math.min(1, (targetY - p.y) / 30)) };
    p.update(dt, axis, false, W, H, 1, TOP + f.extUp, BOT + f.extDown, LEFT + f.extLeft);
    if (f.occupiedCount > 0) f.update(dt, p.x, p.y, t);
    world.update(dt, scroll, W, H, distance, TOP, H - BOT, L.density, L.rampMul);
    distance += scroll * dt * 0.35;
    charge -= (0.048 + distance * 0.000003) * L.drainMul * dt;
    if (charge <= 0) { if (lose(null)) return t; charge = 0.75; }
    const hb = p.hitbox;
    for (const c of world.collectibles) if (c.alive && circleRect(c.x, c.y, c.r, hb.x, hb.y, hb.w, hb.h)) { c.alive = false; charge = Math.min(1, charge + 0.22); }
    for (const o of world.obstacles) {
      if (o.kind !== 'ring' || passed.has(o) || p.x < o.x + o.w / 2) continue;
      passed.add(o);
      const ny = (p.y - (o.y + o.h / 2)) / (o.h / 2);
      if (ny * ny <= 0.42) charge = Math.min(1, charge + 0.28);
    }
    if (p.invuln <= 0) for (const o of world.obstacles) {
      if (o.alive && hits(o, hb)) { if (lose(null)) return t; break; }
    }
    for (const s of f.slots) {
      if (!s.occupied || s.invuln > 0) continue;
      chb.w = 52 * s.scale * 0.7; chb.h = 28 * s.scale * 0.7; chb.x = s.x - chb.w / 2; chb.y = s.y - chb.h / 2;
      for (const o of world.obstacles) if (o.alive && hits(o, chb)) { if (lose(s)) return t; break; }
    }
  }
  return cap;
}

const N = Number(process.argv[3] ?? 300);
function mean(d: number, strength?: number): number {
  seed = 12345 + d;
  let s = 0;
  for (let i = 0; i < N; i++) s += MODE === 'pack' ? (d <= 10 ? runPack(d) : run(d, strength)) : run(d, strength);
  return s / N;
}

if (MODE === 'calibrate') {
  // Bisect strength S per level so mean time-to-death = EASE_TARGET x original level 1's.
  const target1 = Number(process.argv[4]);
  const out: number[] = [];
  for (let d = 1; d <= 9; d++) {
    const goal = D.EASE_TARGET[d - 1] * target1;
    let lo = 1, hi = 80;
    for (let it = 0; it < 14; it++) {
      const mid = Math.sqrt(lo * hi);
      if (mean(d, mid) < goal) lo = mid; else hi = mid;
    }
    const sv = Math.sqrt(lo * hi);
    out.push(Number(sv.toFixed(2)));
    console.log(`d${d}: goal ${goal.toFixed(1)} s -> S ${sv.toFixed(2)} (mean ${mean(d, sv).toFixed(1)} s)`);
  }
  console.log(JSON.stringify(out));
} else {
  const res: Record<number, number> = {};
  for (let d = 1; d <= 11; d++) {
    res[d] = mean(d);
    console.log(`${MODE} d${d}: mean time-to-death ${res[d].toFixed(1)} s`);
  }
  console.log(JSON.stringify(res));
}

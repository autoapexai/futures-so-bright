/**
 * STORY-MODE BOT PLAYTEST (CAT MODE = part two, PLATYPUS MODE, MANATEE MODE vs dog mode).
 *
 * Hazard stages: the same headless sim as scripts/difficulty-sim.ts (real WorldSpawner / Player /
 * Formation / collision code, the game's pack and gold-zone clone rules), with the levers from
 * utils/campaign.ts. For every level 1-111, N runs of the 'skilled' bot (and the 'new' bot) try to
 * survive the 30 s stage. Then every level's boss or mini-boss is fought by the skilled autopilot
 * (systems/bossAutopilot.ts, the same bot as boss-sim.ts) with the story-mode boss tuning.
 *
 * Run: npx tsx scripts/part-two-sim.ts [N=40] [bossSeeds=4]
 */
import { WorldSpawner, aabb, circleRect, type Obstacle } from '../src/entities/Obstacles';
import { Player } from '../src/entities/Player';
import * as D from '../src/utils/difficulty';
import { Formation } from '../src/entities/Formation';
import { breedScale } from '../src/render/shipSprite';
import { shipsForLevel, shipHitCost } from '../src/utils/cloneLevels';
const HEADROOM = Number(process.env.HEADROOM ?? 0) || undefined;
import { campaignLevers, campaignMult, type Campaign } from '../src/utils/campaign';
import { BOSS_HIT_GRACE, BOSS_MERCY_R, BossFight, bossForLevel } from '../src/systems/Boss';
import { miniBossForLevel } from '../src/systems/miniBoss';
import { bossPilot, makeSkill } from '../src/systems/bossAutopilot';

let seed = 1;
Math.random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

const W = 960, H = 540, TOP = 60, BOT = 60, LEFT = 20;
let REACT = 0.3, LOOK = 0.75, MISS = 0.3, NOISE = 22;
/** Bot profiles: 'new' = the calibration player above; 'skilled' = fast, attentive player. */
function setBot(kind: 'new' | 'skilled'): void {
  if (kind === 'skilled') { REACT = 0.18; LOOK = 1.1; MISS = 0.04; NOISE = 10; }
  else { REACT = 0.3; LOOK = 0.75; MISS = 0.3; NOISE = 22; }
}
const MODE: string = 'pack';

/** Ring gates in the pack mode are pure boosts (never a hit); the 'before' / 'after' modes keep the old rim hit. */
function touchesRing(o: Obstacle, hb: { x: number; y: number; w: number; h: number }): boolean {
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  const qx = Math.max(hb.x, Math.min(cx, hb.x + hb.w)), qy = Math.max(hb.y, Math.min(cy, hb.y + hb.h));
  const nx = (qx - cx) / (o.w / 2), ny = (qy - cy) / (o.h / 2);
  return nx * nx + ny * ny <= 1.05;
}

function hits(o: Obstacle, hb: { x: number; y: number; w: number; h: number }): boolean {
  if (o.kind === 'ring' && (MODE === 'pack' || MODE === 'l111')) return false;
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
function runPack(d: number, cap = 1200, c: Campaign = 'dog'): number {
  const L = campaignLevers(d, c, HEADROOM);
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
        if (o.kind === 'ring') continue; // gates are harmless boosts now: no need to steer around them
        blocked.push([o.y - dn, o.y + o.h + up]);
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
      // Gate: the first touch (rim or hole, lead dog or pack dog) = FULL POWER.
      if (o.kind !== 'ring' || !o.alive || passed.has(o)) continue;
      let touched = touchesRing(o, hb);
      for (const s of f.slots) {
        if (touched) break;
        if (!s.occupied) continue;
        const w = 52 * s.scale * 0.7, h = 28 * s.scale * 0.7;
        touched = touchesRing(o, { x: s.x - w / 2, y: s.y - h / 2, w, h });
      }
      if (touched) { passed.add(o); charge = 1; }
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


/**
 * Gold zone (levels 11-111) with the game's clone rules: shipsForLevel(level) dogs (24 drawn,
 * the rest a reserve), every hit on the lead dog or a drawn clone costs shipHitCost(level) dogs,
 * running out of shade with dogs left costs the same and refills to 0.75, the last single dog
 * takes shade damage per hit; gates (any touch) = full shade. Hazard levers = hazardLevers(level).
 * Returns time to death, or `cap` if the bot survives.
 */
function runGold(d: number, cap = 1200, c: Campaign = 'dog'): number {
  const L = campaignLevers(d, c, HEADROOM);
  const world = new WorldSpawner();
  const p = new Player();
  const f = new Formation();
  world.reset();
  p.reset(H);
  let ships = shipsForLevel(d);
  const cost = shipHitCost(d);
  f.fill(Math.min(ships - 1, f.capacity), p.x, p.y);
  const fit = () => { while (f.occupiedCount > Math.max(0, Math.min(ships - 1, f.capacity))) f.dropOutermost(); };
  const loseLead = () => { ships = Math.max(1, ships - cost); fit(); p.invuln = 1.0; };
  const loseClone = (s: (typeof f.slots)[number]) => {
    ships = Math.max(1, ships - cost);
    const reserve = ships - 1 - (f.occupiedCount - 1);
    if (reserve > 0) { s.x = p.x; s.y = p.y; s.invuln = 0.6; } else f.empty(s);
    fit();
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
        if (o.kind === 'ring') continue;
        blocked.push([o.y - dn, o.y + o.h + up]);
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
    if (charge <= 0 && ships > 1) { loseLead(); charge = 0.75; }
    if (charge <= 0) return t;
    const hb = p.hitbox;
    for (const c of world.collectibles) if (c.alive && circleRect(c.x, c.y, c.r, hb.x, hb.y, hb.w, hb.h)) { c.alive = false; charge = Math.min(1, charge + 0.22); }
    for (const o of world.obstacles) {
      if (o.kind !== 'ring' || !o.alive || passed.has(o)) continue;
      let touched = touchesRing(o, hb);
      for (const s of f.slots) {
        if (touched) break;
        if (!s.occupied) continue;
        const w = 52 * s.scale * 0.7, h = 28 * s.scale * 0.7;
        touched = touchesRing(o, { x: s.x - w / 2, y: s.y - h / 2, w, h });
      }
      if (touched) { passed.add(o); charge = 1; }
    }
    if (p.invuln <= 0) for (const o of world.obstacles) {
      if (!o.alive || !hits(o, hb)) continue;
      if (ships > 1) { loseLead(); break; }
      charge -= 0.28 * L.hitDamageMul;
      p.invuln = 0.85 * L.hitGraceMul;
      if (charge <= 0) return t;
      break;
    }
    for (const s of f.slots) {
      if (!s.occupied || s.invuln > 0) continue;
      chb.w = 52 * s.scale * 0.7; chb.h = 28 * s.scale * 0.7; chb.x = s.x - chb.w / 2; chb.y = s.y - chb.h / 2;
      for (const o of world.obstacles) if (o.alive && hits(o, chb)) { loseClone(s); break; }
    }
  }
  return cap;
}


void D;
const N = Number(process.argv[2] ?? 40);
const BOSS_SEEDS = Number(process.argv[3] ?? 4);

function stage(d: number, c: Campaign, kind: 'new' | 'skilled'): number {
  setBot(kind);
  seed = 777 + d;
  let clear = 0;
  for (let i = 0; i < N; i++) {
    const t = d <= 10 ? runPack(d, 31, c) : runGold(d, 31, c);
    if (t >= 30) clear++;
  }
  return clear / N;
}

const dtB = 1 / 60;
const LANE = { W: 844, top: 70, bottom: 360, px: 160 };
/** One boss / mini-boss fight vs the skilled autopilot (as boss-sim.ts), with story tuning k. */
function fight(level: number, seedN: number, k: number): { won: boolean; hits: number; t: number } | null {
  const def = bossForLevel(level) ?? miniBossForLevel(level);
  if (!def) return null;
  const { W, top, bottom, px } = LANE;
  const f = new BossFight(def, seedN, [], k);
  let py = (top + bottom) / 2, vy = 0, charge = 1, hits = 0, inv = 0, t = 0;
  const halfH = 16;
  const rings: { x: number; y: number }[] = [];
  let r = seedN >>> 0;
  const sk = makeSkill(() => ((r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 4294967296), 0.2);
  while (f.state !== 'gone' && t < 400) {
    t += dtB;
    const pl = bossPilot(f, { px, py, halfH, top, bottom, charge, rings }, sk, dtB);
    const max = pl.boost ? 420 : 320;
    vy += pl.ay * 1800 * dtB; vy *= Math.exp(-6 * dtB); vy = Math.max(-max, Math.min(max, vy));
    py = Math.max(top + halfH, Math.min(bottom - halfH, py + vy * dtB));
    charge = Math.min(1, charge - (pl.boost ? 0.14 : 0.048) * dtB + 0.07 * dtB);
    if (charge < 0) charge = 0;
    f.update({ dt: dtB, W, top, bottom, px, py, packH: halfH * 2, boosting: pl.boost });
    for (const e of f.events) if (e.type === 'ring') rings.push({ x: e.x, y: e.y });
    f.events.length = 0;
    for (const q of rings) q.x -= 260 * dtB;
    for (let i = rings.length - 1; i >= 0; i--) {
      const q = rings[i];
      if (Math.abs(q.x - px) < 45 && Math.abs(q.y - py) < 60 + halfH) { f.stunHit(); charge = 1; rings.splice(i, 1); }
      else if (q.x < -50) rings.splice(i, 1);
    }
    inv = Math.max(0, inv - dtB);
    if (inv <= 0) {
      let hit = f.bodyHits(px - 20, py - halfH, 40, halfH * 2);
      for (const s of f.shots) if (BossFight.harmful(s) && BossFight.shotHits(s, px - 20, py - halfH, 40, halfH * 2)) { hit = true; s.alive = false; }
      if (hit) { hits++; inv = BOSS_HIT_GRACE; f.clearNear(px, py, BOSS_MERCY_R); }
    }
  }
  return { won: f.hp <= 0, hits, t: f.endT };
}

function bossRow(level: number, c: Campaign): { win: number; hits: number } {
  let win = 0, hits = 0, n = 0;
  for (let s = 0; s < BOSS_SEEDS; s++) {
    const res = fight(level, 1000 + s * 7919 + level, campaignMult(c, level));
    if (!res) return { win: 1, hits: 0 };
    n++;
    if (res.won) win++;
    hits += res.hits;
  }
  return { win: win / n, hits: hits / n };
}

const camps: Campaign[] = ['dog', 'part2', 'platypus'];
const levels = process.env.LEVELS ? process.env.LEVELS.split(',').map(Number) : Array.from({ length: 111 }, (_, i) => i + 1);
const rows: Record<string, unknown>[] = [];
const summary: Record<string, { minSkilled: number; minAt: number; meanSkilled: number; meanNew: number; bossMin: number; bossAt: number; allCleared: boolean }> = {};
for (const c of camps) summary[c] = { minSkilled: 1, minAt: 0, meanSkilled: 0, meanNew: 0, bossMin: 1, bossAt: 0, allCleared: true };
for (const d of levels) {
  const row: Record<string, unknown> = { L: d };
  for (const c of camps) {
    const sk = stage(d, c, 'skilled');
    const nw = stage(d, c, 'new');
    const b = bossRow(d, c);
    const lv = campaignLevers(d, c);
    const S = summary[c];
    S.meanSkilled += sk / levels.length;
    S.meanNew += nw / levels.length;
    if (sk < S.minSkilled) { S.minSkilled = sk; S.minAt = d; }
    if (b.win < S.bossMin) { S.bossMin = b.win; S.bossAt = d; }
    if (sk === 0 || b.win === 0) S.allCleared = false;
    row[`${c}_k`] = +campaignMult(c, d).toFixed(3);
    row[`${c}_spd`] = +lv.speed.toFixed(3);
    row[`${c}_den`] = +lv.density.toFixed(3);
    row[`${c}_skill%`] = Math.round(sk * 100);
    row[`${c}_new%`] = Math.round(nw * 100);
    row[`${c}_boss%`] = Math.round(b.win * 100);
  }
  rows.push(row);
  console.log(JSON.stringify(row));
}
console.log('SUMMARY ' + JSON.stringify(summary, null, 1));

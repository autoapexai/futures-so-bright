// MINI-BOSS sim: mini-bosses vs the skilled autopilot (same bot as boss-sim.ts), several seeds,
// both phone orientations and GAME SPEED 1.0 / 5.5 / 11.1, next to the big bosses for scale.
// Run: npx tsx scripts/mini-sim.ts
import { BOSSES, BOSS_HIT_GRACE, BOSS_MERCY_R, BossFight, bossForLevel, easedTuning } from '../src/systems/Boss';
import { miniBossForLevel, miniTuning } from '../src/systems/miniBoss';
import { bossPilot, makeSkill } from '../src/systems/bossAutopilot';

const dt = 1 / 60;
interface Lane { W: number; top: number; bottom: number; px: number }
const LANDSCAPE: Lane = { W: 844, top: 70, bottom: 360, px: 160 };
/** A 390x844 phone held upright: HUD reserve on top, touch-control reserve at the bottom. */
const PORTRAIT: Lane = { W: 390, top: 70, bottom: 658, px: 70 };
/**
 * One fight. `speed` is the GAME SPEED: the sim runs in game time, and the bot's human-ish
 * re-plan lag (0.2 s of wall-clock time) becomes 0.2 x speed of game time.
 */
function fight(def: (typeof BOSSES)[number], seed: number, lane: Lane = LANDSCAPE, speed = 1) {
  const { W, top, bottom, px } = lane;
  const f = new BossFight(def, seed);
  let py = (top + bottom) / 2, vy = 0, charge = 1, hits = 0, inv = 0;
  const halfH = 16;
  const rings: { x: number; y: number }[] = [];
  let t = 0;
  let r = seed >>> 0;
  const sk = makeSkill(() => ((r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 4294967296), 0.2 * speed);
  while (f.state !== 'gone' && t < 400) {
    t += dt;
    const pl = bossPilot(f, { px, py, halfH, top, bottom, charge, rings }, sk, dt);
    const max = pl.boost ? 420 : 320;
    vy += pl.ay * 1800 * dt; vy *= Math.exp(-6 * dt); vy = Math.max(-max, Math.min(max, vy));
    py = Math.max(top + halfH, Math.min(bottom - halfH, py + vy * dt));
    charge = Math.min(1, charge - (pl.boost ? 0.14 : 0.048) * dt + 0.07 * dt);
    if (charge < 0) charge = 0;
    f.update({ dt, W, top, bottom, px, py, packH: halfH * 2, boosting: pl.boost, ...(speed !== 1 ? { speed } : {}) });
    for (const e of f.events) if (e.type === 'ring') rings.push({ x: e.x, y: e.y });
    f.events.length = 0;
    for (const r of rings) r.x -= 260 * dt;
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      if (Math.abs(r.x - px) < 45 && Math.abs(r.y - py) < 60 + halfH) { f.stunHit(); charge = 1; rings.splice(i, 1); }
      else if (r.x < -50) rings.splice(i, 1);
    }
    inv = Math.max(0, inv - dt);
    if (inv <= 0) {
      let hit = f.bodyHits(px - 20, py - halfH, 40, halfH * 2);
      for (const s of f.shots) if (BossFight.harmful(s) && BossFight.shotHits(s, px - 20, py - halfH, 40, halfH * 2)) { hit = true; s.alive = false; }
      if (hit) { hits++; inv = BOSS_HIT_GRACE; f.clearNear(px, py, BOSS_MERCY_R); }
    }
  }
  return { t: f.endT, won: f.hp <= 0, hits };
}
const SEEDS = [1, 2, 3, 4, 5, 6].map((s) => 1000 + s * 7919);
const rows = [];
const LEVELS = [1, 2, 5, 9, 10, 11, 15, 29, 31, 49, 59, 60, 61, 79, 89, 90, 91, 99, 109, 110, 111];
for (const L of LEVELS) {
  const def = bossForLevel(L) ?? miniBossForLevel(L, true);
  if (!def) continue;
  const tu = def.mini ? miniTuning(L) : easedTuning(def);
  for (const [lname, lane] of [['landscape', LANDSCAPE], ['portrait', PORTRAIT]] as const) {
    for (const speed of [1, 5.5, 11.1]) {
      if (!def.mini && speed !== 1) continue;
      const res = SEEDS.map((s) => fight(def, s, lane, speed));
      const won = res.filter((r) => r.won);
      const mean = won.reduce((a, r) => a + r.t, 0) / Math.max(1, won.length);
      rows.push({ L, kind: def.mini ? 'mini' : 'BIG', name: def.name, lane: lname, speed, hp: tu.hp, fire: tu.fireEvery, volley: tu.volley, shot: tu.shotSpeed, win: `${won.length}/${SEEDS.length}`, fightS: +mean.toFixed(1), realS: +(mean / speed).toFixed(1), hitsAvg: +(res.reduce((a, r) => a + r.hits, 0) / SEEDS.length).toFixed(1) });
    }
  }
}
console.table(rows);
void BOSSES;

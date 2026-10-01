// Boss sim: each boss vs the skilled autopilot, several seeds. npx tsx scripts/boss-sim.ts
import { BOSSES, BOSS_HIT_GRACE, BOSS_MERCY_R, BossFight, bossTuning } from '../src/systems/Boss';
import { bossPilot, makeSkill } from '../src/systems/bossAutopilot';

const W = 844, top = 70, bottom = 360, dt = 1 / 60;
function fight(def: (typeof BOSSES)[number], seed: number) {
  const f = new BossFight(def, seed);
  let py = (top + bottom) / 2, vy = 0, charge = 1, hits = 0, inv = 0;
  const px = 160, halfH = 16;
  const rings: { x: number; y: number }[] = [];
  let t = 0;
  let r = seed >>> 0;
  const sk = makeSkill(() => ((r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 4294967296));
  while (f.state !== 'gone' && t < 400) {
    t += dt;
    const pl = bossPilot(f, { px, py, halfH, top, bottom, charge, rings }, sk, dt);
    const max = pl.boost ? 420 : 320;
    vy += pl.ay * 1800 * dt; vy *= Math.exp(-6 * dt); vy = Math.max(-max, Math.min(max, vy));
    py = Math.max(top + halfH, Math.min(bottom - halfH, py + vy * dt));
    charge = Math.min(1, charge - (pl.boost ? 0.14 : 0.048) * dt + 0.07 * dt);
    if (charge < 0) charge = 0;
    f.update({ dt, W, top, bottom, px, py, packH: halfH * 2, boosting: pl.boost });
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
const rows = [];
for (const def of BOSSES) {
  const tu = bossTuning(def.rank);
  const res = [1, 2, 3, 4, 5, 6, 7, 8].map((s) => fight(def, 1000 + s * 7919));
  const won = res.filter((r) => r.won);
  const mean = won.reduce((a, r) => a + r.t, 0) / Math.max(1, won.length);
  rows.push({ L: def.level, boss: def.modeId, hp: tu.hp, fire: tu.fireEvery, volley: tu.volley, speed: tu.shotSpeed, stun: tu.stun, bored: tu.bored, win: `${won.length}/8`, fightS: +mean.toFixed(1), hitsAvg: +(res.reduce((a, r) => a + r.hits, 0) / 8).toFixed(1) });
}
console.table(rows);

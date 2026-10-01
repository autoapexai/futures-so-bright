// Seeded randomness: same run seed -> identical fight; different seeds -> different fights.
import { BOSSES, BossFight } from '../src/systems/Boss';
function log(def: (typeof BOSSES)[number], seed: number): string {
  const f = new BossFight(def, seed);
  const out: string[] = [];
  for (let i = 0; i < 60 * 25; i++) {
    f.update({ dt: 1 / 60, W: 844, top: 70, bottom: 360, px: 160, py: 200 + Math.sin(i / 40) * 80, packH: 32, boosting: i % 3 === 0 });
    for (const e of f.events) out.push(e.type === 'taunt' ? `T:${e.text}` : e.type === 'ring' ? `R:${e.y.toFixed(0)}` : e.type);
    f.events.length = 0;
    if (i % 30 === 0) out.push(`S${f.boards.map((b) => b.spot).join('')}:${f.shots.length}`);
  }
  return out.join('|');
}
let ok = true;
for (const def of BOSSES) {
  const a = log(def, 424242), b = log(def, 424242), c = log(def, 777);
  const same = a === b, diff = a !== c;
  if (!same || !diff) ok = false;
  console.log(def.level, def.modeId.padEnd(14), 'same-seed identical:', same, ' other seed differs:', diff, ' first taunt:', a.split('|')[0]);
}
console.log(ok ? 'SEED CHECK OK' : 'SEED CHECK FAILED');

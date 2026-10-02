/**
 * Test-only boss autopilot (used by the boss sim and the FSB_TEST build's video runs; never
 * imported by the shipping game). A "skilled bot": dodges predicted shot paths, lines up with
 * the weak spot, grabs stun rings, and boosts (barks) when lined up.
 */
import { BossFight } from './Boss';

export interface PilotView {
  px: number;
  py: number;
  /** Half the pack's height (hit area around the lead). */
  halfH: number;
  top: number;
  bottom: number;
  charge: number;
  rings: { x: number; y: number }[];
}

/** Human-ish handicap: re-plans every `lag` s and aims with a random offset (fraction of a row). */
export interface PilotSkill {
  lag: number;
  noise: number;
  rnd: () => number;
  t: number;
  ay: number;
  off: number;
}

export function makeSkill(rnd: () => number, lag = 0.2, noise = 0.9): PilotSkill {
  return { lag, noise, rnd, t: 0, ay: 0, off: 0 };
}

export function bossPilot(f: BossFight, v: PilotView, sk?: PilotSkill, dt = 1 / 60): { ay: number; boost: boolean } {
  const b = f.main;
  const rowH = b.h / b.rows;
  const spotY = b.y - b.h / 2 + rowH * (b.spot + 0.5);
  if (sk) {
    sk.t -= dt;
    if (sk.t > 0) {
      const lined0 = f.stunned ? Math.abs(v.py - b.y) < b.h / 2 : Math.abs(v.py - spotY) < rowH * 0.6;
      return { ay: sk.ay, boost: lined0 && v.charge > 0.12 && f.state === 'fight' };
    }
    sk.t = sk.lag;
    sk.off = (sk.rnd() - 0.5) * 2 * sk.noise * rowH;
  }
  // A telegraphed hop (the next slot glows): head there early, like a player would.
  const next = f.nextSpots?.[f.boards.indexOf(b)];
  const aimY = next !== undefined ? b.y - b.h / 2 + rowH * (next + 0.5) : spotY;
  let target = (f.stunned ? b.y : aimY) + (sk ? sk.off : 0);
  const ring = v.rings.find((r) => r.x > v.px + 20 && r.x < v.px + 420);
  if (ring && !f.stunned && f.state === 'fight') target = ring.y;
  let best = v.py;
  let bestCost = Infinity;
  for (let y = v.top + v.halfH; y <= v.bottom - v.halfH; y += 12) {
    if (Math.abs(y - v.py) > 260) continue;
    let cost = Math.abs(y - target) * 0.02 + Math.abs(y - v.py) * 0.002;
    for (const s of f.shots) {
      if (s.kind === 'beam') {
        // Psychic beam (telegraphed or live): stay out of its band.
        if (s.alive && !s.spent && v.px < s.x) {
          const dy = Math.abs(y - s.y) - s.r - v.halfH;
          if (dy < 18) cost += (18 - dy) * 3;
        }
        continue;
      }
      if (s.kind === 'wave') {
        // Thought wave: be inside its safe corridor before the ring reaches the pack.
        if (!s.alive || s.spent || s.x <= v.px) continue;
        const D = Math.hypot(s.x - v.px, s.y - y);
        const rad = s.rad ?? 0;
        if (rad > D + s.r + v.halfH) continue;
        const tArr = (D - rad - s.r - v.halfH) / Math.max(1, s.vr ?? 1) + Math.max(0, -s.t);
        if (tArr < 3) {
          const gy = s.gy ?? 0;
          const gh = s.gh ?? 0;
          if (y - v.halfH - 8 < gy - gh / 2 || y + v.halfH + 8 > gy + gh / 2) cost += 80 * (1 - tArr / 3) + 10;
        }
        continue;
      }
      if (s.kind !== 'warn' && !BossFight.harmful(s) && s.kind !== 'blink') continue;
      let sx = s.x;
      let sy = s.y;
      let vx = s.vx;
      let vy = s.vy;
      if (s.kind === 'warn') {
        sx = 0;
        vx = 0.65 * f.tune.shotSpeed;
        vy = 0;
      }
      for (let t = 0; t <= 0.9; t += 0.06) {
        const x = sx + vx * t;
        const yy = sy + vy * t;
        if (Math.abs(x - v.px) > 40 + s.r) continue;
        const reachY = v.py + Math.max(-320 * t, Math.min(320 * t, y - v.py));
        const dy = Math.abs(yy - reachY) - s.r - v.halfH;
        if (dy < 26) cost += (26 - dy) * (1.2 - t);
      }
    }
    for (const bd of f.boards) {
      if (f.def.signature === 'strut' && f.slamT > 0 && Math.abs(y - bd.y) < bd.h / 2 + v.halfH + 10) cost += 40;
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = y;
    }
  }
  const ay = Math.max(-1, Math.min(1, (best - v.py) / 30));
  if (sk) sk.ay = ay;
  const lined = f.stunned ? Math.abs(v.py - b.y) < b.h / 2 : Math.abs(v.py - spotY) < rowH * 0.6;
  return { ay, boost: lined && v.charge > 0.12 && f.state === 'fight' };
}

/**
 * ON A MISSION: the player's beat-up black-and-white cop car (procedural, no sprites).
 *
 * Every hit knocks one part off (siren light, antenna, mirror, hood, trunk lid, door, bumpers,
 * hubcaps): the part tumbles away with gravity and spin, a comic burst pops and a slapstick SFX
 * plays. The car itself is never destroyed: once every part is gone, further hits only make it
 * sputter, smoke, cough and honk. Clearing a level patches it back together with duct tape.
 *
 * Drawn in car-local units (64 long, facing right, origin at the car's centre); the caller
 * scales by s = car length in px / 64. Generic look only: no names, logos or markings.
 */
import { t as tr, type Key } from '../i18n';

export type MissionSfx = 'clang' | 'tinkle' | 'siren' | 'sputter' | 'pop' | 'honk' | 'boing' | 'whistleUp' | 'whistleDown';

export type PartId = 'siren' | 'antenna' | 'mirror' | 'hood' | 'trunk' | 'door' | 'bumperF' | 'bumperR' | 'hubcapF' | 'hubcapR';

interface PartInfo {
  id: PartId;
  /** Part centre in car units (debris spins around it). */
  cx: number;
  cy: number;
  pop: Key;
  sfx: MissionSfx;
  color: string;
}

export const PARTS: readonly PartInfo[] = [
  { id: 'hubcapR', cx: -20, cy: 7, pop: 'mis_pop_hubcap', sfx: 'boing', color: '#7fffff' },
  { id: 'siren', cx: 0, cy: -18.5, pop: 'mis_pop_siren', sfx: 'siren', color: '#ff4ec8' },
  { id: 'door', cx: 0, cy: -0.5, pop: 'mis_pop_door', sfx: 'clang', color: '#ffe66d' },
  { id: 'mirror', cx: 14.5, cy: -11, pop: 'mis_pop_mirror', sfx: 'tinkle', color: '#7fffff' },
  { id: 'hood', cx: 23, cy: -5.3, pop: 'mis_pop_hood', sfx: 'whistleUp', color: '#ffe66d' },
  { id: 'bumperR', cx: -33.3, cy: 4.2, pop: 'mis_pop_bumper', sfx: 'clang', color: '#ff6b35' },
  { id: 'antenna', cx: -29.5, cy: -15.5, pop: 'mis_pop_antenna', sfx: 'boing', color: '#7fffff' },
  { id: 'trunk', cx: -23, cy: -5.4, pop: 'mis_pop_trunk', sfx: 'pop', color: '#ffe66d' },
  { id: 'hubcapF', cx: 20, cy: 7, pop: 'mis_pop_hubcap', sfx: 'boing', color: '#7fffff' },
  { id: 'bumperF', cx: 33.3, cy: 4.2, pop: 'mis_pop_bumper', sfx: 'clang', color: '#ff6b35' },
];

/** Hits with nothing left to knock off cycle through these (the car keeps going). */
const BARE: readonly { pop: Key; sfx: MissionSfx; smoke: number; sputter: number }[] = [
  { pop: 'mis_pop_sputter', sfx: 'sputter', smoke: 5, sputter: 1.2 },
  { pop: 'mis_pop_honk', sfx: 'honk', smoke: 1, sputter: 0 },
  { pop: 'mis_pop_cough', sfx: 'sputter', smoke: 7, sputter: 0.8 },
  { pop: 'mis_pop_fine', sfx: 'boing', smoke: 2, sputter: 0.4 },
  { pop: 'mis_pop_okay', sfx: 'whistleDown', smoke: 3, sputter: 0.6 },
];

interface Debris {
  id: PartId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  life: number;
}

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  max: number;
}

interface Pop {
  text: string;
  x: number;
  y: number;
  t: number;
  color: string;
}

const POP_SECONDS = 1.0;
const GRAVITY = 1250;

export class MissionCar {
  readonly attached = new Set<PartId>(PARTS.map((p) => p.id));
  debris: Debris[] = [];
  puffs: Puff[] = [];
  pops: Pop[] = [];
  hits = 0;
  /** Parts knocked off this run (for tests / the HUD). */
  lost = 0;
  private bareHits = 0;
  rattleT = 0;
  sputterT = 0;
  private smokeAcc = 0;
  private wheelA = 0;
  /** Last drawn screen position / scale (for smoke from the engine and the tailpipe). */
  private lx = 0;
  private ly = 0;
  private ls = 1;

  get partsLeft(): number {
    return this.attached.size;
  }

  reset(): void {
    for (const p of PARTS) this.attached.add(p.id);
    this.debris.length = 0;
    this.puffs.length = 0;
    this.pops.length = 0;
    this.hits = 0;
    this.lost = 0;
    this.bareHits = 0;
    this.rattleT = 0;
    this.sputterT = 0;
  }

  /** A new level: duct tape puts every part back. True if anything was missing. */
  repair(x: number, y: number, s: number): boolean {
    if (this.attached.size >= PARTS.length) return false;
    for (const p of PARTS) this.attached.add(p.id);
    this.pop(tr('mis_pop_tape'), x, y - 30 * s, '#c8c8d0');
    return true;
  }

  private pop(text: string, x: number, y: number, color: string): void {
    if (this.pops.length >= 4) this.pops.shift();
    this.pops.push({ text, x, y, t: 0, color });
  }

  private puff(x: number, y: number, r: number, vx: number, vy: number, life = 0.9): void {
    if (this.puffs.length >= 40) this.puffs.shift();
    this.puffs.push({ x, y, vx, vy, r, life, max: life });
  }

  /**
   * The car (centre x, y; scale s) is hit. Knocks a random part off if any are left, else a
   * sputter / honk / smoke gag. Returns the SFX to play.
   */
  hit(x: number, y: number, s: number, scroll: number, rnd: () => number = Math.random): MissionSfx {
    this.hits++;
    this.rattleT = 0.45;
    const left = PARTS.filter((p) => this.attached.has(p.id));
    if (left.length > 0) {
      const p = left[Math.floor(rnd() * left.length)];
      this.attached.delete(p.id);
      this.lost++;
      const px = x + p.cx * s;
      const py = y + p.cy * s;
      this.debris.push({
        id: p.id,
        x: px,
        y: py,
        vx: -scroll * 0.25 + (rnd() - 0.35) * 320,
        vy: -260 - rnd() * 240,
        rot: 0,
        vr: (rnd() < 0.5 ? -1 : 1) * (6 + rnd() * 10),
        life: 0,
      });
      if (this.debris.length > 14) this.debris.shift();
      this.puff(px, py, 5 * s, -80, -30, 0.6);
      this.pop(tr(p.pop), x, y - 30 * s, p.color);
      return p.sfx;
    }
    const g = BARE[this.bareHits++ % BARE.length];
    this.sputterT = Math.max(this.sputterT, g.sputter);
    for (let i = 0; i < g.smoke; i++) this.puff(x + (rnd() - 0.2) * 30 * s, y - (4 + rnd() * 10) * s, (4 + rnd() * 5) * s, -60 - rnd() * 120, -20 - rnd() * 60, 0.8 + rnd() * 0.6);
    this.pop(tr(g.pop), x, y - 30 * s, g.sfx === 'honk' ? '#ffe66d' : '#c8c8d0');
    return g.sfx;
  }

  update(dt: number, scroll: number, H: number): void {
    this.rattleT = Math.max(0, this.rattleT - dt);
    this.sputterT = Math.max(0, this.sputterT - dt);
    this.wheelA += dt * (8 + scroll * 0.02);
    let w = 0;
    for (const d of this.debris) {
      d.life += dt;
      d.vy += GRAVITY * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.rot += d.vr * dt;
      if (d.life < 4 && d.y < H + 80 && d.x > -120) this.debris[w++] = d;
    }
    this.debris.length = w;
    w = 0;
    for (const p of this.puffs) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += dt * 14;
      if (p.life > 0) this.puffs[w++] = p;
    }
    this.puffs.length = w;
    w = 0;
    for (const p of this.pops) {
      p.t += dt;
      if (p.t < POP_SECONDS) this.pops[w++] = p;
    }
    this.pops.length = w;
    // Running damage: no hood = the engine smokes; nothing left = smoke and a sputtering tailpipe.
    const bare = this.attached.size === 0;
    const every = bare ? 0.18 : !this.attached.has('hood') ? 0.4 : this.sputterT > 0 ? 0.12 : 0;
    if (every > 0) {
      this.smokeAcc += dt;
      if (this.smokeAcc >= every) {
        this.smokeAcc = 0;
        const s = this.ls;
        if (!this.attached.has('hood')) this.puff(this.lx + 22 * s, this.ly - 7 * s, 3 * s, -scroll * 0.35, -50, 0.8);
        if (bare || this.sputterT > 0) this.puff(this.lx - 34 * s, this.ly + 4 * s, 3.5 * s, -scroll * 0.4, -12, 0.7);
      }
    } else this.smokeAcc = 0;
  }

  /** The car itself at (x, y), tilt in radians, scale s. */
  draw(ctx: CanvasRenderingContext2D, x: number, y: number, tilt: number, s: number, time: number, lite: boolean, lens: string, alpha = 1): void {
    this.lx = x;
    this.ly = y;
    this.ls = s;
    let jx = 0;
    let jy = 0;
    if (this.rattleT > 0) {
      jx = Math.sin(time * 90) * 1.6 * this.rattleT;
      jy = Math.cos(time * 75) * 1.2 * this.rattleT;
    }
    if (this.sputterT > 0) jy += Math.floor(time * 14) % 2 === 0 ? -1.4 : 0.6;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x + jx * s, y + jy * s);
    ctx.rotate(tilt);
    ctx.scale(s, s);
    paintCar(ctx, this.attached, time, this.wheelA, lite, lens, this.sputterT > 0);
    ctx.restore();
  }

  /** Flying parts, smoke and comic bursts (over the car). u = the HUD's unit scale. */
  drawFx(ctx: CanvasRenderingContext2D, s: number, W: number, u: (n: number) => number, time: number, lite: boolean): void {
    ctx.save();
    for (const p of this.puffs) {
      const k = p.life / p.max;
      ctx.globalAlpha = 0.55 * k;
      ctx.fillStyle = k > 0.6 ? '#b8b8c6' : '#7c7c8c';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    for (const d of this.debris) {
      const info = PARTS.find((p) => p.id === d.id);
      if (!info) continue;
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      ctx.scale(s, s);
      ctx.translate(-info.cx, -info.cy);
      paintPart(ctx, d.id, time, d.rot, lite);
      ctx.restore();
    }
    for (const p of this.pops) {
      const k = p.t / POP_SECONDS;
      const sc = k < 0.12 ? 0.5 + (k / 0.12) * 0.8 : 1.3 - (k - 0.12) * 0.35;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - k * k);
      ctx.font = `900 ${u(17)}px 'Orbitron', sans-serif`;
      const tw = ctx.measureText(p.text).width;
      const half = (tw * 1.3) / 2 + 6;
      ctx.translate(Math.max(half + 4, Math.min(W - half - 4, p.x)), Math.max(u(40), p.y - k * 34));
      ctx.rotate(-0.1);
      ctx.scale(sc, sc);
      // Comic starburst behind the word.
      const rx = tw / 2 + u(14);
      const ry = u(19);
      ctx.beginPath();
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const r = i % 2 === 0 ? 1 : 0.72;
        const px = Math.cos(a) * rx * r;
        const py = Math.sin(a) * ry * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(20, 0, 34, 0.82)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = p.color;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#140022';
      ctx.strokeText(p.text, 0, 1);
      if (!lite) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = p.color;
      }
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, 0, 1);
      ctx.restore();
    }
    ctx.restore();
  }
}

// --- painting (car units) ---------------------------------------------------------------------

const BLACK = '#15151c';
const WHITE = '#efeff2';
const CHROME = '#cfd6e0';
const NEON = 'rgba(127, 255, 255, 0.7)';

function bodyPath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(-32.5, 6);
  ctx.lineTo(-33, -1.5);
  ctx.lineTo(-31.5, -6);
  ctx.lineTo(-15.5, -6.5);
  ctx.lineTo(-11, -16.5);
  ctx.lineTo(6.5, -16.5);
  ctx.lineTo(14.5, -6.5);
  ctx.lineTo(31, -6);
  ctx.lineTo(33, -2.5);
  ctx.lineTo(33.5, 6);
  ctx.closePath();
}

/** The whole car: chassis, cabin, sunglasses on the dash, wheels, then each part still on. */
function paintCar(ctx: CanvasRenderingContext2D, on: Set<PartId>, time: number, wheelA: number, lite: boolean, lens: string, sputter: boolean): void {
  // Hover glow + tailpipe flame (it's still the future).
  ctx.fillStyle = 'rgba(0, 240, 255, 0.16)';
  ctx.beginPath();
  ctx.ellipse(0, 15, 30, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();
  const flick = 0.7 + Math.sin(time * 40) * 0.3;
  if (!sputter || Math.floor(time * 14) % 2 === 0) {
    ctx.fillStyle = `rgba(0, 255, 255, ${0.55 * flick})`;
    ctx.beginPath();
    ctx.moveTo(-33, 2.5);
    ctx.lineTo(-33 - 13 * flick, 4);
    ctx.lineTo(-33, 5.5);
    ctx.closePath();
    ctx.fill();
  }

  // Chassis.
  ctx.fillStyle = BLACK;
  if (!lite) {
    ctx.shadowBlur = 12;
    ctx.shadowColor = '#00f0ff';
  }
  bodyPath(ctx);
  ctx.fill();
  ctx.shadowBlur = 0;
  // White roof and the white door band (classic black-and-white).
  ctx.fillStyle = WHITE;
  ctx.beginPath();
  ctx.moveTo(-11, -16.5);
  ctx.lineTo(6.5, -16.5);
  ctx.lineTo(7.4, -15.2);
  ctx.lineTo(-11.6, -15.2);
  ctx.closePath();
  ctx.fill();
  // Windows (dark glass) with the B-pillar.
  ctx.fillStyle = '#1d2c4a';
  ctx.beginPath();
  ctx.moveTo(-13.6, -7.2);
  ctx.lineTo(-10, -14.6);
  ctx.lineTo(5.6, -14.6);
  ctx.lineTo(12, -7.2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(127, 255, 255, 0.18)';
  ctx.beginPath();
  ctx.moveTo(-9, -14);
  ctx.lineTo(-6.5, -14);
  ctx.lineTo(-10, -8);
  ctx.lineTo(-12, -8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = BLACK;
  ctx.fillRect(-1.6, -14.8, 2, 7.8);
  // Duct tape across the rear window crack.
  ctx.strokeStyle = 'rgba(200, 200, 210, 0.85)';
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.moveTo(-11.5, -11.5);
  ctx.lineTo(-4.5, -9.5);
  ctx.stroke();
  // Sunglasses on the dash (front window, bottom edge). The lenses glint with the shade charge.
  ctx.save();
  ctx.translate(6.4, -8.6);
  ctx.fillStyle = '#050508';
  ctx.beginPath();
  ctx.moveTo(-4.4, -1.6);
  ctx.lineTo(4.4, -1.6);
  ctx.lineTo(4.1, 0.2);
  ctx.quadraticCurveTo(3.4, 1.8, 1.8, 1.4);
  ctx.lineTo(0.6, -0.2);
  ctx.lineTo(-0.6, -0.2);
  ctx.lineTo(-1.8, 1.4);
  ctx.quadraticCurveTo(-3.4, 1.8, -4.1, 0.2);
  ctx.closePath();
  ctx.fill();
  const glint = 0.55 + 0.45 * Math.max(0, Math.sin(time * 2.4));
  ctx.globalAlpha *= glint;
  ctx.fillStyle = lens;
  ctx.fillRect(-3.5, -1.1, 1.1, 0.9);
  ctx.fillRect(1.6, -1.1, 1.1, 0.9);
  ctx.restore();

  // Under the parts: what shows when they're gone.
  if (!on.has('door')) {
    ctx.fillStyle = '#2a0d2e';
    ctx.fillRect(-12.5, -6, 25, 11);
    ctx.fillStyle = '#6b1f3a';
    ctx.fillRect(-10, -5.5, 6, 8.5); // seat back
    ctx.strokeStyle = '#8a8a96';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(8, -2.5, 2.6, 0, Math.PI * 2); // steering wheel
    ctx.stroke();
  }
  if (!on.has('hood')) {
    ctx.fillStyle = '#5a5a66';
    ctx.fillRect(16, -7.6, 12, 3.4);
    ctx.fillStyle = `rgba(255, 107, 53, ${0.5 + 0.3 * Math.sin(time * 9)})`;
    ctx.fillRect(18, -8.4, 3, 1.2);
    ctx.fillRect(23.5, -8.4, 3, 1.2);
  }
  if (!on.has('trunk')) {
    ctx.fillStyle = '#07070a';
    ctx.fillRect(-30.5, -7.2, 14.5, 3);
    ctx.strokeStyle = '#3a3a44';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(-23, -5.6, 3.2, Math.PI, Math.PI * 2); // spare tire
    ctx.stroke();
  }

  // Dents, rust and the lights that never fall off.
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(-26, 0.5, 2.6, -0.3, 1.9);
  ctx.moveTo(27, 1);
  ctx.arc(26, 1, 2.2, 0.2, 2.4);
  ctx.stroke();
  ctx.fillStyle = '#7a3b12';
  for (const [rx, ry, rr] of [[-29, 3.5, 1.1], [-17, 4.4, 0.8], [28.5, 4.2, 0.9], [15.5, -4.6, 0.7]] as const) {
    ctx.beginPath();
    ctx.arc(rx, ry, rr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ffe66d';
  if (!lite) {
    ctx.shadowBlur = 8;
    ctx.shadowColor = '#ffe66d';
  }
  ctx.fillRect(31.4, -4.6, 2, 2.4); // headlight
  ctx.fillStyle = '#ff3355';
  ctx.shadowColor = '#ff3355';
  ctx.fillRect(-33.2, -4.2, 1.6, 2.4); // tail light
  ctx.shadowBlur = 0;

  // Neon rim (the game's look).
  ctx.strokeStyle = NEON;
  ctx.lineWidth = 0.7;
  bodyPath(ctx);
  ctx.stroke();

  // Wheels (always stay on).
  for (const wx of [-20, 20]) {
    ctx.fillStyle = '#08080b';
    ctx.beginPath();
    ctx.arc(wx, 7, 6.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(127, 255, 255, 0.45)';
    ctx.lineWidth = 0.7;
    ctx.stroke();
    const cap = wx < 0 ? 'hubcapR' : 'hubcapF';
    if (!on.has(cap)) {
      ctx.fillStyle = '#6b4a2a';
      ctx.beginPath();
      ctx.arc(wx, 7, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2a1a0c';
      for (let i = 0; i < 4; i++) {
        const a = wheelA + (i * Math.PI) / 2;
        ctx.fillRect(wx + Math.cos(a) * 1.5 - 0.35, 7 + Math.sin(a) * 1.5 - 0.35, 0.7, 0.7);
      }
    }
  }

  for (const p of PARTS) if (on.has(p.id)) paintPart(ctx, p.id, time, wheelA, lite);
}

/** One removable part, in car units (the same drawing on the car and tumbling away). */
function paintPart(ctx: CanvasRenderingContext2D, id: PartId, time: number, spin: number, lite: boolean): void {
  switch (id) {
    case 'siren': {
      ctx.fillStyle = '#2a2a33';
      ctx.fillRect(-6.5, -17.2, 13, 1.4);
      const on = Math.floor(time * 6) % 2 === 0;
      if (!lite) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = on ? '#ff2244' : '#2266ff';
      }
      ctx.fillStyle = on ? '#ff2244' : '#7a1020';
      ctx.beginPath();
      ctx.moveTo(-6, -17.2);
      ctx.lineTo(-5.4, -20.4);
      ctx.lineTo(-0.6, -20.4);
      ctx.lineTo(-0.4, -17.2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = on ? '#16307a' : '#2a66ff';
      ctx.beginPath();
      ctx.moveTo(0.4, -17.2);
      ctx.lineTo(0.6, -20.4);
      ctx.lineTo(5.4, -20.4);
      ctx.lineTo(6, -17.2);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      break;
    }
    case 'antenna':
      ctx.strokeStyle = CHROME;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(-28, -6);
      ctx.quadraticCurveTo(-29, -16, -31, -25);
      ctx.stroke();
      ctx.fillStyle = '#ff6b35';
      ctx.beginPath();
      ctx.arc(-31, -25, 1, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'mirror':
      ctx.strokeStyle = BLACK;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(12.6, -7.6);
      ctx.lineTo(14, -9.8);
      ctx.stroke();
      ctx.fillStyle = BLACK;
      ctx.fillRect(13, -12.6, 3.2, 3);
      ctx.fillStyle = CHROME;
      ctx.fillRect(15.4, -12.2, 0.7, 2.2);
      break;
    case 'hood':
      ctx.fillStyle = '#1e1e27';
      ctx.beginPath();
      ctx.moveTo(14.5, -6.6);
      ctx.lineTo(31, -6.1);
      ctx.lineTo(32.4, -3.6);
      ctx.lineTo(15.2, -4.2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(16, -5.9);
      ctx.lineTo(29.5, -5.5);
      ctx.stroke();
      break;
    case 'trunk':
      ctx.fillStyle = '#1e1e27';
      ctx.beginPath();
      ctx.moveTo(-31.4, -6);
      ctx.lineTo(-15.6, -6.6);
      ctx.lineTo(-15.2, -4.2);
      ctx.lineTo(-31.8, -3.6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(-30, -5.4);
      ctx.lineTo(-17, -5.8);
      ctx.stroke();
      break;
    case 'door':
      ctx.fillStyle = WHITE;
      ctx.fillRect(-12.5, -6, 25, 11);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(-12.5, -6, 25, 11);
      ctx.beginPath();
      ctx.moveTo(-0.6, -6);
      ctx.lineTo(-0.6, 5);
      ctx.stroke();
      // a dent and the handles
      ctx.beginPath();
      ctx.arc(-6, 1.5, 2.2, 0.4, 2.6);
      ctx.stroke();
      ctx.fillStyle = CHROME;
      ctx.fillRect(-4.6, -4.4, 2.6, 0.7);
      ctx.fillRect(8, -4.4, 2.6, 0.7);
      break;
    case 'bumperF':
    case 'bumperR': {
      const x = id === 'bumperF' ? 31.6 : -35;
      ctx.fillStyle = CHROME;
      ctx.fillRect(x, 2.4, 3.4, 3.6);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillRect(x + 0.4, 2.8, 2.6, 0.7);
      break;
    }
    case 'hubcapF':
    case 'hubcapR': {
      const wx = id === 'hubcapF' ? 20 : -20;
      ctx.fillStyle = CHROME;
      ctx.beginPath();
      ctx.arc(wx, 7, 3.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#7a8290';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = spin + (i * Math.PI * 2) / 5;
        ctx.moveTo(wx, 7);
        ctx.lineTo(wx + Math.cos(a) * 3.4, 7 + Math.sin(a) * 3.4);
      }
      ctx.stroke();
      break;
    }
  }
}

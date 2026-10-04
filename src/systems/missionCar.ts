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

export type MissionSfx = 'clang' | 'tinkle' | 'siren' | 'squeal' | 'sputter' | 'pop' | 'honk' | 'boing' | 'whistleUp' | 'whistleDown';

/**
 * The car's extents around its centre in car units (x the painter's scale): CAR_UP to the top of
 * the roof loudspeaker (+ its halo), CAR_DOWN to the wheels + hover glow, CAR_HALF to either end.
 * Decorative only: the hitbox is the player's (Game.ts), not these.
 */
export const CAR_UP = 35;
export const CAR_DOWN = 19;
export const CAR_HALF = 36;

export type PartId = 'speaker' | 'siren' | 'antenna' | 'mirror' | 'hood' | 'trunk' | 'door' | 'bumperF' | 'bumperR' | 'hubcapF' | 'hubcapR';

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
  // Painted after the other parts (see paintCar), so its rack sits over the light bar.
  { id: 'speaker', cx: -2, cy: -26, pop: 'mis_pop_speaker', sfx: 'squeal', color: '#ffffff' },
  { id: 'siren', cx: 0, cy: -20.2, pop: 'mis_pop_siren', sfx: 'siren', color: '#ff4ec8' },
  { id: 'door', cx: -0.2, cy: -0.9, pop: 'mis_pop_door', sfx: 'clang', color: '#ffe66d' },
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
  /** The car's centre y when it popped, and how far above / below it the burst sits. */
  y: number;
  off: number;
  t: number;
  color: string;
}

/** Where comic bursts may go: under the HUD and above the touch controls (view units). */
export interface PopBounds {
  top: number;
  bottom: number;
  /** On-screen controls to keep clear of (stick, BOOST), view units. */
  avoid: readonly { x: number; y: number; w: number; h: number }[];
}

const POP_SECONDS = 1.0;
const GRAVITY = 1250;

export class MissionCar {
  readonly attached = new Set<PartId>(PARTS.map((p) => p.id));
  debris: Debris[] = [];
  puffs: Puff[] = [];
  pops: Pop[] = [];
  /** Where the last frame drew each comic burst (view units, at its 1.3x peak size; for tests). */
  popRects: { x: number; y: number; w: number; h: number }[] = [];
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
    this.pop(tr('mis_pop_tape'), x, y, s, '#e0e0ea');
    return true;
  }

  private pop(text: string, x: number, y: number, s: number, color: string): void {
    if (this.pops.length >= 3) this.pops.shift();
    this.pops.push({ text, x: x + 6 * s, y, off: 34 * s, t: 0, color });
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
      this.pop(tr(p.pop), x, y, s, p.color);
      return p.sfx;
    }
    const g = BARE[this.bareHits++ % BARE.length];
    this.sputterT = Math.max(this.sputterT, g.sputter);
    for (let i = 0; i < g.smoke; i++) this.puff(x + (rnd() - 0.2) * 30 * s, y - (4 + rnd() * 10) * s, (4 + rnd() * 5) * s, -60 - rnd() * 120, -20 - rnd() * 60, 0.8 + rnd() * 0.6);
    this.pop(tr(g.pop), x, y, s, g.sfx === 'honk' ? '#ffe66d' : '#e0e0ea');
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
    // Smoke goes behind the car, so a smoking wreck still reads as a car.
    ctx.save();
    for (const p of this.puffs) {
      const k = p.life / p.max;
      ctx.globalAlpha = 0.42 * k;
      ctx.fillStyle = k > 0.6 ? '#b8b8c6' : '#7c7c8c';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x + jx * s, y + jy * s);
    ctx.rotate(tilt);
    ctx.scale(s, s);
    paintCar(ctx, this.attached, time, this.wheelA, lite, lens, this.sputterT > 0);
    ctx.restore();
  }

  /**
   * Flying parts, smoke and comic bursts (over the car). u = the HUD's unit scale. Bursts sit just
   * above the car, or just below it when above would reach the HUD, and always inside `pb`.
   */
  drawFx(ctx: CanvasRenderingContext2D, s: number, W: number, u: (n: number) => number, time: number, lite: boolean, pb: PopBounds): void {
    ctx.save();
    ctx.globalAlpha = 1;
    this.popRects.length = 0;
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
    // Lay the bursts out newest first, so a fresh one sits by the car and older ones step aside
    // (never over the HUD, the touch controls, the car or each other), then draw oldest first.
    const s0 = this.ls;
    const car = { x: this.lx - CAR_HALF * s0, y: this.ly - CAR_UP * s0, w: 2 * CAR_HALF * s0, h: (CAR_UP + CAR_DOWN) * s0 };
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const lay: { p: Pop; cx: number; cy: number; fs: number; rx: number; ry: number; sc: number; k: number }[] = [];
    for (let n = this.pops.length - 1; n >= 0; n--) {
      const p = this.pops[n];
      const k = p.t / POP_SECONDS;
      const sc = k < 0.12 ? 0.5 + (k / 0.12) * 0.8 : 1.3 - (k - 0.12) * 0.35;
      let fs = u(15);
      ctx.font = `900 ${fs}px 'Orbitron', sans-serif`;
      let tw = ctx.measureText(p.text).width;
      // Fit the burst (at its 1.3x peak) to the lane width (long words on narrow portrait lanes).
      const maxW = W - 16;
      const full = (tw + 2 * u(12)) * 1.3;
      if (full > maxW) {
        fs *= maxW / full;
        ctx.font = `900 ${fs}px 'Orbitron', sans-serif`;
        tw = ctx.measureText(p.text).width;
      }
      const rx = tw / 2 + u(12);
      const ry = fs * 1.05;
      const halfW = rx * 1.3 + 4;
      const halfH = ry * 1.3 + 4;
      const lo = pb.top + halfH;
      const hi = Math.max(lo, pb.bottom - halfH);
      // Preferred spot: just above the car (rising), else just below it. Then the nearest spot
      // that is clear of the HUD, the touch controls, the car and the newer bursts.
      const above = p.y - p.off - halfH * 0.4 - k * u(18);
      const below = p.y + p.off + halfH * 0.4 + k * u(10);
      const clampY = (y: number): number => Math.max(lo, Math.min(hi, y));
      const clampX = (x: number): number => Math.max(halfW, Math.min(W - halfW, x));
      const prefY = clampY(above >= lo ? above : below);
      const prefX = clampX(p.x);
      const blocks = [...pb.avoid, car, ...placed];
      const free = (x: number, y: number): boolean =>
        !blocks.some((r) => x + halfW > r.x && x - halfW < r.x + r.w && y + halfH > r.y && y - halfH < r.y + r.h);
      const ys = [prefY, clampY(above), clampY(below)];
      for (let y = lo; y <= hi; y += halfH * 0.5) ys.push(y);
      const xs = [prefX];
      for (const r of pb.avoid) xs.push(clampX(r.x + r.w + halfW + 2), clampX(r.x - halfW - 2));
      let best: { x: number; y: number } | null = null;
      let bestCost = Infinity;
      for (const y of ys) {
        for (const x of xs) {
          const cost = Math.abs(y - prefY) + Math.abs(x - prefX) * 0.6;
          if (cost < bestCost && free(x, y)) {
            best = { x, y };
            bestCost = cost;
          }
        }
      }
      // No free spot: an older burst is dropped (it was about to fade anyway); the newest stays put.
      if (!best && n < this.pops.length - 1) continue;
      const cx = best ? best.x : prefX;
      const cy = best ? best.y : prefY;
      const rect = { x: cx - halfW, y: cy - halfH, w: halfW * 2, h: halfH * 2 };
      placed.push(rect);
      this.popRects.push(rect);
      lay.push({ p, cx, cy, fs, rx, ry, sc, k });
    }
    for (let n = lay.length - 1; n >= 0; n--) {
      const { p, cx, cy, fs, rx, ry, sc, k } = lay[n];
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - k * k);
      ctx.font = `900 ${fs}px 'Orbitron', sans-serif`;
      ctx.translate(cx, cy);
      ctx.rotate(-0.08);
      ctx.scale(sc, sc);
      // Comic starburst behind the word.
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

const BLACK = '#0c0c12';
const BLACK_HI = '#2c2c3a';
const WHITE = '#ffffff';
const WHITE_SH = '#c9cfdc';
const CHROME = '#dfe6f0';
const GLASS = '#3d6f99';
const GLASS_HI = 'rgba(190, 240, 255, 0.55)';
const RIM = 'rgba(255, 255, 255, 0.95)';
const HALO = 'rgba(160, 235, 255, 0.28)';

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

function cabinPath(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(-15.5, -6.5);
  ctx.lineTo(-11, -16.5);
  ctx.lineTo(6.5, -16.5);
  ctx.lineTo(14.5, -6.5);
  ctx.closePath();
}

/**
 * The whole car: a white halo + rim so it reads on the dark purple lanes, black chassis (hood,
 * trunk, fenders), white roof and doors, light glass with sunglasses on the dash, wheels, then
 * each part still on.
 */
function paintCar(ctx: CanvasRenderingContext2D, on: Set<PartId>, time: number, wheelA: number, lite: boolean, lens: string, sputter: boolean): void {
  // Hover glow + tailpipe flame (it's still the future).
  ctx.fillStyle = 'rgba(0, 240, 255, 0.28)';
  ctx.beginPath();
  ctx.ellipse(0, 15.5, 31, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();
  const flick = 0.7 + Math.sin(time * 40) * 0.3;
  if (!sputter || Math.floor(time * 14) % 2 === 0) {
    ctx.fillStyle = `rgba(0, 255, 255, ${0.75 * flick})`;
    ctx.beginPath();
    ctx.moveTo(-33, 2.2);
    ctx.lineTo(-33 - 15 * flick, 4);
    ctx.lineTo(-33, 5.8);
    ctx.closePath();
    ctx.fill();
  }

  // Halo: a soft light outline (no shadowBlur, so it shows on lite / phone renders too).
  ctx.lineJoin = 'round';
  ctx.strokeStyle = HALO;
  ctx.lineWidth = 4.2;
  bodyPath(ctx);
  ctx.stroke();
  if (!lite) {
    ctx.shadowBlur = 14;
    ctx.shadowColor = 'rgba(140, 230, 255, 0.9)';
  }
  // Chassis: black (hood, trunk, fenders).
  ctx.fillStyle = BLACK;
  bodyPath(ctx);
  ctx.fill();
  ctx.shadowBlur = 0;
  // A sheen line along the black body.
  ctx.strokeStyle = BLACK_HI;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(-31, -3.2);
  ctx.lineTo(31.5, -3);
  ctx.stroke();

  // White roof + pillars (the black-and-white's white top).
  ctx.fillStyle = WHITE;
  cabinPath(ctx);
  ctx.fill();
  // Glass: light tinted so the black sunglasses on the dash stand out.
  ctx.fillStyle = GLASS;
  ctx.beginPath(); // rear side window
  ctx.moveTo(-13, -7.4);
  ctx.lineTo(-9.4, -14.6);
  ctx.lineTo(-2.2, -14.6);
  ctx.lineTo(-2.2, -7.4);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath(); // front side window
  ctx.moveTo(-0.2, -14.6);
  ctx.lineTo(5.4, -14.6);
  ctx.lineTo(11.4, -7.4);
  ctx.lineTo(-0.2, -7.4);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = GLASS_HI;
  ctx.beginPath();
  ctx.moveTo(-8.2, -14.2);
  ctx.lineTo(-5.8, -14.2);
  ctx.lineTo(-9.2, -7.8);
  ctx.lineTo(-11.4, -7.8);
  ctx.closePath();
  ctx.moveTo(2.4, -14.2);
  ctx.lineTo(4, -14.2);
  ctx.lineTo(1.4, -10.6);
  ctx.lineTo(-0.2, -10.6);
  ctx.closePath();
  ctx.fill();
  // Duct tape across the rear window crack.
  ctx.strokeStyle = 'rgba(225, 225, 235, 0.95)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-11.8, -11.6);
  ctx.lineTo(-3.4, -9.4);
  ctx.stroke();
  // Sunglasses on the dash (bottom of the front window): big black frames, lenses glint with the shade.
  ctx.save();
  ctx.translate(6.2, -9.4);
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.moveTo(-5.4, -2.1);
  ctx.lineTo(5.4, -2.1);
  ctx.lineTo(5.1, 0.4);
  ctx.quadraticCurveTo(4.4, 2.5, 2.1, 2);
  ctx.lineTo(0.8, -0.1);
  ctx.lineTo(-0.8, -0.1);
  ctx.lineTo(-2.1, 2);
  ctx.quadraticCurveTo(-4.4, 2.5, -5.1, 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 0.45;
  ctx.stroke();
  const glint = 0.6 + 0.4 * Math.max(0, Math.sin(time * 2.4));
  ctx.globalAlpha *= glint;
  ctx.fillStyle = lens;
  ctx.fillRect(-4.3, -1.4, 1.6, 1.1);
  ctx.fillRect(1.9, -1.4, 1.6, 1.1);
  ctx.restore();
  // Dash line under the glass.
  ctx.fillStyle = WHITE_SH;
  ctx.fillRect(-13.4, -7.4, 25.4, 0.9);

  // Under the parts: what shows when they're gone.
  if (!on.has('door')) {
    ctx.fillStyle = '#2a0d2e';
    ctx.fillRect(-14, -6.4, 27.6, 11);
    ctx.fillStyle = '#8a2a4e';
    ctx.fillRect(-11, -5.6, 6.5, 8.6); // seat back
    ctx.strokeStyle = '#b8b8c4';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(8, -2.5, 2.6, 0, Math.PI * 2); // steering wheel
    ctx.stroke();
    // The white door frame stays (sill + pillar), so the bare car still reads black-and-white.
    ctx.fillStyle = WHITE;
    ctx.fillRect(-14, 3.2, 27.6, 1.6);
    ctx.fillRect(-14, -6.4, 1.4, 11.2);
    ctx.fillRect(12.2, -6.4, 1.4, 11.2);
    ctx.fillRect(-1.3, -6.4, 1.4, 11.2);
  }
  if (!on.has('hood')) {
    ctx.fillStyle = '#6a6a78';
    ctx.fillRect(16, -7.8, 12, 3.6);
    ctx.fillStyle = `rgba(255, 107, 53, ${0.6 + 0.3 * Math.sin(time * 9)})`;
    ctx.fillRect(18, -8.6, 3, 1.3);
    ctx.fillRect(23.5, -8.6, 3, 1.3);
  }
  if (!on.has('trunk')) {
    ctx.fillStyle = '#050508';
    ctx.fillRect(-30.5, -7.4, 14.5, 3.2);
    ctx.strokeStyle = '#6a6a78';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(-23, -5.8, 3.2, Math.PI, Math.PI * 2); // spare tire
    ctx.stroke();
  }

  // Dents, rust and the lights that never fall off.
  ctx.strokeStyle = 'rgba(120, 120, 140, 0.8)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.arc(-26, 0.8, 2.4, -0.3, 1.9);
  ctx.moveTo(27, 1.3);
  ctx.arc(26, 1.3, 2, 0.2, 2.4);
  ctx.stroke();
  ctx.fillStyle = '#9a4a18';
  for (const [rx, ry, rr] of [[-29, 3.5, 1.1], [-18.4, 4.4, 0.8], [28.5, 4.2, 0.9]] as const) {
    ctx.beginPath();
    ctx.arc(rx, ry, rr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255, 230, 109, 0.35)';
  ctx.beginPath(); // headlight beam
  ctx.moveTo(33.4, -4.4);
  ctx.lineTo(44, -7.5);
  ctx.lineTo(44, 0.5);
  ctx.lineTo(33.4, -1.8);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fff3a8';
  ctx.fillRect(31.2, -4.8, 2.4, 2.8); // headlight
  ctx.fillStyle = '#ff3355';
  ctx.fillRect(-33.4, -4.4, 1.9, 2.8); // tail light

  // Crisp white rim + the game's neon edge.
  ctx.strokeStyle = RIM;
  ctx.lineWidth = 0.9;
  bodyPath(ctx);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(127, 255, 255, 0.85)';
  ctx.lineWidth = 0.45;
  bodyPath(ctx);
  ctx.stroke();

  // Wheels (always stay on).
  for (const wx of [-20, 20]) {
    ctx.fillStyle = '#050507';
    ctx.beginPath();
    ctx.arc(wx, 7, 6.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(200, 245, 255, 0.85)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    const cap = wx < 0 ? 'hubcapR' : 'hubcapF';
    if (!on.has(cap)) {
      ctx.fillStyle = '#7a5530';
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

  for (const p of PARTS) if (p.id !== 'speaker' && on.has(p.id)) paintPart(ctx, p.id, time, wheelA, lite);
  // The roof loudspeaker goes on last: its rack stands on the roof, over the light bar.
  if (on.has('speaker')) {
    paintPart(ctx, 'speaker', time, wheelA, lite);
    paintSoundWaves(ctx, time);
  }
}

/**
 * The roof loudspeaker's horn transform (car units): lying level along the roof on its rack,
 * centred over the cabin (the roof runs x -11..6.5), mouth at the roof's front edge, aimed ahead.
 */
function hornFrame(ctx: CanvasRenderingContext2D): void {
  ctx.translate(0, -29);
}

/** Pulsing ")))" ahead of the horn's mouth while the speaker is on (only on the car). */
function paintSoundWaves(ctx: CanvasRenderingContext2D, time: number): void {
  ctx.save();
  hornFrame(ctx);
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const ph = (time * 1.6 + i / 3) % 1;
    ctx.globalAlpha = 0.85 * (1 - ph);
    ctx.strokeStyle = i % 2 === 0 ? '#ffffff' : '#7fffff';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(6.4, 0, 2.6 + ph * 5, -0.7, 0.7);
    ctx.stroke();
  }
  ctx.restore();
}

/** One removable part, in car units (the same drawing on the car and tumbling away). */
function paintPart(ctx: CanvasRenderingContext2D, id: PartId, time: number, spin: number, lite: boolean): void {
  switch (id) {
    case 'speaker': {
      // The big roof horn (a nod to the 1974 movie car): a long flared cone lying level on a
      // chrome roof rack, the driver can + upright motor housing at the back, the mouth at the
      // roof's front edge. The rack's legs stand on the roof's corners, straddling the light bar.
      // A soft halo + dark edge keep it crisp on the purple lanes (no shadowBlur needed on phones).
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      const rack = (): void => {
        ctx.beginPath();
        ctx.moveTo(-11, -16.7); // rear leg, on the roof's back corner
        ctx.lineTo(-11.8, -24.2);
        ctx.lineTo(8.2, -24.2); // the deck over the light bar
        ctx.lineTo(6.2, -16.7); // front leg, on the roof's front corner
      };
      ctx.strokeStyle = HALO;
      ctx.lineWidth = 3.4;
      rack();
      ctx.stroke();
      ctx.strokeStyle = '#0c0c12';
      ctx.lineWidth = 1.9;
      rack();
      ctx.stroke();
      ctx.strokeStyle = CHROME;
      ctx.lineWidth = 1.1;
      rack();
      ctx.stroke();
      ctx.fillStyle = '#0c0c12'; // feet
      ctx.fillRect(-12.6, -17.4, 3, 1.1);
      ctx.fillRect(4.8, -17.4, 3, 1.1);
      ctx.save();
      hornFrame(ctx);
      // Saddles from the deck up to the horn.
      ctx.fillStyle = '#0c0c12';
      ctx.fillRect(-8.4, 2, 2.4, 3.6);
      ctx.fillRect(0.4, 2.6, 2.4, 3);
      ctx.fillStyle = '#8a92a2';
      ctx.fillRect(-8, 2, 1.6, 3.4);
      ctx.fillRect(0.8, 2.6, 1.6, 2.8);
      const horn = (): void => {
        ctx.beginPath();
        ctx.moveTo(-12.4, -2.6); // driver can
        ctx.lineTo(-9.4, -2.6);
        ctx.lineTo(-9.4, -1.9);
        ctx.lineTo(-4, -1.9); // throat
        ctx.lineTo(6.4, -5); // flare to the mouth
        ctx.lineTo(6.4, 5);
        ctx.lineTo(-4, 1.9);
        ctx.lineTo(-9.4, 1.9);
        ctx.lineTo(-9.4, 2.6);
        ctx.lineTo(-12.4, 2.6);
        ctx.closePath();
        ctx.rect(-12, -4.6, 2.2, 2.2); // upright motor housing on the can
      };
      ctx.strokeStyle = HALO;
      ctx.lineWidth = 3;
      horn();
      ctx.stroke();
      if (!lite) {
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'rgba(140, 230, 255, 0.9)';
      }
      ctx.fillStyle = WHITE;
      horn();
      ctx.fill();
      ctx.shadowBlur = 0;
      // Shading: the horn's lower half and the driver can.
      ctx.fillStyle = WHITE_SH;
      ctx.beginPath();
      ctx.moveTo(-9.4, 0.5);
      ctx.lineTo(-4, 0.5);
      ctx.lineTo(6.4, 1.3);
      ctx.lineTo(6.4, 5);
      ctx.lineTo(-4, 1.9);
      ctx.lineTo(-9.4, 1.9);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#b4bccb';
      ctx.fillRect(-12.4, -2.6, 3, 5.2);
      ctx.fillRect(-12, -4.6, 2.2, 2.2);
      ctx.strokeStyle = '#0c0c12';
      ctx.lineWidth = 0.55;
      horn();
      ctx.stroke();
      ctx.beginPath(); // seams: can / throat, throat / flare
      ctx.moveTo(-9.4, -1.9);
      ctx.lineTo(-9.4, 1.9);
      ctx.moveTo(-4, -1.9);
      ctx.lineTo(-4, 1.9);
      ctx.stroke();
      // Mouth: dark inside, white lip.
      ctx.fillStyle = '#1a1a26';
      ctx.beginPath();
      ctx.ellipse(6.4, 0, 1.7, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = WHITE;
      ctx.lineWidth = 0.7;
      ctx.stroke();
      ctx.restore();
      break;
    }
    case 'siren': {
      // Red / blue light bar: both halves lit, alternating bright, with a fake glow (works on lite).
      const phase = Math.floor(time * 7) % 2 === 0;
      const red = phase ? '#ff2a4a' : '#a01830';
      const blue = phase ? '#2050c0' : '#4a8cff';
      ctx.fillStyle = phase ? 'rgba(255, 40, 70, 0.36)' : 'rgba(60, 120, 255, 0.38)';
      ctx.beginPath();
      ctx.ellipse(phase ? -5.5 : 5.5, -20, 11, 6.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#d6dae2';
      ctx.fillRect(-10.5, -17.4, 21, 1.4);
      if (!lite) {
        ctx.shadowBlur = 12;
        ctx.shadowColor = phase ? '#ff2244' : '#3a7aff';
      }
      ctx.fillStyle = red;
      ctx.beginPath();
      ctx.moveTo(-10, -17.3);
      ctx.lineTo(-9.2, -23);
      ctx.lineTo(-0.5, -23);
      ctx.lineTo(-0.5, -17.3);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = blue;
      ctx.beginPath();
      ctx.moveTo(0.5, -17.3);
      ctx.lineTo(0.5, -23);
      ctx.lineTo(9.2, -23);
      ctx.lineTo(10, -17.3);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.fillRect(phase ? -8 : 1.8, -22.4, 6.2, 1);
      break;
    }
    case 'antenna':
      ctx.strokeStyle = CHROME;
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(-28, -6);
      ctx.quadraticCurveTo(-29, -16, -31, -25);
      ctx.stroke();
      ctx.fillStyle = '#ff6b35';
      ctx.beginPath();
      ctx.arc(-31, -25, 1.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'mirror':
      ctx.strokeStyle = CHROME;
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(12.6, -7.6);
      ctx.lineTo(14, -9.8);
      ctx.stroke();
      ctx.fillStyle = BLACK;
      ctx.fillRect(13, -12.8, 3.4, 3.2);
      ctx.strokeStyle = RIM;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(13, -12.8, 3.4, 3.2);
      ctx.fillStyle = CHROME;
      ctx.fillRect(15.6, -12.4, 0.7, 2.4);
      break;
    case 'hood':
      ctx.fillStyle = '#16161f';
      ctx.beginPath();
      ctx.moveTo(14.5, -6.7);
      ctx.lineTo(31, -6.2);
      ctx.lineTo(32.4, -3.6);
      ctx.lineTo(15.2, -4.2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 0.55;
      ctx.stroke();
      break;
    case 'trunk':
      ctx.fillStyle = '#16161f';
      ctx.beginPath();
      ctx.moveTo(-31.4, -6.1);
      ctx.lineTo(-15.6, -6.7);
      ctx.lineTo(-15.2, -4.2);
      ctx.lineTo(-31.8, -3.6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.lineWidth = 0.55;
      ctx.stroke();
      break;
    case 'door':
      // The white door band (front + rear doors) of the black-and-white.
      ctx.fillStyle = WHITE;
      ctx.fillRect(-14, -6.4, 27.6, 11);
      ctx.fillStyle = WHITE_SH;
      ctx.fillRect(-14, 3.2, 27.6, 1.4);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(-14, -6.4, 27.6, 11);
      ctx.beginPath();
      ctx.moveTo(-0.6, -6.4);
      ctx.lineTo(-0.6, 4.6);
      ctx.stroke();
      // a dent and the handles
      ctx.beginPath();
      ctx.arc(-6.5, 1.2, 2.2, 0.4, 2.6);
      ctx.stroke();
      ctx.fillStyle = '#5a6070';
      ctx.fillRect(-4.8, -4.6, 2.8, 0.8);
      ctx.fillRect(8.2, -4.6, 2.8, 0.8);
      break;
    case 'bumperF':
    case 'bumperR': {
      const x = id === 'bumperF' ? 31.6 : -35;
      ctx.fillStyle = CHROME;
      ctx.fillRect(x, 2.2, 3.6, 3.9);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 0.4, 2.6, 2.8, 0.8);
      break;
    }
    case 'hubcapF':
    case 'hubcapR': {
      const wx = id === 'hubcapF' ? 20 : -20;
      ctx.fillStyle = CHROME;
      ctx.beginPath();
      ctx.arc(wx, 7, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#6a7280';
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

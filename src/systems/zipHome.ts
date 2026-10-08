/**
 * HOME TO EARTH (Dan, 2026-10-08): nothing in the game dies. A pet that is hit, or that runs out
 * of TREAT CHARGE, floats back down to Earth (a blue planet) instead of vanishing.
 *
 *   - A pet leaving mid-run (others still flying): a short zip down off the playfield onto a
 *     small Earth peeking up at the bottom. Play never pauses.
 *   - The run's last pet: play freezes for a moment while the animal floats DOWN past the
 *     playfield onto a big blue Earth below it; then the normal game-over screen.
 *   - Treat charge hitting zero shows TREATS_LINE. When the run-ending fly-home finishes and the
 *     score did NOT make the leaderboard, MISSED_BOARD_TAUNT follows (skipped if it qualifies).
 *
 * Gameplay numbers and the moment the lose rule fires are unchanged: this is animation and text.
 * Same in every mode (dog, PART TWO, PLATYPUS, MANATEE). The two lines are English everywhere.
 */
import { shipSprite, SPRITE_W, SPRITE_H, SPRITE_AX, SPRITE_AY, type Breed } from '../render/shipSprite';

/** The exact line when treat charge hits zero (Dan). */
export const TREATS_LINE = 'gotta get more treats on Earth!';
/** PLACEHOLDER taunt (not final; Dan will replace it): only when the run missed the board. */
export const MISSED_BOARD_TAUNT = 'So close! Grab more treats and try again.';

/** Seconds of a mid-run zip home (no pause). */
const ZIP_S = 0.95;
/** Seconds of the run-ending float down onto Earth (play frozen). */
export const FINAL_FLOAT_S = 1.9;
/** Extra seconds the placeholder taunt stays up after landing (missed-board runs only). */
export const TAUNT_HOLD_S = 1.4;

interface Zipper {
  breed: Breed;
  x0: number;
  y0: number;
  k: number;
  t: number;
  phase: number;
}

export class ZipHome {
  private zips: Zipper[] = [];
  /** Small Earth at the bottom while mid-run zips are flying. */
  private earthT = 0;
  /** TREATS_LINE countdown (mid-run). */
  private lineT = 0;
  /** Run-ending float: elapsed seconds (< 0 = not running). */
  private finalT = -1;
  private finalPet: Zipper | null = null;
  private finalLine = false;
  private finalTaunt = false;

  /** The run-ending float (and its taunt, if any) has played out. */
  finalDone(): boolean {
    return this.finalT >= this.finalDuration();
  }

  get busy(): boolean {
    return this.finalT >= 0;
  }

  /** Total seconds the run-ending float holds the game (with or without the taunt). */
  finalDuration(): number {
    return FINAL_FLOAT_S + (this.finalTaunt ? TAUNT_HOLD_S : 0);
  }

  clear(): void {
    this.zips.length = 0;
    this.earthT = 0;
    this.lineT = 0;
    this.finalT = -1;
    this.finalPet = null;
  }

  /** A pet leaves mid-run (hit, or out of treat charge with `line`). */
  zip(breed: Breed, x: number, y: number, k: number, line: boolean): void {
    if (this.zips.length >= 24) this.zips.shift();
    this.zips.push({ breed, x0: x, y0: y, k, t: 0, phase: Math.random() * 6 });
    this.earthT = Math.max(this.earthT, ZIP_S + 0.35);
    if (line) this.lineT = 1.8;
  }

  /** The run's last pet floats down past the playfield onto Earth. */
  final(breed: Breed, x: number, y: number, k: number, line: boolean, taunt: boolean): void {
    this.finalPet = { breed, x0: x, y0: y, k, t: 0, phase: 0 };
    this.finalT = 0;
    this.finalLine = line;
    this.finalTaunt = taunt;
  }

  update(dt: number): void {
    for (const z of this.zips) z.t += dt;
    this.zips = this.zips.filter((z) => z.t < ZIP_S);
    this.earthT = Math.max(0, this.earthT - dt);
    this.lineT = Math.max(0, this.lineT - dt);
    if (this.finalT >= 0) this.finalT += dt;
  }

  /** Mid-run zips (drawn in the world layer, over the playfield). */
  draw(g: CanvasRenderingContext2D, W: number, H: number, u: (n: number) => number): void {
    if (this.earthT > 0 || this.zips.length) {
      // Small Earth peeking up at the bottom while someone is flying home.
      const a = Math.min(1, this.earthT / 0.3);
      const er = Math.min(W, H) * 0.26;
      const ex = W * 0.5;
      const ey = H + er * (0.3 + 0.5 * (1 - a));
      g.save();
      g.globalAlpha = 0.9 * a;
      drawEarth(g, ex, ey, er);
      g.restore();
      for (const z of this.zips) {
        const p = z.t / ZIP_S;
        const e = p * p * (3 - 2 * p);
        const tx = ex + (z.x0 - ex) * 0.25;
        const ty = ey - er;
        const x = z.x0 + (tx - z.x0) * e + Math.sin(z.phase + z.t * 9) * 6 * (1 - e);
        const y = z.y0 + (ty - z.y0) * e;
        const k = Math.max(0.9, z.k * 1.6) * (1 - 0.5 * e);
        drawPet(g, z.breed, x, y, k, 0.35 + e * 0.9);
        sparkleTrail(g, x, y - SPRITE_H * k * 0.2, k, z.t);
      }
    }
    if (this.lineT > 0) drawLine(g, TREATS_LINE, W / 2, H * 0.3, u, Math.min(1, this.lineT / 0.3), '#ffe66d');
  }

  /** The run-ending float (drawn over everything, HUD included). */
  drawFinal(g: CanvasRenderingContext2D, W: number, H: number, u: (n: number) => number): void {
    const pet = this.finalPet;
    if (this.finalT < 0 || !pet) return;
    const t = this.finalT;
    // The playfield scrolls up out of view: a deep-space band rises from below with Earth on it.
    const rise = Math.min(1, t / 0.55);
    const ease = rise * rise * (3 - 2 * rise);
    const bandTop = H * (1 - 0.62 * ease);
    g.save();
    const sky = g.createLinearGradient(0, bandTop, 0, H);
    sky.addColorStop(0, 'rgba(6, 0, 24, 0)');
    sky.addColorStop(0.25, 'rgba(6, 0, 24, 0.92)');
    sky.addColorStop(1, 'rgba(4, 10, 40, 0.98)');
    g.fillStyle = sky;
    g.fillRect(0, bandTop, W, H - bandTop);
    // a few stars in the band
    g.fillStyle = 'rgba(255, 255, 255, 0.8)';
    for (let i = 0; i < 18; i++) {
      const sx = ((i * 97) % 100) / 100 * W;
      const sy = bandTop + H * 0.12 + (((i * 53) % 100) / 100) * (H - bandTop - H * 0.12);
      g.globalAlpha = (0.4 + 0.4 * Math.sin(t * 3 + i)) * ease;
      g.fillRect(sx, sy, 2, 2);
    }
    g.globalAlpha = 1;
    // Earth sits right below the playfield, in full view (its top ~60% down the screen).
    const er = Math.min(W, H) * 0.38;
    const ex = W * 0.5;
    const ey = H * 0.6 + er + (1 - ease) * H * 0.4;
    drawEarth(g, ex, ey, er);
    // The pet floats down from where it was, past the playfield, onto Earth.
    const fp = Math.min(1, Math.max(0, (t - 0.15) / (FINAL_FLOAT_S - 0.55)));
    const fe = 1 - (1 - fp) * (1 - fp);
    const landX = ex + (pet.x0 - ex) * 0.15;
    const landY = ey - er - SPRITE_H * pet.k * 0.12;
    const x = pet.x0 + (landX - pet.x0) * fe + Math.sin(t * 5) * 8 * (1 - fe);
    const y = pet.y0 + (landY - pet.y0) * fe;
    const k = Math.max(1.5, pet.k * 2) * (1.15 - 0.35 * fe);
    if (fp < 1) sparkleTrail(g, x, y - SPRITE_H * k * 0.25, k, t);
    drawPet(g, pet.breed, x, y, k, Math.sin(t * 4) * 0.12 * (1 - fe) + 0.12 * fe);
    if (fp >= 1) {
      // a happy twinkle where they landed
      const tk = Math.min(1, (t - (FINAL_FLOAT_S - 0.4)) / 0.4);
      g.save();
      g.translate(landX + SPRITE_W * k * 0.35, landY - SPRITE_H * k * 0.6);
      g.rotate(t * 2);
      g.globalAlpha = Math.max(0, 1 - Math.abs(tk - 0.5));
      g.fillStyle = '#ffe66d';
      star(g, 0, 0, 14 * tk + 4, 5 * tk + 2, 5);
      g.restore();
    }
    if (this.finalLine && t > 0.25) drawLine(g, TREATS_LINE, W / 2, H * 0.24, u, Math.min(1, (t - 0.25) / 0.3), '#ffe66d');
    if (this.finalTaunt && t > FINAL_FLOAT_S - 0.1) {
      drawLine(g, MISSED_BOARD_TAUNT, W / 2, H * 0.24 + u(40), u, Math.min(1, (t - FINAL_FLOAT_S + 0.1) / 0.3), '#7fe3ff', 0.8);
    }
    g.restore();
  }
}

/** The blue planet (same look as the cat space-suit scene's Earth). */
export function drawEarth(g: CanvasRenderingContext2D, ex: number, ey: number, er: number): void {
  const eg = g.createRadialGradient(ex - er * 0.3, ey - er * 0.4, er * 0.1, ex, ey, er);
  eg.addColorStop(0, '#5fd3ff');
  eg.addColorStop(1, '#1b5fb0');
  g.fillStyle = eg;
  g.beginPath();
  g.arc(ex, ey, er, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#5ee08a';
  for (const [ax, ay, rx, ry] of [[-0.45, -0.72, 0.22, 0.1], [0.15, -0.8, 0.18, 0.08], [0.5, -0.62, 0.14, 0.09], [-0.1, -0.6, 0.12, 0.06]] as const) {
    g.beginPath();
    g.ellipse(ex + ax * er, ey + ay * er, rx * er, ry * er, 0.2, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = 'rgba(160, 230, 255, 0.55)';
  g.lineWidth = Math.max(3, er * 0.04);
  g.beginPath();
  g.arc(ex, ey, er + g.lineWidth * 0.7, Math.PI * 1.05, Math.PI * 1.95);
  g.stroke();
}

function drawPet(g: CanvasRenderingContext2D, b: Breed, x: number, y: number, k: number, tilt: number): void {
  const img = shipSprite(b, { flame: false, accent: '#ffe66d' });
  g.save();
  g.translate(x, y);
  g.rotate(tilt);
  g.drawImage(img, -SPRITE_AX * k, -SPRITE_AY * k, SPRITE_W * k, SPRITE_H * k);
  g.restore();
}

function sparkleTrail(g: CanvasRenderingContext2D, x: number, y: number, k: number, t: number): void {
  g.save();
  g.fillStyle = '#bff6ff';
  for (let i = 1; i <= 4; i++) {
    g.globalAlpha = 0.5 - i * 0.1;
    const r = Math.max(1, 2.4 * k - i * 0.3);
    g.beginPath();
    g.arc(x + Math.sin(t * 12 + i) * 3, y - i * 9 * k, r, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

function drawLine(g: CanvasRenderingContext2D, text: string, x: number, y: number, u: (n: number) => number, a: number, ink: string, size = 1): void {
  g.save();
  g.globalAlpha = Math.max(0, Math.min(1, a));
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let fs = u(24) * size;
  g.font = `800 ${fs}px 'Orbitron', sans-serif`;
  const maxW = g.canvas.width > 0 ? Math.min(g.canvas.width, x * 2) * 0.9 : 600;
  while (fs > 10 && g.measureText(text).width > maxW) {
    fs -= 1;
    g.font = `800 ${fs}px 'Orbitron', sans-serif`;
  }
  const tw = g.measureText(text).width;
  g.fillStyle = 'rgba(8, 0, 20, 0.72)';
  const bh = fs * 1.9;
  const bw = tw + fs * 1.4;
  g.beginPath();
  g.roundRect(x - bw / 2, y - bh / 2, bw, bh, bh / 2);
  g.fill();
  g.fillStyle = ink;
  g.shadowBlur = 12;
  g.shadowColor = ink;
  g.fillText(text, x, y + 1);
  g.restore();
}

function star(g: CanvasRenderingContext2D, x: number, y: number, R: number, r: number, n: number): void {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const rad = i % 2 === 0 ? R : r;
    if (i === 0) g.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    else g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  g.closePath();
  g.fill();
}

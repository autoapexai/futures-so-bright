import { GLYPH_FALLBACK, maskInitials } from '../utils/initials';
import type { Player } from '../entities/Player';
import { drawAppliance } from './silly';
import { drawDuckText, duckWidth } from '../render/duckDigits';
import type { Obstacle, Collectible } from '../entities/Obstacles';
import type { LeaderboardEntry } from '../utils/storage';
import { clamp } from '../utils/math';
import { paintShip, shipSprite, dogGlyph, SPRITE_W, SPRITE_H, SPRITE_AX, SPRITE_AY, GLYPH_W, GLYPH_H, GLYPH_AX, GLYPH_AY, type Breed } from '../render/shipSprite';
import type { Formation } from '../entities/Formation';
import { MAX_DRAWN_SHIPS, formatShips } from '../utils/cloneLevels';
import { fmtNum, nonEnglish, t as tr } from '../i18n';

/** fillText that, in non-English languages only, squeezes text wider than maxW (English draws exactly as before). */
function fillMax(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number): void {
  if (nonEnglish()) ctx.fillText(text, x, y, Math.max(1, maxW));
  else ctx.fillText(text, x, y);
}

/** Clone level + ship count for the HUD (difficulty-11 runs only). */

/** Score with thousands separators: 777777777 -> "777,777,777". */
function fmtScore(n: number): string {
  return fmtNum(Math.max(0, n));
}

export interface LevelInfo {
  level: number;
  /** Ships left (clone levels); 0 for levels 1-10, which show just "LVL n". */
  ships: number;
  /** Levels 1-10: the dog pack left (player's dog first), drawn as HUD icons after "LVL n". */
  dogs?: Breed[];
  /** Icon size multiplier: grows as the pack shrinks (1 = four dogs). */
  dogIconScale?: number;
  /** Replaces the ship count after "LVL n" (ON A MISSION: "PARTS 7/10"). */
  label?: string;
}

/** Gate-boost ring glow duration (s); Game sets Obstacle.boostT to this. */
export const GATE_GLOW_SECONDS = 0.5;

const COL = {
  bgTop: '#120028',
  bgBot: '#2a0845',
  sun: '#ff6b35',
  sunCore: '#ffe66d',
  magenta: '#ff2bd6',
  cyan: '#00f0ff',
  purple: '#9b5cff',
  pink: '#ff7ad9',
  white: '#ffffff',
};

/** Smallest scale the player's dog is drawn at (visual only; the hitbox keeps p.scale). */
const PLAYER_MIN_VIS = 0.6;

export class Renderer {
  /** Scratch list for drawSwarm's tiny glyph dogs (reused each frame). */
  private tinyDogs: Formation['slots'][number][] = [];
  shake = 0;
  flash = 0;
  /** Lower-cost path for mobile Safari (fewer rays, less blur, thinner scanlines). */
  lite = false;
  /** Prefer touch-oriented prompt copy when true. */
  touchUi = false;
  /**
   * Extra scale for HUD / menu text so it stays readable on dense phone
   * viewports. 1 = no boost.
   */
  uiBoost = 1;
  /** Logical safe-area insets (notch / home indicator) mapped into world px. */
  padTop = 0;
  padRight = 0;
  padBottom = 0;
  padLeft = 0;
  /** Logical px reserved on the right for pause/mute chrome. */
  chromeRight = 0;
  private stars: { x: number; y: number; z: number; s: number }[] = [];
  private buildings: { x: number; w: number; h: number; windows: number }[] = [];
  private gridPhase = 0;
  private time = 0;
  /** Cached sky+sun for the lite path (avoids per-frame gradients on iOS). */
  private sky: HTMLCanvasElement | null = null;
  /** Adaptive: skip perspective strokes if Safari is missing 60fps. */
  gridEnabled = true;

  constructor(private W: number, private H: number) {
    this.initBackdrop();
  }

  resize(W: number, H: number): void {
    const oldW = this.W;
    const oldH = this.H;
    this.W = W;
    this.H = H;
    // Safari URL-bar show/hide nudges aspect a few % — rescale instead of
    // regenerating the whole city (avoids hitch + visual pop).
    const mild =
      oldW > 0 &&
      oldH > 0 &&
      Math.abs(W - oldW) / oldW < 0.12 &&
      Math.abs(H - oldH) / oldH < 0.12;
    if (mild) {
      const sx = W / oldW;
      const sy = H / oldH;
      for (const s of this.stars) {
        s.x *= sx;
        s.y *= sy;
      }
      for (const b of this.buildings) {
        b.x *= sx;
        b.h *= sy;
      }
      if (this.lite) this.bakeSky();
      return;
    }
    this.initBackdrop();
  }

  private initBackdrop(): void {
    const starCount = this.lite ? 40 : 80;
    this.stars = Array.from({ length: starCount }, () => ({
      x: Math.random() * this.W,
      y: Math.random() * this.H * 0.55,
      z: Math.random() * 0.8 + 0.2,
      s: Math.random() * 1.8 + 0.4,
    }));
    this.buildings = [];
    let x = -20;
    while (x < this.W + 200) {
      const w = 40 + Math.random() * 70;
      const h = 80 + Math.random() * (this.H * 0.45);
      this.buildings.push({
        x,
        w,
        h,
        windows: Math.floor(3 + Math.random() * 5),
      });
      x += w + 8 + Math.random() * 20;
    }
    if (this.lite) this.bakeSky();
    else this.sky = null;
  }

  private bakeSky(): void {
    const c = document.createElement('canvas');
    // Half-res is enough for a smooth sky and cuts rotate hitch + memory.
    const scale = 0.5;
    c.width = Math.max(1, Math.round(this.W * scale));
    c.height = Math.max(1, Math.round(this.H * scale));
    const ctx = c.getContext('2d', { alpha: false });
    if (!ctx) {
      this.sky = null;
      return;
    }
    ctx.scale(c.width / this.W, c.height / this.H);
    this.paintSky(ctx, false);
    this.sky = c;
  }

  private paintSky(ctx: CanvasRenderingContext2D, animateRays: boolean): void {
    const W = this.W;
    const H = this.H;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, COL.bgTop);
    g.addColorStop(0.55, '#1a0538');
    g.addColorStop(1, COL.bgBot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const sx = W * 0.72;
    const sy = H * 0.28;
    const sunR = 70;
    const glow = ctx.createRadialGradient(sx, sy, 10, sx, sy, sunR * 2.2);
    glow.addColorStop(0, 'rgba(255, 200, 80, 0.55)');
    glow.addColorStop(0.4, 'rgba(255, 80, 120, 0.25)');
    glow.addColorStop(1, 'rgba(255, 40, 180, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sx, sy, sunR * 2.2, 0, Math.PI * 2);
    ctx.fill();

    if (animateRays) {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(this.time * 0.15);
      ctx.globalCompositeOperation = 'lighter';
      const rayCount = 10;
      for (let i = 0; i < rayCount; i++) {
        ctx.rotate(Math.PI / (rayCount / 2));
        const rg = ctx.createLinearGradient(0, 0, 0, sunR * 3.2);
        rg.addColorStop(0, 'rgba(255, 200, 80, 0.18)');
        rg.addColorStop(1, 'rgba(255, 80, 180, 0)');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-18, sunR * 3.2);
        ctx.lineTo(18, sunR * 3.2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.restore();
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(sx, sy, sunR, 0, Math.PI * 2);
    ctx.clip();
    const sg = ctx.createLinearGradient(sx, sy - sunR, sx, sy + sunR);
    sg.addColorStop(0, COL.sunCore);
    sg.addColorStop(0.5, COL.sun);
    sg.addColorStop(1, COL.magenta);
    ctx.fillStyle = sg;
    ctx.fillRect(sx - sunR, sy - sunR, sunR * 2, sunR * 2);
    ctx.fillStyle = COL.bgTop;
    for (let i = 0; i < 8; i++) {
      const yy = sy + 10 + i * 10;
      ctx.fillRect(sx - sunR, yy, sunR * 2, 3 + i * 0.4);
    }
    ctx.restore();
  }

  /** Canvas y of the top of the HTML card over the game-over screen (0 = none). Set by Game. */
  cardTopY = 0;

  bumpShake(amount: number): void {
    this.shake = Math.max(this.shake, this.lite ? amount * 0.45 : amount);
  }

  bumpFlash(amount: number): void {
    this.flash = Math.max(this.flash, amount);
  }

  /** Logical px size → boosted when touch canvas is shrunk. */
  u(px: number): number {
    return this.touchUi ? px * this.uiBoost : px;
  }

  /** Shrink font until `text` fits maxWidth (Orbitron titles on narrow phones). */
  private fitFont(
    ctx: CanvasRenderingContext2D,
    text: string,
    weight: string,
    size: number,
    family: string,
    maxWidth: number,
    minSize = 12,
  ): number {
    let s = size;
    while (s > minSize) {
      ctx.font = `${weight} ${s}px ${family}`;
      if (ctx.measureText(text).width <= maxWidth) return s;
      s -= 1;
    }
    ctx.font = `${weight} ${minSize}px ${family}`;
    return minSize;
  }

  private fillFitted(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    weight: string,
    size: number,
    family: string,
    maxWidth: number,
    minSize = 12,
  ): number {
    const s = this.fitFont(ctx, text, weight, size, family, maxWidth, minSize);
    // Translations run longer: squeeze rather than spill past the edge if even the smallest size is too wide.
    if (nonEnglish()) ctx.fillText(text, x, y, maxWidth);
    else ctx.fillText(text, x, y);
    return s;
  }

  update(dt: number, scrollSpeed: number): void {
    this.time += dt;
    this.gridPhase += scrollSpeed * dt * 0.08;
    this.shake = Math.max(0, this.shake - dt * 8);
    this.flash = Math.max(0, this.flash - dt * 2.5);

    for (const s of this.stars) {
      s.x -= scrollSpeed * dt * s.z * 0.15;
      if (s.x < 0) s.x += this.W;
    }
    for (const b of this.buildings) {
      b.x -= scrollSpeed * dt * 0.35;
    }
    // recycle buildings
    for (const b of this.buildings) {
      if (b.x + b.w < -40) {
        let maxX = 0;
        for (const bb of this.buildings) {
          const right = bb.x + bb.w;
          if (right > maxX) maxX = right;
        }
        b.x = maxX + 8 + Math.random() * 20;
        b.w = 40 + Math.random() * 70;
        b.h = 80 + Math.random() * (this.H * 0.45);
      }
    }
  }

  drawBackground(ctx: CanvasRenderingContext2D, charge: number): void {
    const W = this.W;
    const H = this.H;
    if (this.lite && this.sky) {
      ctx.drawImage(this.sky, 0, 0, W, H);
    } else {
      this.paintSky(ctx, !this.lite);
    }

    // stars
    for (const s of this.stars) {
      ctx.globalAlpha = 0.3 + s.z * 0.7;
      ctx.fillStyle = COL.white;
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;

    // city silhouette
    const groundY = H * 0.78;
    for (const b of this.buildings) {
      if (b.x + b.w < -4 || b.x > W + 4) continue;
      const by = groundY - b.h * 0.55;
      ctx.fillStyle = '#0d0020';
      ctx.fillRect(b.x, by, b.w, b.h);
      if (!this.lite) {
        ctx.strokeStyle = 'rgba(255, 60, 180, 0.35)';
        ctx.lineWidth = 1;
        ctx.strokeRect(b.x + 0.5, by + 0.5, b.w - 1, b.h - 1);
      }
      const cols = this.lite ? 1 : b.windows;
      const rows = Math.max(2, Math.floor(b.h / (this.lite ? 56 : 28)));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const lit = ((r * 7 + c * 3 + Math.floor(this.time * 2)) % 5) !== 0;
          if (!lit) continue;
          ctx.fillStyle = c % 2 === 0 ? 'rgba(0, 240, 255, 0.55)' : 'rgba(255, 80, 200, 0.5)';
          const wx = b.x + 8 + c * ((b.w - 16) / Math.max(1, cols));
          const wy = by + 10 + r * (this.lite ? 36 : 22);
          ctx.fillRect(wx, wy, 6, 8);
        }
      }
    }

    // perspective grid highway
    this.drawGrid(ctx, groundY, charge);
  }

  private drawGrid(ctx: CanvasRenderingContext2D, horizon: number, charge: number): void {
    const W = this.W;
    const H = this.H;
    if (!this.gridEnabled) {
      ctx.fillStyle = 'rgba(0, 40, 80, 0.22)';
      ctx.fillRect(0, horizon, W, H - horizon);
      return;
    }
    const alpha = 0.25 + charge * 0.35;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, horizon - 20, W, H - horizon + 20);
    ctx.clip();

    const vanishX = W * 0.5;
    const vanishY = horizon - 10;

    ctx.strokeStyle = `rgba(255, 60, 200, ${alpha})`;
    ctx.lineWidth = 1.5;
    if (!this.lite) {
      ctx.shadowBlur = 8;
      ctx.shadowColor = COL.magenta;
    }

    // horizontal lines
    const rows = this.lite ? 4 : 16;
    for (let i = 0; i <= rows; i++) {
      const t = (i + (this.gridPhase % 1)) / rows;
      const y = vanishY + Math.pow(t, 1.6) * (H - vanishY + 40);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // vertical perspective lines
    ctx.strokeStyle = `rgba(0, 240, 255, ${alpha * 0.85})`;
    ctx.shadowColor = COL.cyan;
    const vSpan = this.lite ? 3 : 12;
    for (let i = -vSpan; i <= vSpan; i++) {
      const edgeX = vanishX + i * 70;
      ctx.beginPath();
      ctx.moveTo(vanishX, vanishY);
      ctx.lineTo(edgeX, H + 20);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.restore();

    // road glow strip
    if (this.lite) {
      ctx.fillStyle = 'rgba(0, 40, 80, 0.18)';
      ctx.fillRect(0, horizon, W, H - horizon);
    } else {
      const rg = ctx.createLinearGradient(0, horizon, 0, H);
      rg.addColorStop(0, 'rgba(255, 40, 160, 0.08)');
      rg.addColorStop(1, 'rgba(0, 200, 255, 0.12)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, horizon, W, H - horizon);
    }
  }

  drawPlayer(ctx: CanvasRenderingContext2D, p: Player, charge: number): void {
    // trail
    for (let i = p.trail.length - 1; i >= 0; i--) {
      const t = p.trail[i];
      ctx.globalAlpha = t.a * 0.45;
      ctx.fillStyle = COL.cyan;
      // A soft round jet trail (never a block), sized with the drawn dog.
      if (!this.lite) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = COL.cyan;
      }
      const tv = Math.min(1, Math.max(p.scale, PLAYER_MIN_VIS));
      ctx.beginPath();
      ctx.ellipse(t.x, t.y, 10 * t.a * tv, 6 * t.a * tv, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    const blink = p.invuln > 0 && Math.floor(this.time * 20) % 2 === 0;
    if (blink) return;

    ctx.save();
    ctx.translate(p.x, p.y);
    const tilt = clamp(p.vy / 400, -0.35, 0.35);
    ctx.rotate(tilt);

    // The player's Border Collie is always drawn legibly: never smaller than PLAYER_MIN_VIS
    // (about 20+ px on a phone) even in the tiny swarm modes; the hitbox stays at true scale.
    // When enlarged, a soft cyan halo marks it out from the swarm.
    const vis = Math.max(p.scale, PLAYER_MIN_VIS);
    if (vis > p.scale * 1.25) {
      ctx.fillStyle = 'rgba(10, 0, 24, 0.72)';
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(-4 * vis, -4 * vis, 44 * vis, 30 * vis, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    // Jet flame (animated), then the dog itself via the shared ship sprite painter.
    ctx.scale(vis, vis);
    const flick = 0.7 + Math.sin(this.time * 40) * 0.3;
    ctx.shadowBlur = this.lite ? 0 : 16;
    ctx.shadowColor = COL.cyan;
    const rear = -4 - p.breed.bodyL + 1;
    ctx.fillStyle = `rgba(0, 255, 255, ${0.5 * flick})`;
    ctx.beginPath();
    ctx.moveTo(rear, -2);
    // The jet stretches with the FIRE ramp.
    ctx.lineTo(rear - 16 * flick - (p.boostFlash > 0 ? 10 : 0) - 18 * p.boostRamp, 2);
    ctx.lineTo(rear, 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(255, 255, 200, ${0.7 * flick})`;
    ctx.beginPath();
    ctx.moveTo(rear, 0);
    ctx.lineTo(rear - 8 * flick, 2);
    ctx.lineTo(rear, 4);
    ctx.closePath();
    ctx.fill();
    // Full ramp: three quick speed lines behind the dog (cheap strokes, no blur).
    if (p.boostRamp > 0.95) {
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(200, 255, 255, ${0.35 + 0.25 * flick})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = -1; i <= 1; i++) {
        const y = 2 + i * 7;
        const x0 = rear - 30 - ((this.time * 600 + i * 13) % 14);
        ctx.moveTo(x0, y);
        ctx.lineTo(x0 - 16, y);
      }
      ctx.stroke();
    }
    ctx.shadowBlur = this.lite ? 0 : 14 + 10 * p.boostRamp;
    ctx.shadowColor = p.boostFlash > 0 ? COL.cyan : COL.magenta;
    paintShip(ctx, p.breed, {
      lens: charge > 0.3 ? 'rgba(0, 255, 220, 0.8)' : 'rgba(255, 200, 50, 0.9)',
      glow: !this.lite,
    });

    ctx.restore();
    ctx.shadowBlur = 0;
  }

  /** FIRE barks outside boss fights: the same WOOF a boss fight draws (Boss.ts drawBoss). */
  drawBarks(ctx: CanvasRenderingContext2D, barks: { x: number; y: number; alive: boolean }[]): void {
    ctx.fillStyle = '#ffe66d';
    ctx.font = `900 ${this.u(13)}px 'Orbitron', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const k of barks) if (k.alive) ctx.fillText('WOOF', k.x, k.y);
  }

  drawObstacles(ctx: CanvasRenderingContext2D, obstacles: Obstacle[]): void {
    for (const o of obstacles) {
      // FIRE hit: a cartoon wobble while the hit flash fades (same 0.35 s as a boss's hurt flash).
      const hitK = o.hitT > 0 ? o.hitT / 0.35 : 0;
      if (hitK > 0) {
        ctx.save();
        const cx0 = o.x + o.w / 2;
        const cy0 = o.y + o.h / 2;
        const wob = Math.sin(o.hitT * 70) * 0.12 * hitK;
        ctx.translate(cx0, cy0);
        ctx.rotate(wob);
        ctx.scale(1 + 0.08 * hitK, 1 - 0.06 * hitK);
        ctx.translate(-cx0, -cy0);
      }
      if (o.kind === 'beam') {
        const pulse = 0.6 + Math.sin(o.pulse) * 0.4;
        ctx.shadowBlur = this.lite ? 0 : 24;
        ctx.shadowColor = COL.sun;
        if (this.lite) {
          ctx.fillStyle = `rgba(255, 220, 90, ${0.55 * pulse})`;
          ctx.fillRect(o.x, o.y, o.w, o.h);
        } else {
          const g = ctx.createLinearGradient(o.x, o.y, o.x + o.w, o.y);
          g.addColorStop(0, 'rgba(255, 220, 80, 0)');
          g.addColorStop(0.5, `rgba(255, 240, 120, ${0.85 * pulse})`);
          g.addColorStop(1, 'rgba(255, 100, 50, 0)');
          ctx.fillStyle = g;
          ctx.fillRect(o.x, o.y, o.w, o.h);
        }
        ctx.fillStyle = `rgba(255, 255, 255, ${0.5 * pulse})`;
        ctx.fillRect(o.x + o.w * 0.35, o.y, o.w * 0.3, o.h);
        // top/bottom emitters
        ctx.shadowColor = COL.magenta;
        ctx.fillStyle = COL.magenta;
        ctx.beginPath();
        ctx.arc(o.x + o.w / 2, o.y, 8, 0, Math.PI * 2);
        ctx.arc(o.x + o.w / 2, o.y + o.h, 8, 0, Math.PI * 2);
        ctx.fill();
      } else if (o.kind === 'flare') {
        const cx = o.x + o.w / 2;
        const cy = o.y + o.h / 2;
        const r = o.w / 2;
        ctx.shadowBlur = this.lite ? 0 : 30;
        ctx.shadowColor = COL.sun;
        if (this.lite) {
          ctx.fillStyle = '#ff8030';
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#fff8c0';
          ctx.beginPath();
          ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
          ctx.fill();
        } else {
          const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
          g.addColorStop(0, '#fff8c0');
          g.addColorStop(0.4, '#ff8030');
          g.addColorStop(1, 'rgba(255, 40, 100, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (o.kind === 'neon') {
        ctx.shadowBlur = this.lite ? 0 : 18;
        ctx.shadowColor = COL.cyan;
        ctx.fillStyle = COL.cyan;
        roundRect(ctx, o.x, o.y, o.w, o.h, 4);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        roundRect(ctx, o.x + 4, o.y + 4, o.w - 8, o.h - 8, 2);
        ctx.fill();
      } else if (o.kind === 'ring') {
        const cx = o.x + o.w / 2;
        const cy = o.y + o.h / 2;
        ctx.shadowBlur = this.lite ? 0 : 16;
        ctx.shadowColor = COL.purple;
        ctx.strokeStyle = COL.purple;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.ellipse(cx, cy, o.w / 2, o.h / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
        if (o.boostT > 0) {
          // Gate boost cue: the ring flashes gold and a gold echo expands out of it.
          const k = o.boostT / GATE_GLOW_SECONDS;
          const grow = 1 + (1 - k) * 0.7;
          ctx.save();
          ctx.globalAlpha = k;
          ctx.shadowColor = '#ffe66d';
          ctx.strokeStyle = '#ffe66d';
          ctx.lineWidth = 7;
          ctx.stroke();
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(cx, cy, (o.w / 2) * grow, (o.h / 2) * grow, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        // danger zones top/bottom of ring (outer rim already stroke; hit is outer)
      }
      ctx.shadowBlur = 0;
      if (hitK > 0) {
        // Hit flash: a white glow over the hazard, fading out.
        ctx.globalAlpha = 0.75 * hitK;
        ctx.fillStyle = '#ffffff';
        if (o.kind === 'flare') {
          ctx.beginPath();
          ctx.arc(o.x + o.w / 2, o.y + o.h / 2, o.w * 0.42, 0, Math.PI * 2);
          ctx.fill();
        } else {
          roundRect(ctx, o.x - 2, o.y - 2, o.w + 4, o.h + 4, 4);
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  drawCollectibles(ctx: CanvasRenderingContext2D, items: Collectible[]): void {
    for (const c of items) {
      if (c.kind !== 'shade') {
        ctx.save();
        ctx.translate(c.x, c.y + Math.sin(c.phase) * 3);
        drawAppliance(ctx, c.kind, c.phase);
        ctx.restore();
        continue;
      }
      const bob = Math.sin(c.phase) * 3;
      ctx.save();
      ctx.translate(c.x, c.y + bob);
      ctx.rotate(c.phase * 0.5);
      ctx.shadowBlur = this.lite ? 0 : 16;
      ctx.shadowColor = COL.cyan;
      // sunglasses collectible
      ctx.fillStyle = '#111';
      roundRect(ctx, -12, -6, 10, 10, 2);
      roundRect(ctx, 2, -6, 10, 10, 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(0, 255, 220, 0.85)';
      roundRect(ctx, -10, -4, 6, 6, 1);
      roundRect(ctx, 4, -4, 6, 6, 1);
      ctx.fill();
      ctx.strokeStyle = COL.magenta;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-2, -1);
      ctx.lineTo(2, -1);
      ctx.stroke();
      if (!this.lite) {
        ctx.strokeStyle = `rgba(0, 240, 255, ${0.3 + Math.sin(c.phase * 2) * 0.2})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, c.r + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      ctx.shadowBlur = 0;
    }
  }

  drawHud(
    ctx: CanvasRenderingContext2D,
    score: number,
    high: number,
    charge: number,
    distance: number,
    levelInfo: LevelInfo | null = null,
    speedTag: string | null = null,
  ): void {
    this.speedTagRect = null;
    const W = this.W;
    const big = this.touchUi;
    const portrait = this.H > this.W * 1.1;
    ctx.save();
    const left = this.padLeft + this.u(20);
    const chrome = (big ? this.chromeRight : 0) + this.padRight + this.u(big ? 12 : 20);
    const rightBound = W - chrome;

    if (big && portrait) {
      const top = this.padTop + this.u(16);
      const maxTw = Math.max(80, rightBound - left);
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      this.fitFont(
        ctx,
        `${tr('hud_score')}${fmtScore(score)}`,
        '700',
        this.u(24),
        "'Rajdhani', sans-serif",
        maxTw,
        this.u(16),
      );
      this.duckLine(ctx, tr('hud_score'), score, left, top + this.u(24), 'left');
      ctx.fillStyle = 'rgba(0, 240, 255, 0.88)';
      this.fitFont(
        ctx,
        tr('hud_best', { s: fmtScore(high), d: Math.floor(distance) }),
        '700',
        this.u(18),
        "'Rajdhani', sans-serif",
        maxTw,
        this.u(14),
      );
      ctx.fillText(tr('hud_best', { s: fmtScore(high), d: Math.floor(distance) }), left, top + this.u(50));
      this.drawChargeBar(ctx, left, rightBound, top + this.u(68), charge);
      const end = levelInfo ? this.drawLevelTag(ctx, levelInfo, left, top + this.u(102), 'left', this.u(16), maxTw) : left;
      if (speedTag) this.drawSpeedTagFit(ctx, speedTag, end + this.u(10), rightBound, top + this.u(102), this.u(12));
    } else if (big) {
      // Landscape / short: two-line HUD so mute/pause chrome never eats the score.
      const top = this.padTop + this.u(10);
      const maxTw = Math.max(80, rightBound - left);
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      this.fitFont(
        ctx,
        `${tr('hud_score')}${fmtScore(score)}`,
        '700',
        this.u(18),
        "'Rajdhani', sans-serif",
        maxTw,
        this.u(14),
      );
      this.duckLine(ctx, tr('hud_score'), score, left, top + this.u(18), 'left');
      ctx.fillStyle = 'rgba(0, 240, 255, 0.88)';
      this.fitFont(
        ctx,
        tr('hud_best', { s: fmtScore(high), d: Math.floor(distance) }),
        '700',
        this.u(15),
        "'Rajdhani', sans-serif",
        maxTw,
        this.u(12),
      );
      ctx.fillText(
        tr('hud_best', { s: fmtScore(high), d: Math.floor(distance) }),
        left,
        top + this.u(38),
      );
      this.drawChargeBar(ctx, left, rightBound, top + this.u(44), charge);
      const end = levelInfo ? this.drawLevelTag(ctx, levelInfo, left, top + this.u(82), 'left', this.u(14), maxTw) : left;
      if (speedTag) this.drawSpeedTagFit(ctx, speedTag, end + this.u(12), rightBound, top + this.u(82), this.u(12));
    } else {
      ctx.font = `700 ${this.u(18)}px 'Rajdhani', sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.textAlign = 'left';
      const topY = this.padTop + this.u(32);
      this.duckLine(ctx, tr('hud_score'), score, left, topY, 'left');
      ctx.fillStyle = 'rgba(0, 240, 255, 0.85)';
      // Distance rides on the BEST line (the top-right corner belongs to QUIT / mute).
      ctx.fillText(tr('hud_best', { s: fmtScore(high), d: Math.floor(distance) }), left, this.padTop + this.u(54));
      const bw = this.u(180);
      this.drawChargeBar(ctx, W / 2 - bw / 2, W / 2 + bw / 2, this.padTop + this.u(18), charge);
      if (levelInfo) {
        // Under BEST on the left (the top-right corner belongs to the mute / pause buttons).
        this.drawLevelTag(ctx, levelInfo, left, this.padTop + this.u(78), 'left', this.u(15), W * 0.34);
      }
      // GAME SPEED tag: under the shade bar, centred (clear of SCORE / BEST and the corner buttons).
      if (speedTag) this.drawSpeedTag(ctx, speedTag, W / 2, this.padTop + this.u(50), this.u(12), 'center', false);
    }
    ctx.restore();
  }

  /**
   * GAME SPEED tag on a touch HUD row: the full "SPEED 5.5x" pill if it fits between minX (the end
   * of the LVL / dogs line) and maxX, else the compact "▶▶ 5.5x" pill, right-aligned at maxX.
   */
  /** Last GAME SPEED tag drawn (view units; layout checks in tests). */
  speedTagRect: { x: number; y: number; w: number; h: number; text: string } | null = null;
  /** Desktop initials OK button (view units); null on touch (DOM BOOST is OK). */
  iniOkRect: { x: number; y: number; w: number; h: number } | null = null;

  private drawSpeedTagFit(ctx: CanvasRenderingContext2D, full: string, minX: number, maxX: number, y: number, size: number): void {
    const compact = full.replace(/^[^0-9]*/, '');
    if (this.speedTagWidth(ctx, full, size, false) <= maxX - minX) this.drawSpeedTag(ctx, full, maxX, y, size, 'right', false);
    else this.drawSpeedTag(ctx, compact, maxX, y, size, 'right', true);
  }

  private speedTagWidth(ctx: CanvasRenderingContext2D, text: string, size: number, icon: boolean): number {
    ctx.save();
    ctx.font = `800 ${size}px 'Orbitron', sans-serif`;
    const tw = ctx.measureText(text).width;
    ctx.restore();
    return tw + size * 1.2 + (icon ? size * 1.25 : 0);
  }

  /**
   * Small gold pill (HUD, only when the GAME SPEED isn't 1.0): "SPEED 5.5x", or with icon a
   * drawn fast-forward mark and "5.5x". x is its right edge (or centre); y the text baseline.
   */
  private drawSpeedTag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, align: 'right' | 'center', icon: boolean): void {
    ctx.save();
    const w = this.speedTagWidth(ctx, text, size, icon);
    ctx.font = `800 ${size}px 'Orbitron', sans-serif`;
    const h = size * 1.55;
    const left = align === 'right' ? x - w : x - w / 2;
    const top = y - size * 1.12;
    this.speedTagRect = { x: left, y: top, w, h, text };
    ctx.fillStyle = 'rgba(20, 8, 0, 0.72)';
    ctx.strokeStyle = 'rgba(255, 210, 90, 0.9)';
    ctx.lineWidth = Math.max(1, size * 0.11);
    roundRect(ctx, left, top, w, h, h / 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffe66d';
    let tx = left + size * 0.6;
    if (icon) {
      // Two small triangles (fast forward).
      const th = size * 0.7;
      const cy = top + h / 2;
      for (let k = 0; k < 2; k++) {
        const ax = tx + k * th * 0.62;
        ctx.beginPath();
        ctx.moveTo(ax, cy - th / 2);
        ctx.lineTo(ax + th * 0.62, cy);
        ctx.lineTo(ax, cy + th / 2);
        ctx.closePath();
        ctx.fill();
      }
      tx += size * 1.25;
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, tx, top + h / 2 + size * 0.38);
    ctx.restore();
  }

  /** Bottom of the HUD text block (the LVL line), so in-lane overlays like the boss title clear it. */
  hudBottom(W: number, H: number): number {
    const portrait = H > W * 1.1;
    if (this.touchUi && portrait) return this.padTop + this.u(16 + 102 + 8);
    if (this.touchUi) return this.padTop + this.u(10 + 82 + 8);
    return this.padTop + this.u(86);
  }

  /** "LVL 12 · 2 SHIPS" in gold (HUD). */
  private drawLevelTag(
    ctx: CanvasRenderingContext2D,
    info: LevelInfo,
    x: number,
    y: number,
    align: CanvasTextAlign,
    size: number,
    maxW: number,
  ): number {
    // "LVL 10  ·  1 dog": the count and the word are drawn apart (count in Orbitron, word in a
    // different face, size and colour), so "1 DOG" can never read as "100G" in Orbitron.
    const lvl = info.ships > 0 || info.label ? `${tr('hud_lvl', { n: info.level })}  ·  ` : tr('hud_lvl', { n: info.level });
    const count = info.label ? '' : info.ships > 0 ? formatShips(info.ships) : '';
    const word = info.label ?? (info.ships > 0 ? (info.ships === 1 ? tr('hud_dog') : tr('hud_dogs')) : '');
    ctx.textAlign = 'left';
    const orb = "'Orbitron', sans-serif";
    const raj = "'Rajdhani', 'Segoe UI', sans-serif";
    let fs = size;
    const measure = (): number => {
      ctx.font = `700 ${fs}px ${orb}`;
      const a = ctx.measureText(lvl + count).width;
      ctx.font = `700 ${fs * 1.08}px ${raj}`;
      return a + fs * 0.6 + (word ? ctx.measureText(word).width : 0);
    };
    while (measure() > maxW && fs > Math.min(size, 11)) fs -= 1;
    const total = measure();
    let tx = align === 'right' ? x - total : align === 'center' ? x - total / 2 : x;
    ctx.fillStyle = 'rgba(255, 230, 109, 0.95)';
    ctx.font = `700 ${fs}px ${orb}`;
    ctx.fillText(lvl + count, tx, y);
    tx += ctx.measureText(lvl + count).width + fs * 0.6;
    if (word) {
      ctx.fillStyle = 'rgba(127, 255, 255, 0.95)';
      ctx.font = `700 ${fs * 1.08}px ${raj}`;
      ctx.fillText(word, tx, y);
      tx += ctx.measureText(word).width;
    }
    const text = lvl + count;
    void text;
    if (info.dogs && info.dogs.length) {
      // Dogs left: one icon per dog (sunglasses on, no flame), bigger as the pack shrinks.
      const iw = this.u(22) * (info.dogIconScale ?? 1);
      const ih = iw * (SPRITE_H / SPRITE_W);
      let ix = tx + this.u(12);
      const cy = y - size * 0.38;
      for (const b of info.dogs) {
        ctx.drawImage(shipSprite(b, { flame: false, accent: '#ffe66d' }), ix, cy - ih / 2, iw, ih);
        ix += iw + this.u(4);
      }
      return ix;
    }
    return tx;
  }

  /** Level-up banner, e.g. "LEVEL 12 · 2 SHIPS"; `t` counts down from `dur` seconds. */
  drawLevelBanner(ctx: CanvasRenderingContext2D, text: string, t: number, dur: number, atY?: number, atX?: number, maxW?: number): void {
    if (t <= 0) return;
    const W = this.W;
    const H = this.H;
    const age = dur - t;
    const a = Math.min(1, age / 0.18, t / 0.45);
    const portrait = H > W * 1.1;
    ctx.save();
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = this.fitFont(ctx, text, '800', this.u(portrait ? 30 : 28), "'Orbitron', sans-serif", maxW ? maxW * 0.8 : W * 0.82, maxW ? 11 : 14);
    const tw = ctx.measureText(text).width;
    const cy = atY ?? (portrait ? H * 0.3 : H * 0.34);
    const cx = atX ?? W / 2;
    const bh = size * 1.9;
    const bw = tw + size * 1.6;
    ctx.fillStyle = 'rgba(8, 0, 20, 0.72)';
    roundRect(ctx, cx - bw / 2, cy - bh / 2, bw, bh, bh / 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 220, 110, 0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffe66d';
    if (!this.lite) {
      ctx.shadowBlur = 14;
      ctx.shadowColor = 'rgba(255, 180, 60, 0.9)';
    }
    ctx.fillText(text, cx, cy + 1);
    ctx.restore();
  }

  /** Height of the level banner pill for this text (to stack things under it). */
  levelBannerHeight(ctx: CanvasRenderingContext2D, text: string, maxW?: number): number {
    const portrait = this.H > this.W * 1.1;
    ctx.save();
    const size = this.fitFont(ctx, text, '800', this.u(portrait ? 30 : 28), "'Orbitron', sans-serif", maxW ? maxW * 0.8 : this.W * 0.82, maxW ? 11 : 14);
    ctx.restore();
    return size * 1.9;
  }

  /**
   * How to Play step: the level-up banner (held fully visible) as the title, hint lines
   * under it on the same dark backdrop, and a small step counter above.
   */
  drawTutorial(ctx: CanvasRenderingContext2D, step: number, total: number, title: string, lines: string[]): void {
    const W = this.W;
    const H = this.H;
    const portrait = H > W * 1.1;
    const cy = portrait ? H * 0.27 : H * 0.25;
    this.drawLevelBanner(ctx, title, 1, 2, cy);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const maxW = W * (portrait ? 0.88 : 0.7);
    ctx.fillStyle = 'rgba(0, 240, 255, 0.85)';
    this.fillFitted(ctx, tr('tut_head', { s: step, t: total }), W / 2, cy - this.u(portrait ? 40 : 36), '700', this.u(13), "'Orbitron', sans-serif", maxW, 10);
    if (lines.length) {
      const fs = this.u(portrait ? 18 : 17);
      const lh = fs * 1.3;
      let bw = 0;
      for (const line of lines) {
        const size = this.fitFont(ctx, line, '700', fs, "'Rajdhani', sans-serif", maxW, 11);
        bw = Math.max(bw, ctx.measureText(line).width + size * 1.6);
      }
      const top = cy + this.u(portrait ? 30 : 28);
      const bh = lh * lines.length + fs * 0.7;
      ctx.fillStyle = 'rgba(8, 0, 20, 0.72)';
      roundRect(ctx, W / 2 - bw / 2, top, bw, bh, fs * 0.6);
      ctx.fill();
      let y = top + fs * 0.35 + lh / 2;
      lines.forEach((line, i) => {
        ctx.fillStyle = i === lines.length - 1 && lines.length > 1 ? 'rgba(0, 240, 255, 0.9)' : 'rgba(255,255,255,0.92)';
        this.fillFitted(ctx, line, W / 2, y, '700', fs, "'Rajdhani', sans-serif", maxW, 11);
        y += lh;
      });
    }
    ctx.restore();
  }

  /** Drawn clones (at most MAX_DRAWN_SHIPS - 1) plus an "x N" counter when there are more ships. */
  drawClones(ctx: CanvasRenderingContext2D, f: Formation, ships: number, px: number, py: number): void {
    if (f.occupiedCount === 0 && ships <= MAX_DRAWN_SHIPS) return;
    const blinkOff = Math.floor(this.time * 20) % 2 === 0;
    for (const s of f.slots) {
      if (!s.occupied) continue;
      if (s.invuln > 0 && blinkOff) continue;
      // Each clone is its own dog (shared ship sprite), at its breed-normalised scale.
      const img = shipSprite(s.breed, { flame: true, accent: '#ffe66d' });
      const k = s.scale;
      ctx.drawImage(img, s.x - SPRITE_AX * k, s.y - SPRITE_AY * k, SPRITE_W * k, SPRITE_H * k);
    }
    if (ships > MAX_DRAWN_SHIPS) {
      const text = `x ${formatShips(ships)}`;
      ctx.save();
      ctx.font = `800 ${this.u(15)}px 'Orbitron', sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const tx = Math.min(px + f.extRight + 26, this.W - ctx.measureText(text).width - 8);
      const ty = Math.max(this.padTop + 12, py - f.extUp - 4);
      ctx.fillStyle = 'rgba(8, 0, 20, 0.6)';
      const tw = ctx.measureText(text).width;
      roundRect(ctx, tx - 6, ty - this.u(11), tw + 12, this.u(22), 8);
      ctx.fill();
      ctx.fillStyle = '#ffe66d';
      ctx.fillText(text, tx, ty + 1);
      ctx.restore();
    }
  }

  /**
   * A fan mode's swarm: every occupied slot, each its own dog (shared ship sprite) at its
   * own normalised scale. Dogs under ~16 px wide (or 'dot' style) are stamped as a cached
   * minimal dog glyph (at least ~10 px wide); bigger ones are one drawImage each of a cached sprite.
   * `hidden` is a slot not drawn (decoy "dead"). An "x N" counter covers ships beyond the
   * drawn ones (only if a swarm is ever capped).
   */
  drawSwarm(
    ctx: CanvasRenderingContext2D,
    f: Formation,
    tint: string,
    style: string,
    ships: number,
    px: number,
    py: number,
    hidden: object | null = null,
  ): void {
    const blinkOff = Math.floor(this.time * 20) % 2 === 0;
    const minW = this.u(10);
    const tiny = this.tinyDogs;
    tiny.length = 0;
    for (const s of f.slots) {
      if (!s.occupied || s === hidden) continue;
      if (s.invuln > 0 && blinkOff) continue;
      const k = s.scale;
      if (style === 'dot' || SPRITE_W * k < 16) {
        // Tiny dog: the minimal glyph, drawn at least minW wide so it still reads as a dog.
        tiny.push(s);
      } else {
        const img = shipSprite(s.breed, { accent: tint, outline: style === 'outline', flame: true });
        ctx.drawImage(img, s.x - SPRITE_AX * k, s.y - SPRITE_AY * k, SPRITE_W * k, SPRITE_H * k);
      }
    }
    for (const d of tiny) {
      const gp = Math.max(minW, 55 * d.scale) / GLYPH_W; // one glyph px
      ctx.drawImage(dogGlyph(d.breed), d.x - (GLYPH_AX + 1) * gp, d.y - (GLYPH_AY + 1) * gp, (GLYPH_W + 2) * gp, (GLYPH_H + 2) * gp);
    }
    const undrawn = ships - 1 - f.occupiedCount;
    if (undrawn > 0) {
      const text = `x ${formatShips(ships)}`;
      ctx.save();
      ctx.font = `800 ${this.u(15)}px 'Orbitron', sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const tw = ctx.measureText(text).width;
      const tx = Math.min(px + f.extRight + 26, this.W - tw - 8);
      const ty = Math.max(this.padTop + 12, py - f.extUp - 4);
      ctx.fillStyle = 'rgba(8, 0, 20, 0.6)';
      roundRect(ctx, tx - 6, ty - this.u(11), tw + 12, this.u(22), 8);
      ctx.fill();
      ctx.fillStyle = '#ffe66d';
      ctx.fillText(text, tx, ty + 1);
      ctx.restore();
    }
  }

  private drawChargeBar(
    ctx: CanvasRenderingContext2D,
    leftBound: number,
    rightBound: number,
    by: number,
    charge: number,
  ): void {
    const available = Math.max(this.u(120), rightBound - leftBound);
    const bw = Math.min(this.u(this.touchUi ? 240 : 180), available);
    const bx = leftBound + (available - bw) / 2;
    const bh = Math.max(12, this.u(this.touchUi ? 16 : 14));
    ctx.textAlign = 'center';
    ctx.font = `600 ${this.u(this.touchUi ? 13 : 12)}px 'Orbitron', sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(tr('shade_charge'), bx + bw / 2, by - 2);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, bx, by + 4, bw, bh, 7);
    ctx.fill();
    if (this.lite) {
      ctx.fillStyle = charge > 0.3 ? COL.cyan : COL.sun;
    } else {
      const cg = ctx.createLinearGradient(bx, 0, bx + bw, 0);
      cg.addColorStop(0, COL.sun);
      cg.addColorStop(0.5, COL.magenta);
      cg.addColorStop(1, COL.cyan);
      ctx.fillStyle = cg;
      ctx.shadowBlur = 10;
      ctx.shadowColor = COL.cyan;
    }
    roundRect(ctx, bx + 2, by + 6, Math.max(0, (bw - 4) * charge), bh - 4, 5);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    roundRect(ctx, bx, by + 4, bw, bh, 7);
    ctx.stroke();
  }

  applyPost(
    ctx: CanvasRenderingContext2D,
    charge: number,
  ): void {
    const W = this.W;
    const H = this.H;

    // glare washout when low charge (flat wash on lite — skip radial on iOS)
    const glare = clamp(1 - charge, 0, 1);
    if (glare > 0.05) {
      if (this.lite) {
        ctx.fillStyle = `rgba(255, 200, 120, ${0.22 * glare})`;
        ctx.fillRect(0, 0, W, H);
      } else {
        const g = ctx.createRadialGradient(W * 0.7, H * 0.25, 20, W * 0.5, H * 0.4, W * 0.8);
        g.addColorStop(0, `rgba(255, 240, 180, ${0.55 * glare})`);
        g.addColorStop(0.45, `rgba(255, 120, 60, ${0.28 * glare})`);
        g.addColorStop(1, `rgba(255, 40, 120, ${0.12 * glare})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = `rgba(255, 255, 230, ${0.08 * glare})`;
        ctx.fillRect(0, 0, W, H);
      }
    }

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${this.flash * 0.45})`;
      ctx.fillRect(0, 0, W, H);
    }

    // vignette — lite uses a cheap edge wash (radial grads are costly on iOS)
    if (this.lite) {
      ctx.fillStyle = 'rgba(10, 0, 25, 0.28)';
      ctx.fillRect(0, 0, W, 18);
      ctx.fillRect(0, H - 18, W, 18);
      ctx.fillRect(0, 0, 14, H);
      ctx.fillRect(W - 14, 0, 14, H);
    } else {
      const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(10, 0, 25, 0.55)');
      ctx.fillStyle = v;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'rgba(0,0,0,0.06)';
      for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);
    }

  }

  drawTitle(ctx: CanvasRenderingContext2D, high: number, pulse: number): void {
    const W = this.W;
    const H = this.H;
    const big = this.touchUi;
    const portrait = H > W * 1.1;
    // Centered copy must inset BOTH sides by the mute/pause chrome, or Orbitron
    // titles clip under the top-right buttons on iPhone-width portrait.
    const side = Math.max(this.padLeft, this.padRight) + this.u(big ? 18 : 24) + (big ? Math.max(this.u(56), this.chromeRight * 0.55) : 0);
    const maxTw = Math.max(this.u(140), W - side * 2);
    ctx.fillStyle = 'rgba(5, 0, 18, 0.55)';
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'center';
    ctx.shadowBlur = this.lite ? 0 : 24;
    ctx.shadowColor = COL.magenta;
    ctx.fillStyle = COL.pink;
    if (big) {
      // Leave bottom band clear for START thumb button (taller on portrait).
      const floor = H - this.padBottom - H * (portrait ? 0.24 : 0.34);
      const cx = W / 2;
      // Sit fully below mute chrome / Dynamic Island (baseline, not cap-height).
      let y = this.padTop + this.u(portrait ? 96 : 44);

      const titleSize = this.fitFont(
        ctx,
        "FUTURE'S SO",
        '900',
        this.u(portrait ? 42 : 28),
        "'Orbitron', sans-serif",
        maxTw,
        this.u(22),
      );
      ctx.fillText("FUTURE'S SO", cx, y);
      y += titleSize * 1.05;
      this.fillFitted(ctx, 'BRIGHT', cx, y, '900', titleSize, "'Orbitron', sans-serif", maxTw, this.u(22));

      ctx.shadowBlur = 0;

      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      y = Math.min(y + this.u(portrait ? 44 : 32), floor - this.u(portrait ? 120 : 78));
      this.fillFitted(
        ctx,
        portrait ? tr('title_dodge_p') : tr('title_dodge_l'),
        cx,
        y,
        '700',
        this.u(portrait ? 19 : 16),
        "'Rajdhani', sans-serif",
        maxTw,
        this.u(14),
      );

      ctx.fillStyle = 'rgba(210, 190, 255, 0.92)';
      y = Math.min(y + this.u(portrait ? 28 : 20), floor - this.u(portrait ? 94 : 58));
      const handLabel = document.body.classList.contains('hand-left') ? tr('hand_left') : tr('hand_right');
      this.fillFitted(
        ctx,
        portrait
          ? tr('title_stick_p', { hand: handLabel })
          : tr('title_stick_l', { hand: handLabel }),
        cx,
        y,
        '600',
        this.u(portrait ? 17 : 15),
        "'Rajdhani', sans-serif",
        maxTw,
        this.u(13),
      );

      if (portrait) {
        y = Math.min(y + this.u(24), floor - this.u(72));
        this.fillFitted(
          ctx,
          tr('title_collect'),
          cx,
          y,
          '600',
          this.u(17),
          "'Rajdhani', sans-serif",
          maxTw,
          this.u(13),
        );
      }

      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      y = Math.min(y + this.u(portrait ? 30 : 22), floor - this.u(portrait ? 44 : 36));
      this.fillFitted(
        ctx,
        tr('title_high', { s: fmtScore(high) }),
        cx,
        y,
        '700',
        this.u(portrait ? 19 : 16),
        "'Rajdhani', sans-serif",
        maxTw,
        this.u(14),
      );

      const alpha = 0.55 + Math.sin(pulse * 4) * 0.35;
      ctx.fillStyle = `rgba(0, 240, 255, ${alpha})`;
      y = Math.min(y + this.u(portrait ? 32 : 24), floor - this.u(10));
      this.fillFitted(
        ctx,
        tr('title_tap'),
        cx,
        y,
        '700',
        this.u(portrait ? 22 : 18),
        "'Orbitron', sans-serif",
        maxTw,
        this.u(14),
      );
    } else {
      const titleSize = this.u(42);
      const titleY = H * 0.26;
      ctx.font = `900 ${titleSize}px 'Orbitron', sans-serif`;
      ctx.fillText("FUTURE'S SO", W / 2, titleY);
      ctx.fillText('BRIGHT', W / 2, titleY + titleSize * 1.05);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = `700 18px 'Rajdhani', sans-serif`;
      fillMax(ctx, tr('desk_dodge'), W / 2, H * 0.46, W * 0.94);
      ctx.fillStyle = 'rgba(200, 180, 255, 0.88)';
      ctx.font = `600 15px 'Rajdhani', sans-serif`;
      fillMax(ctx, tr('desk_keys'), W / 2, H * 0.53, W * 0.94);
      ctx.font = `700 15px 'Rajdhani', sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      fillMax(ctx, tr('title_high', { s: fmtScore(high) }), W / 2, H * 0.6, W * 0.94);
      const alpha = 0.55 + Math.sin(pulse * 4) * 0.35;
      ctx.fillStyle = `rgba(0, 240, 255, ${alpha})`;
      ctx.font = `700 20px 'Orbitron', sans-serif`;
      fillMax(ctx, tr('desk_press'), W / 2, H * 0.72, W * 0.94);
    }
  }

  /**
   * Donkey Kong-style stage interstitial (~2 s): "LEVEL N COMPLETED" / "YOU'VE BEEN PROMOTED!"
   * over the dimmed, frozen play field, in the title / level-banner style. `t` counts down.
   */
  drawPromotion(ctx: CanvasRenderingContext2D, title: string, sub: string, t: number, dur: number, score: number): void {
    const W = this.W;
    const H = this.H;
    const portrait = H > W * 1.1;
    const age = dur - t;
    const a = clamp(Math.min(age / 0.15, t / 0.2), 0, 1);
    const side = Math.max(this.padLeft, this.padRight) + this.u(20);
    const maxW = Math.max(this.u(140), W - side * 2);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(5, 0, 18, 0.86)';
    ctx.fillRect(0, 0, W, H);
    const cy = portrait ? H * 0.4 : H * 0.42;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Title: gold, glowing (level-banner colours).
    ctx.fillStyle = '#ffe66d';
    if (!this.lite) {
      ctx.shadowBlur = 22;
      ctx.shadowColor = 'rgba(255, 180, 60, 0.95)';
    }
    const ts = this.fitFont(ctx, title, '900', this.u(portrait ? 34 : 40), "'Orbitron', sans-serif", maxW, this.u(16));
    fillMax(ctx, title, W / 2, cy, maxW);
    // Subtitle pops in a beat later and blinks like an arcade attract line.
    if (age > 0.35) {
      const blink = Math.floor(age * 6) % 2 === 0 || age > 0.85;
      if (blink) {
        ctx.fillStyle = COL.cyan;
        ctx.shadowColor = COL.cyan;
        this.fillFitted(ctx, sub, W / 2, cy + ts * 1.5, '800', this.u(portrait ? 22 : 24), "'Orbitron', sans-serif", maxW, this.u(12));
      }
    }
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    this.fillFitted(ctx, tr('promo_score', { s: fmtScore(score) }), W / 2, cy + ts * 1.5 + this.u(portrait ? 48 : 46), '700', this.u(20), "'Rajdhani', sans-serif", maxW, this.u(12));
    // Neon rule above and below, like the title card.
    const rw = Math.min(maxW, this.u(portrait ? 300 : 440));
    ctx.fillStyle = COL.magenta;
    ctx.fillRect(W / 2 - rw / 2, cy - ts * 1.1, rw, Math.max(2, this.u(3)));
    ctx.fillRect(W / 2 - rw / 2, cy + ts * 1.5 + this.u(portrait ? 76 : 72), rw, Math.max(2, this.u(3)));
    ctx.restore();
  }

  /** The pause screen's stall door (view units); the GAME SPEED panel is placed from it. */
  pauseDoorRect(): { x: number; y: number; w: number; h: number } {
    const dw = Math.min(this.W * 0.72, this.u(330));
    const dh = Math.min(this.H * 0.62, this.u(300));
    const dx = this.W / 2 - dw / 2;
    const dy = Math.max(this.padTop + this.u(70), this.H * 0.42 - dh * 0.55);
    return { x: dx, y: dy, w: dw, h: dh };
  }

  /** panelTop (view units): where the GAME SPEED panel starts; door text moves above it. */
  drawPause(ctx: CanvasRenderingContext2D, panelTop = Infinity): void {
    const big = this.touchUi;
    ctx.fillStyle = 'rgba(5, 0, 18, 0.65)';
    ctx.fillRect(0, 0, this.W, this.H);
    {
      // Bathroom stall door, pushed slightly open, with crayon writing (silliness pack).
      const { x: dx, y: dy, w: dw, h: dh } = this.pauseDoorRect();
      ctx.save();
      ctx.translate(dx, dy);
      ctx.transform(0.94, -0.03, 0, 1, 0, 0);
      const g = ctx.createLinearGradient(0, 0, dw, 0);
      g.addColorStop(0, '#5f857f');
      g.addColorStop(0.45, '#79a59d');
      g.addColorStop(1, '#5c7f79');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, dw, dh);
      ctx.strokeStyle = '#3f5b57';
      ctx.lineWidth = 4;
      ctx.strokeRect(0, 0, dw, dh);
      ctx.fillStyle = '#c4cccc';
      ctx.fillRect(-8, dh * 0.12, 7, dh * 0.12);
      ctx.fillRect(-8, dh * 0.76, 7, dh * 0.12);
      ctx.fillStyle = '#c0392b';
      ctx.fillRect(dw - this.u(74), this.u(8), this.u(64), this.u(16));
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${this.u(10)}px sans-serif`;
      ctx.textAlign = 'center';
      fillMax(ctx, tr('door_occupied'), dw - this.u(42), this.u(20), this.u(60));
      const crayon = (txt: string, x: number, y: number, size: number, col: string, rot: number): void => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(rot);
        ctx.font = `900 ${size}px 'Comic Sans MS', 'Chalkboard SE', 'Marker Felt', cursive`;
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.9;
        fillMax(ctx, txt, 0, 0, dw * 0.9);
        ctx.globalAlpha = 0.45;
        fillMax(ctx, txt, 1.2, 0.8, dw * 0.9);
        ctx.restore();
      };
      // The GAME SPEED panel may cover the door's lower part (short landscape screens): then the
      // writing moves up into the part still showing (and the FSB scribble is skipped).
      const open = Math.min(dh, panelTop - dy);
      const k = open < dh * 0.95 ? Math.max(0.5, open / dh) : 1;
      crayon(tr('door_paused'), dw / 2, k < 1 ? open * 0.5 : dh * 0.42, this.u(k < 1 ? 30 : 34), '#c81e1e', -0.04);
      crayon(big ? tr('door_tap') : tr('door_keys'), dw / 2, k < 1 ? open * 0.82 : dh * 0.62, this.u(big ? 18 : 15), '#1d4ed8', 0.03);
      if (k === 1) crayon(tr('door_fsb'), dw * 0.3, dh * 0.86, this.u(11), '#136c33', -0.1);
      ctx.restore();
      return;
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = COL.cyan;
    ctx.font = `900 ${this.u(36)}px 'Orbitron', sans-serif`;
    ctx.shadowBlur = this.lite ? 0 : 20;
    ctx.shadowColor = COL.cyan;
    const pauseY = Math.max(this.padTop + this.u(80), this.H * 0.42);
    ctx.fillText(tr('door_paused'), this.W / 2, pauseY);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `600 ${this.u(big ? 20 : 16)}px 'Rajdhani', sans-serif`;
    ctx.fillText(
      big ? tr('pause_tap') : tr('door_keys'),
      this.W / 2,
      pauseY + this.u(40),
    );
  }

  drawInitialsEntry(
    ctx: CanvasRenderingContext2D,
    score: number,
    chars: string[],
    slot: number,
    pulse: number,
    warn = '',
  ): void {
    const big = this.touchUi;
    const portrait = this.H > this.W * 1.1;
    const W = this.W;
    const H = this.H;
    const side =
      Math.max(this.padLeft, this.padRight) +
      this.u(big ? 18 : 24) +
      (big ? Math.max(this.u(56), this.chromeRight * 0.55) : 0);
    const maxTw = Math.max(this.u(140), W - side * 2);
    const cx = W / 2;
    ctx.fillStyle = 'rgba(8, 0, 20, 0.78)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.shadowBlur = this.lite ? 0 : 20;
    ctx.shadowColor = COL.cyan;
    ctx.fillStyle = COL.cyan;
    const titleY = this.padTop + H * (big ? (portrait ? 0.12 : 0.14) : 0.18);
    this.fillFitted(
      ctx,
      tr('ini_new'),
      cx,
      titleY,
      '900',
      this.u(big ? (portrait ? 32 : 26) : 28),
      "'Orbitron', sans-serif",
      maxTw,
      this.u(18),
    );
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    this.fillFitted(
      ctx,
      tr('ini_score', { s: fmtScore(score) }),
      cx,
      titleY + this.u(big ? (portrait ? 36 : 28) : 32),
      '700',
      this.u(big ? (portrait ? 24 : 18) : 20),
      "'Rajdhani', sans-serif",
      maxTw,
      this.u(14),
    );
    ctx.fillStyle = 'rgba(255, 180, 230, 0.9)';
    this.fillFitted(
      ctx,
      tr('ini_enter'),
      cx,
      titleY + this.u(big ? (portrait ? 64 : 50) : 56),
      '700',
      this.u(big ? (portrait ? 18 : 14) : 16),
      "'Orbitron', sans-serif",
      maxTw,
      this.u(12),
    );

    const letterSize = this.u(big ? (portrait ? 64 : 52) : 56);
    const gap = this.u(big ? 48 : 40);
    const lettersY = Math.min(
      H * (portrait ? 0.48 : 0.5),
      titleY + this.u(big ? (portrait ? 160 : 120) : 130),
    );
    const totalW = letterSize * 3 + gap * 2;
    let lx = cx - totalW / 2 + letterSize / 2;
    for (let i = 0; i < 3; i++) {
      const active = i === slot;
      const bob = active ? Math.sin(pulse * 6) * 3 : 0;
      // Vietnamese letters, Chinese characters, ★ and emojis fall back to fonts that have them.
      ctx.font = `900 ${letterSize}px 'Orbitron', ${GLYPH_FALLBACK}`;
      ctx.fillStyle = active ? COL.cyan : COL.pink;
      ctx.shadowBlur = this.lite ? 0 : active ? 18 : 8;
      ctx.shadowColor = active ? COL.cyan : COL.magenta;
      ctx.fillText(chars[i] || 'A', lx, lettersY + bob, letterSize * 1.25);
      // underline slot
      const uw = letterSize * 0.7;
      ctx.shadowBlur = 0;
      ctx.strokeStyle = active
        ? `rgba(0, 240, 255, ${0.7 + Math.sin(pulse * 5) * 0.3})`
        : 'rgba(255, 80, 200, 0.45)';
      ctx.lineWidth = active ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(lx - uw / 2, lettersY + this.u(12));
      ctx.lineTo(lx + uw / 2, lettersY + this.u(12));
      ctx.stroke();
      lx += letterSize + gap;
    }

    const floor = H - this.padBottom - H * (big ? (portrait ? 0.22 : 0.3) : 0.1);
    const alpha = 0.55 + Math.sin(pulse * 4) * 0.35;
    ctx.fillStyle = `rgba(200, 180, 255, ${alpha})`;
    if (warn) {
      // Rude initials were blocked: a friendly G-rated nudge right under the letters.
      ctx.fillStyle = COL.sunCore;
      this.fillFitted(ctx, warn, cx, lettersY + this.u(big ? (portrait ? 44 : 38) : 40), '700', this.u(big ? (portrait ? 16 : 14) : 15), "'Rajdhani', sans-serif", maxTw, this.u(10));
      ctx.fillStyle = `rgba(200, 180, 255, ${alpha})`;
    }
    const help =
      big
        ? tr('ini_help_touch')
        : tr('ini_help_keys');
    const helpY = Math.min(floor - this.u(8), lettersY + this.u(big ? (portrait ? 80 : 64) : 70));
    this.fillFitted(
      ctx,
      help,
      cx,
      helpY,
      '600',
      this.u(big ? (portrait ? 16 : 14) : 15),
      "'Rajdhani', sans-serif",
      maxTw,
      this.u(12),
    );

    // Desktop: visible clickable OK (touch uses the DOM BOOST button labeled OK).
    if (!big) {
      const bw = this.u(148);
      const bh = this.u(52);
      const bx = cx - bw / 2;
      const by = Math.min(floor - bh - this.u(4), helpY + this.u(28));
      this.iniOkRect = { x: bx, y: by, w: bw, h: bh };
      ctx.save();
      ctx.shadowBlur = this.lite ? 0 : 14;
      ctx.shadowColor = COL.cyan;
      ctx.fillStyle = 'rgba(0, 40, 60, 0.92)';
      roundRect(ctx, bx, by, bw, bh, bh * 0.28);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = COL.cyan;
      ctx.lineWidth = 3;
      roundRect(ctx, bx, by, bw, bh, bh * 0.28);
      ctx.stroke();
      ctx.fillStyle = COL.cyan;
      ctx.font = `900 ${this.u(22)}px 'Orbitron', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tr('btn_ok'), cx, by + bh / 2 + 1);
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
    } else {
      this.iniOkRect = null;
    }
  }

  drawGameOver(
    ctx: CanvasRenderingContext2D,
    score: number,
    high: number,
    isNew: boolean,
    board: LeaderboardEntry[] = [],
    highlightIndex = -1,
    boardTitle = 'TOP 11',
    headline = 'TOO BRIGHT!',
    taunt = '',
  ): void {
    const big = this.touchUi;
    const portrait = this.H > this.W * 1.1;
    const W = this.W;
    const H = this.H;
    const side =
      Math.max(this.padLeft, this.padRight) +
      this.u(big ? 18 : 24) +
      (big ? Math.max(this.u(56), this.chromeRight * 0.55) : 0);
    const maxTw = Math.max(this.u(140), W - side * 2);
    const cx = W / 2;
    ctx.fillStyle = 'rgba(8, 0, 20, 0.78)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.shadowBlur = this.lite ? 0 : 18;
    ctx.shadowColor = COL.sun;
    ctx.fillStyle = COL.sunCore;
    const floor = H - this.padBottom - H * (big ? (portrait ? 0.22 : 0.3) : 0.1);
    const overY = this.padTop + H * (big ? (portrait ? 0.08 : 0.1) : 0.12);
    this.fillFitted(
      ctx,
      headline,
      cx,
      overY,
      '900',
      this.u(big ? (portrait ? 30 : 26) : 30),
      "'Orbitron', sans-serif",
      maxTw,
      this.u(18),
    );
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff';
    this.fitFont(ctx, `${tr('go_score')}${fmtScore(score)}`, '700', this.u(big ? (portrait ? 22 : 18) : 20), "'Rajdhani', sans-serif", maxTw, this.u(14));
    this.duckLine(ctx, tr('go_score'), score, cx, overY + this.u(big ? (portrait ? 28 : 24) : 28), 'center');
    ctx.fillStyle = isNew ? COL.cyan : 'rgba(200,180,255,0.85)';
    this.fillFitted(
      ctx,
      isNew ? tr('go_newbest', { s: fmtScore(high) }) : tr('go_best', { s: fmtScore(high) }),
      cx,
      overY + this.u(big ? (portrait ? (this.cardTopY > 0 ? 48 : 52) : 42) : 50),
      '700',
      this.u(big ? (portrait ? (this.cardTopY > 0 ? 16 : 18) : 13) : 16),
      "'Rajdhani', sans-serif",
      maxTw,
      this.u(12),
    );

    // Portrait with the VALUE FOR VALUE card up: all 11 rows fit above it (the RIDE button below
    // the card is the cue, so the blinking ride hint steps aside to make room).
    // Sideways phones: the board runs down to just above the difficulty control so all 11 rows
    // fit; the big RIDE button is the cue there too.
    const compact = portrait && this.cardTopY > 0;
    const sideways = big && !portrait;
    let boardTop = overY + this.u(big ? (portrait ? 64 : 60) : 68);
    if (taunt) {
      // Playful line for everyone who isn't #1 (systems/boardTaunt.ts), between BEST and the board.
      const ty = boardTop + this.u(big && !portrait ? 1 : 2);
      ctx.fillStyle = COL.sunCore;
      ctx.shadowBlur = 0;
      this.fillFitted(ctx, taunt, cx, ty, '700', this.u(big ? (portrait ? 14 : 12) : 14), "'Rajdhani', sans-serif", maxTw, this.u(9));
      boardTop += this.u(big && !portrait ? 15 : 19);
    }
    let boardBottom = floor - this.u(big ? (portrait ? 36 : 32) : 40);
    if (compact) boardBottom = Math.min(boardBottom, this.cardTopY - this.u(4));
    if (sideways) boardBottom = H - this.padBottom - Math.max(this.u(64), H * 0.15);
    this.drawLeaderboard(ctx, board, highlightIndex, boardTop, boardBottom, maxTw, boardTitle, compact || sideways ? 12.5 : 15);
    if (compact || sideways) return;

    const alpha = 0.55 + Math.sin(this.time * 4) * 0.35;
    ctx.fillStyle = `rgba(0, 240, 255, ${alpha})`;
    this.fillFitted(
      ctx,
      big ? tr('go_tap') : tr('go_keys'),
      cx,
      Math.min(floor - this.u(4), boardBottom + this.u(28)),
      '700',
      this.u(big ? (portrait ? 16 : 14) : 16),
      "'Orbitron', sans-serif",
      maxTw,
      this.u(12),
    );
  }

  private drawLeaderboard(
    ctx: CanvasRenderingContext2D,
    board: LeaderboardEntry[],
    highlightIndex: number,
    top: number,
    bottom: number,
    maxTw: number,
    title = 'TOP 11',
    minRow = 15,
  ): void {
    const W = this.W;
    const cx = W / 2;
    // Shared (online) boards carry a difficulty per entry: show a LVL column.
    const showLvl = board.some((e) => e && e.difficulty);
    const avail = Math.max(this.u(80), bottom - top);
    // Short screens (e.g. a phone with the VALUE FOR VALUE card up): fewer, readable rows rather
    // than ten tiny ones. The player's highlighted entry always stays visible (last row).
    const rows = Math.max(3, Math.min(11, Math.floor(avail / this.u(minRow) - 2.2)));
    if (rows < 11) title = title.replace('TOP 11', `TOP ${rows}`);
    const boardW = Math.min(maxTw, this.u(320));
    const rowFont = (fs: number, bold: boolean) => `${bold ? '700' : '600'} ${fs}px 'Rajdhani', monospace`;
    const titleFont = (fs: number) => `700 ${Math.max(11, fs * 0.95)}px 'Orbitron', sans-serif`;
    let lvlHdr = tr('lb_start_end');
    {
      ctx.font = rowFont(Math.max(10, Math.min(this.u(16), this.u(22) * 0.85)), true);
      const need = ctx.measureText('10WWW777,777,777').width + ctx.measureText(lvlHdr).width + this.u(16) * 1.6;
      if (need > boardW - 8) lvlHdr = tr('lb_lvl');
    }

    // Column layout at a given row height, measured in the row font so it fits any width:
    //   rank (right) | initials (left) | score (right) | LVL (right; gold shades mark for 11-111)
    const layout = (headerRow: boolean) => {
      const rowH = Math.min(this.u(22), avail / (rows + (headerRow ? 2.2 : 1.2)));
      const fs = Math.max(10, Math.min(this.u(16), rowH * 0.85));
      ctx.font = rowFont(fs, true);
      const wRank = ctx.measureText('11').width;
      const wIni = ctx.measureText('WWW').width;
      const wScore = ctx.measureText('000,000,000').width;
      // START → END levels ("1→37"); old rows without a start show a dash.
      const wLvl = showLvl ? Math.max(ctx.measureText(lvlHdr).width, ctx.measureText('11→111').width + fs * 1.15) : 0;
      const n = showLvl ? 3 : 2;
      const fixed = wRank + wIni + wScore + wLvl;
      const gap = Math.max(fs * 0.45, Math.min(fs * 1.1, (boardW - 8 - fixed) / n));
      const total = fixed + gap * n;
      const xRank = cx - total / 2 + wRank;
      const xIni = xRank + gap;
      const xScore = xIni + wIni + gap + wScore;
      const xLvl = xScore + gap + wLvl;
      ctx.font = titleFont(fs);
      const titleRight = cx + ctx.measureText(title).width / 2;
      ctx.font = rowFont(fs, false);
      const hdrLeft = xLvl - ctx.measureText(lvlHdr).width;
      return { rowH, fs, xRank, xIni, xScore, xLvl, wIni, headerFitsTitleLine: hdrLeft > titleRight + fs * 0.8 };
    };
    // Prefer the LVL header on the title line (rows stay as large as before); else its own header row.
    let L = layout(false);
    const headerRow = showLvl && !L.headerFitsTitleLine;
    if (headerRow) L = layout(true);
    const { rowH, fs: fontSize, xRank: cRank, xIni: cIni, xScore: cScore, xLvl, wIni: wIniCol } = L;

    ctx.textAlign = 'center';
    ctx.fillStyle = COL.pink;
    ctx.font = titleFont(fontSize);
    ctx.fillText(title, cx, top);

    let startY = top + rowH * 1.35;
    if (showLvl) {
      // LVL header in the same size / weight as the rows.
      ctx.font = rowFont(fontSize, false);
      ctx.fillStyle = 'rgba(255, 157, 232, 0.9)';
      ctx.textAlign = 'right';
      if (headerRow) {
        ctx.fillText(lvlHdr, xLvl, startY);
        startY += rowH;
      } else {
        ctx.fillText(lvlHdr, xLvl, top);
      }
    }

    for (let i = 0; i < rows; i++) {
      const y = startY + i * rowH;
      if (y > bottom - 2) break;
      const idx = i === rows - 1 && highlightIndex >= rows ? highlightIndex : i;
      const entry = board[idx];
      const hi = idx === highlightIndex;
      if (hi) {
        const pulse = 0.55 + Math.sin(this.time * 5) * 0.35;
        ctx.fillStyle = `rgba(0, 240, 255, ${0.12 + pulse * 0.18})`;
        roundRect(ctx, cx - boardW / 2, y - rowH * 0.72, boardW, rowH * 0.95, 4);
        ctx.fill();
        ctx.fillStyle = COL.cyan;
        ctx.shadowBlur = this.lite ? 0 : 10;
        ctx.shadowColor = COL.cyan;
      } else {
        ctx.shadowBlur = 0;
        ctx.fillStyle = entry ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.28)';
      }
      const rowColor = ctx.fillStyle;
      ctx.font = rowFont(fontSize, hi);
      ctx.textAlign = 'right';
      ctx.fillText(String(idx + 1), cRank, y);
      ctx.textAlign = 'left';
      if (entry) {
        // Any language's initials (or emojis) in one aligned column: glyph fallbacks + squeeze to WWW.
        const f0 = ctx.font;
        ctx.font = `${hi ? '700' : '600'} ${fontSize}px 'Rajdhani', ${GLYPH_FALLBACK}`;
        ctx.fillText(maskInitials(entry.initials), cIni, y, wIniCol);
        ctx.font = f0;
      } else ctx.fillText('---', cIni, y);
      ctx.textAlign = 'right';
      if (entry) drawDuckText(ctx, fmtScore(entry.score), cScore, y);
      else ctx.fillText('------', cScore, y);
      if (showLvl) {
        const d = entry?.difficulty;
        if (d !== undefined && d >= 11) {
          // Gold zone (11-111): END in gold with a small shades mark; START (or a dash) before it.
          ctx.shadowBlur = 0;
          ctx.fillStyle = COL.sunCore;
          const tw = this.drawLvlCell(ctx, entry?.start, d, xLvl, y, COL.sunCore, hi ? String(rowColor) : 'rgba(255, 190, 240, 0.92)');
          const lw = fontSize * 0.46;
          const lh = fontSize * 0.34;
          const gx = xLvl - tw - fontSize * 0.2 - (lw * 2 + fontSize * 0.12);
          const gy = y - fontSize * 0.62;
          roundRect(ctx, gx, gy, lw, lh, lh * 0.45);
          ctx.fill();
          roundRect(ctx, gx + lw + fontSize * 0.12, gy, lw, lh, lh * 0.45);
          ctx.fill();
          ctx.fillRect(gx - fontSize * 0.08, gy, lw * 2 + fontSize * 0.28, Math.max(1, lh * 0.22));
        } else {
          ctx.fillStyle = hi ? rowColor : entry ? 'rgba(255, 190, 240, 0.92)' : 'rgba(255,255,255,0.28)';
          if (d) this.drawLvlCell(ctx, entry?.start, d, xLvl, y, String(ctx.fillStyle), String(ctx.fillStyle));
          else ctx.fillText(entry ? '' : '--', xLvl, y);
        }
      }
      ctx.shadowBlur = 0;
    }
  }

  /** "label + duck-digit number" on one line, aligned like fillText; uses the current font. */
  private duckLine(ctx: CanvasRenderingContext2D, label: string, n: number, x: number, y: number, align: 'left' | 'center' | 'right'): void {
    const num = fmtScore(n);
    const lw = ctx.measureText(label).width;
    const nw = duckWidth(ctx, num);
    const x0 = align === 'center' ? x - (lw + nw) / 2 : align === 'right' ? x - lw - nw : x;
    const a = ctx.textAlign;
    ctx.textAlign = 'left';
    ctx.fillText(label, x0, y);
    drawDuckText(ctx, num, x0 + lw, y);
    ctx.textAlign = a;
  }

  /** Board LVL cell, right-aligned at x: START (duck digits, or a dash) → END (duck digits). Returns its width. */
  private drawLvlCell(ctx: CanvasRenderingContext2D, start: number | undefined, end: number, x: number, y: number, endInk: string, startInk: string): number {
    const a = ctx.textAlign;
    const fill = ctx.fillStyle;
    ctx.textAlign = 'right';
    const ew = drawDuckText(ctx, String(end), x, y, endInk);
    ctx.fillStyle = startInk;
    const arrow = '→';
    const aw = ctx.measureText(arrow).width;
    ctx.fillText(arrow, x - ew, y);
    const sx = x - ew - aw;
    let sw: number;
    if (start) sw = drawDuckText(ctx, String(start), sx, y, startInk);
    else {
      ctx.fillText('–', sx, y);
      sw = ctx.measureText('–').width;
    }
    ctx.textAlign = a;
    ctx.fillStyle = fill;
    return ew + aw + sw;
  }

  drawFloaters(ctx: CanvasRenderingContext2D, items: { x: number; y: number; text: string; life: number; color: string }[]): void {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = "700 16px 'Orbitron', sans-serif";
    for (const f of items) {
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.shadowBlur = this.lite ? 0 : 12;
      ctx.shadowColor = f.color;
      ctx.fillStyle = f.color;
      if (nonEnglish()) {
        // Translated floaters can run longer: keep them on screen.
        const half = ctx.measureText(f.text).width / 2;
        ctx.fillText(f.text, Math.max(half + 4, Math.min(this.W - half - 4, f.x)), f.y);
      } else ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

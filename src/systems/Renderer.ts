import type { Player } from '../entities/Player';
import type { Obstacle, Collectible } from '../entities/Obstacles';
import type { LeaderboardEntry } from '../utils/storage';
import { clamp } from '../utils/math';

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

export class Renderer {
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

  bumpShake(amount: number): void {
    this.shake = Math.max(this.shake, this.lite ? amount * 0.45 : amount);
  }

  bumpFlash(amount: number): void {
    this.flash = Math.max(this.flash, amount);
  }

  /** Logical px size → boosted when touch canvas is shrunk. */
  private u(px: number): number {
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
    ctx.fillText(text, x, y);
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
      if (this.lite) {
        const tw = 18 * t.a;
        const th = 10 * t.a;
        ctx.fillRect(t.x - tw * 0.5, t.y - th * 0.5, tw, th);
      } else {
        ctx.shadowBlur = 10;
        ctx.shadowColor = COL.cyan;
        ctx.beginPath();
        ctx.ellipse(t.x, t.y, 10 * t.a, 6 * t.a, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    const blink = p.invuln > 0 && Math.floor(this.time * 20) % 2 === 0;
    if (blink) return;

    ctx.save();
    ctx.translate(p.x, p.y);
    const tilt = clamp(p.vy / 400, -0.35, 0.35);
    ctx.rotate(tilt);

    // hoverboard / jet body glow
    ctx.shadowBlur = this.lite ? 0 : 20;
    ctx.shadowColor = p.boostFlash > 0 ? COL.cyan : COL.magenta;

    // body
    if (this.lite) {
      ctx.fillStyle = '#ff4ec8';
    } else {
      const bodyGrad = ctx.createLinearGradient(-20, 0, 24, 0);
      bodyGrad.addColorStop(0, '#2a1050');
      bodyGrad.addColorStop(0.5, '#ff4ec8');
      bodyGrad.addColorStop(1, '#00e8ff');
      ctx.fillStyle = bodyGrad;
    }
    roundRect(ctx, -22, -10, 48, 20, 8);
    ctx.fill();

    // cockpit
    ctx.fillStyle = 'rgba(180, 240, 255, 0.85)';
    ctx.beginPath();
    ctx.ellipse(4, -2, 10, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // shades — the star of the show
    ctx.fillStyle = '#0a0018';
    roundRect(ctx, -2, -8, 18, 8, 2);
    ctx.fill();
    ctx.fillStyle = charge > 0.3 ? 'rgba(0, 255, 220, 0.7)' : 'rgba(255, 200, 50, 0.85)';
    ctx.shadowBlur = this.lite ? 0 : 12;
    ctx.shadowColor = charge > 0.3 ? COL.cyan : COL.sun;
    roundRect(ctx, 0, -7, 6, 6, 1);
    ctx.fill();
    roundRect(ctx, 8, -7, 6, 6, 1);
    ctx.fill();
    // bridge
    ctx.fillStyle = '#222';
    ctx.fillRect(6, -5, 2, 2);

    // engine flame
    if (p.boostFlash > 0 || true) {
      const flick = 0.7 + Math.sin(this.time * 40) * 0.3;
      ctx.shadowBlur = this.lite ? 0 : 16;
      ctx.shadowColor = COL.cyan;
      ctx.fillStyle = `rgba(0, 255, 255, ${0.5 * flick})`;
      ctx.beginPath();
      ctx.moveTo(-22, -6);
      ctx.lineTo(-22 - 16 * flick - (p.boostFlash > 0 ? 10 : 0), 0);
      ctx.lineTo(-22, 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgba(255, 255, 200, ${0.7 * flick})`;
      ctx.beginPath();
      ctx.moveTo(-22, -3);
      ctx.lineTo(-22 - 8 * flick, 0);
      ctx.lineTo(-22, 3);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
    ctx.shadowBlur = 0;
  }

  drawObstacles(ctx: CanvasRenderingContext2D, obstacles: Obstacle[]): void {
    for (const o of obstacles) {
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
        // danger zones top/bottom of ring (outer rim already stroke; hit is outer)
      }
      ctx.shadowBlur = 0;
    }
  }

  drawCollectibles(ctx: CanvasRenderingContext2D, items: Collectible[]): void {
    for (const c of items) {
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
  ): void {
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
        `SCORE  ${Math.floor(score)}`,
        '700',
        this.u(24),
        "'Rajdhani', sans-serif",
        maxTw,
        this.u(16),
      );
      ctx.fillText(`SCORE  ${Math.floor(score)}`, left, top + this.u(24));
      ctx.fillStyle = 'rgba(0, 240, 255, 0.88)';
      this.fitFont(
        ctx,
        `BEST  ${Math.floor(high)}  ·  ${Math.floor(distance)}m`,
        '700',
        this.u(18),
        "'Rajdhani', sans-serif",
        maxTw,
        this.u(14),
      );
      ctx.fillText(`BEST  ${Math.floor(high)}  ·  ${Math.floor(distance)}m`, left, top + this.u(50));
      this.drawChargeBar(ctx, left, rightBound, top + this.u(60), charge);
    } else if (big) {
      // Landscape / short: two-line HUD so mute/pause chrome never eats the score.
      const top = this.padTop + this.u(10);
      const maxTw = Math.max(80, rightBound - left);
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      this.fitFont(
        ctx,
        `SCORE  ${Math.floor(score)}`,
        '700',
        this.u(18),
        "'Rajdhani', sans-serif",
        maxTw,
        this.u(14),
      );
      ctx.fillText(`SCORE  ${Math.floor(score)}`, left, top + this.u(18));
      ctx.fillStyle = 'rgba(0, 240, 255, 0.88)';
      this.fitFont(
        ctx,
        `BEST  ${Math.floor(high)}  ·  ${Math.floor(distance)}m`,
        '700',
        this.u(15),
        "'Rajdhani', sans-serif",
        maxTw,
        this.u(12),
      );
      ctx.fillText(
        `BEST  ${Math.floor(high)}  ·  ${Math.floor(distance)}m`,
        left,
        top + this.u(38),
      );
      this.drawChargeBar(ctx, left, rightBound, top + this.u(44), charge);
    } else {
      ctx.font = `700 ${this.u(18)}px 'Rajdhani', sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.textAlign = 'left';
      const topY = this.padTop + this.u(32);
      ctx.fillText(`SCORE  ${Math.floor(score)}`, left, topY);
      ctx.fillStyle = 'rgba(0, 240, 255, 0.85)';
      ctx.fillText(`BEST  ${Math.floor(high)}`, left, this.padTop + this.u(54));
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255, 160, 220, 0.9)';
      ctx.fillText(`${Math.floor(distance)}m`, W - this.u(20) - this.padRight, topY);
      const bw = this.u(180);
      this.drawChargeBar(ctx, W / 2 - bw / 2, W / 2 + bw / 2, this.padTop + this.u(18), charge);
    }
    ctx.restore();
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
    ctx.fillText('SHADE CHARGE', bx + bw / 2, by - 2);
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

      ctx.shadowColor = COL.cyan;
      ctx.fillStyle = COL.cyan;
      const bob = Math.sin(pulse * 3) * (portrait ? 3 : 2);
      y = Math.min(y + this.u(portrait ? 30 : 22) + bob, floor - this.u(portrait ? 150 : 96));
      this.fillFitted(
        ctx,
        '… gotta wear shades!',
        cx,
        y,
        '700',
        this.u(portrait ? 20 : 16),
        "'Orbitron', sans-serif",
        maxTw,
        this.u(14),
      );
      ctx.shadowBlur = 0;

      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      y = Math.min(y + this.u(portrait ? 34 : 24), floor - this.u(portrait ? 120 : 78));
      this.fillFitted(
        ctx,
        portrait ? 'Dodge the glare. Keep shades charged.' : 'Dodge glare · keep shades charged',
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
      const handLabel = document.body.classList.contains('hand-left') ? 'Left hand' : 'Right hand';
      this.fillFitted(
        ctx,
        portrait
          ? `Stick · BOOST  ·  ${handLabel}`
          : `Stick · BOOST · ${handLabel}`,
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
          'Collect shades — keep Shade charged',
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
        `High Score  ${Math.floor(high)}`,
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
        'Tap or swipe to start',
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
      ctx.shadowColor = COL.cyan;
      ctx.fillStyle = COL.cyan;
      ctx.font = `700 28px 'Orbitron', sans-serif`;
      const bob = Math.sin(pulse * 3) * 4;
      ctx.fillText('… gotta wear shades!', W / 2, titleY + titleSize * 1.05 + 48 + bob);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = `700 18px 'Rajdhani', sans-serif`;
      ctx.fillText('Dodge the glare. Keep your shades charged.', W / 2, H * 0.46);
      ctx.fillStyle = 'rgba(200, 180, 255, 0.88)';
      ctx.font = `600 15px 'Rajdhani', sans-serif`;
      ctx.fillText('WASD / Arrows move  ·  SPACE boost  ·  P pause', W / 2, H * 0.53);
      ctx.font = `700 15px 'Rajdhani', sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillText(`High Score  ${Math.floor(high)}`, W / 2, H * 0.6);
      const alpha = 0.55 + Math.sin(pulse * 4) * 0.35;
      ctx.fillStyle = `rgba(0, 240, 255, ${alpha})`;
      ctx.font = `700 20px 'Orbitron', sans-serif`;
      ctx.fillText('Press any key to start', W / 2, H * 0.72);
    }
  }

  drawPause(ctx: CanvasRenderingContext2D): void {
    const big = this.touchUi;
    ctx.fillStyle = 'rgba(5, 0, 18, 0.65)';
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.textAlign = 'center';
    ctx.fillStyle = COL.cyan;
    ctx.font = `900 ${this.u(36)}px 'Orbitron', sans-serif`;
    ctx.shadowBlur = this.lite ? 0 : 20;
    ctx.shadowColor = COL.cyan;
    const pauseY = Math.max(this.padTop + this.u(80), this.H * 0.42);
    ctx.fillText('PAUSED', this.W / 2, pauseY);
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = `600 ${this.u(big ? 20 : 16)}px 'Rajdhani', sans-serif`;
    ctx.fillText(
      big ? 'Tap ▶ to resume' : 'P / ESC to resume',
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
      'NEW HIGH SCORE!',
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
      `Score  ${Math.floor(score)}`,
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
      'ENTER INITIALS',
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
      ctx.font = `900 ${letterSize}px 'Orbitron', sans-serif`;
      ctx.fillStyle = active ? COL.cyan : COL.pink;
      ctx.shadowBlur = this.lite ? 0 : active ? 18 : 8;
      ctx.shadowColor = active ? COL.cyan : COL.magenta;
      ctx.fillText(chars[i] || 'A', lx, lettersY + bob);
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
    const help =
      big
        ? 'Stick ↕ letter  ·  ↔ slot  ·  OK'
        : '↑↓ letter  ·  ←→ slot  ·  ENTER / SPACE';
    this.fillFitted(
      ctx,
      help,
      cx,
      Math.min(floor - this.u(8), lettersY + this.u(big ? (portrait ? 80 : 64) : 70)),
      '600',
      this.u(big ? (portrait ? 16 : 14) : 15),
      "'Rajdhani', sans-serif",
      maxTw,
      this.u(12),
    );
  }

  drawGameOver(
    ctx: CanvasRenderingContext2D,
    score: number,
    high: number,
    isNew: boolean,
    board: LeaderboardEntry[] = [],
    highlightIndex = -1,
    boardTitle = 'TOP 10',
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
      'TOO BRIGHT!',
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
    this.fillFitted(
      ctx,
      `Score  ${Math.floor(score)}`,
      cx,
      overY + this.u(big ? (portrait ? 28 : 24) : 28),
      '700',
      this.u(big ? (portrait ? 20 : 16) : 18),
      "'Rajdhani', sans-serif",
      maxTw,
      this.u(14),
    );
    ctx.fillStyle = isNew ? COL.cyan : 'rgba(200,180,255,0.85)';
    this.fillFitted(
      ctx,
      isNew ? `NEW BEST  ${Math.floor(high)}!` : `Best  ${Math.floor(high)}`,
      cx,
      overY + this.u(big ? (portrait ? 52 : 44) : 50),
      '700',
      this.u(big ? (portrait ? 18 : 14) : 16),
      "'Rajdhani', sans-serif",
      maxTw,
      this.u(12),
    );

    const boardTop = overY + this.u(big ? (portrait ? 72 : 60) : 68);
    const boardBottom = floor - this.u(big ? (portrait ? 36 : 32) : 40);
    this.drawLeaderboard(ctx, board, highlightIndex, boardTop, boardBottom, maxTw, boardTitle);

    const alpha = 0.55 + Math.sin(this.time * 4) * 0.35;
    ctx.fillStyle = `rgba(0, 240, 255, ${alpha})`;
    this.fillFitted(
      ctx,
      big ? 'TAP  —  or hit RIDE' : 'ENTER / SPACE  —  RIDE AGAIN',
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
    title = 'TOP 10',
  ): void {
    const W = this.W;
    const cx = W / 2;
    const rows = 10;
    // Shared (online) boards carry a difficulty per entry: show a LVL column.
    const showLvl = board.some((e) => e && e.difficulty);
    const avail = Math.max(this.u(80), bottom - top);
    const boardW = Math.min(maxTw, this.u(320));
    const rowFont = (fs: number, bold: boolean) => `${bold ? '700' : '600'} ${fs}px 'Rajdhani', monospace`;
    const titleFont = (fs: number) => `700 ${Math.max(11, fs * 0.95)}px 'Orbitron', sans-serif`;

    // Column layout at a given row height, measured in the row font so it fits any width:
    //   rank (right) | initials (left) | score (right) | LVL (right; gold shades mark for 11)
    const layout = (headerRow: boolean) => {
      const rowH = Math.min(this.u(22), avail / (rows + (headerRow ? 2.2 : 1.2)));
      const fs = Math.max(10, Math.min(this.u(16), rowH * 0.85));
      ctx.font = rowFont(fs, true);
      const wRank = ctx.measureText('10').width;
      const wIni = ctx.measureText('WWW').width;
      const wScore = ctx.measureText('0000000').width;
      const wLvl = showLvl ? Math.max(ctx.measureText('LVL').width, ctx.measureText('11').width + fs * 1.15) : 0;
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
      const hdrLeft = xLvl - ctx.measureText('LVL').width;
      return { rowH, fs, xRank, xIni, xScore, xLvl, headerFitsTitleLine: hdrLeft > titleRight + fs * 0.8 };
    };
    // Prefer the LVL header on the title line (rows stay as large as before); else its own header row.
    let L = layout(false);
    const headerRow = showLvl && !L.headerFitsTitleLine;
    if (headerRow) L = layout(true);
    const { rowH, fs: fontSize, xRank: cRank, xIni: cIni, xScore: cScore, xLvl } = L;

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
        ctx.fillText('LVL', xLvl, startY);
        startY += rowH;
      } else {
        ctx.fillText('LVL', xLvl, top);
      }
    }

    for (let i = 0; i < rows; i++) {
      const y = startY + i * rowH;
      if (y > bottom - 2) break;
      const entry = board[i];
      const hi = i === highlightIndex;
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
      ctx.fillText(String(i + 1), cRank, y);
      ctx.textAlign = 'left';
      ctx.fillText(entry ? entry.initials : '---', cIni, y);
      ctx.textAlign = 'right';
      ctx.fillText(entry ? String(Math.floor(entry.score)) : '------', cScore, y);
      if (showLvl) {
        const d = entry?.difficulty;
        if (d === 11) {
          // Gold 11 with a small shades mark
          ctx.shadowBlur = 0;
          ctx.fillStyle = COL.sunCore;
          ctx.fillText('11', xLvl, y);
          const tw = ctx.measureText('11').width;
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
          ctx.fillText(d ? String(d) : entry ? '' : '--', xLvl, y);
        }
      }
      ctx.shadowBlur = 0;
    }
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
      ctx.fillText(f.text, f.x, f.y);
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

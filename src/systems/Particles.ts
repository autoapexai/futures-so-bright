import { rand } from '../utils/math';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  glow: boolean;
}

export class ParticleSystem {
  particles: Particle[] = [];
  /** Soft cap — lowered on mobile for Safari fill-rate. */
  maxParticles = 180;
  /** When false, skip shadowBlur on draw (big iOS win). */
  useGlow = true;
  private pool: Particle[] = [];

  clear(): void {
    for (let i = 0; i < this.particles.length; i++) this.pool.push(this.particles[i]);
    this.particles.length = 0;
  }

  private obtain(): Particle {
    return (
      this.pool.pop() ?? {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 1,
        color: '#fff',
        glow: false,
      }
    );
  }

  private emit(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    maxLife: number,
    size: number,
    color: string,
  ): void {
    if (this.particles.length >= this.maxParticles) return;
    const p = this.obtain();
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.life = life;
    p.maxLife = maxLife;
    p.size = size;
    p.color = color;
    p.glow = this.useGlow;
    this.particles.push(p);
  }

  burst(x: number, y: number, color: string, n = 16, speed = 180): void {
    const count = Math.min(n, Math.max(4, Math.floor(this.maxParticles / 12)));
    for (let i = 0; i < count; i++) {
      const a = (Math.PI * 2 * i) / count + rand(-0.2, 0.2);
      const s = rand(speed * 0.3, speed);
      this.emit(x, y, Math.cos(a) * s, Math.sin(a) * s, rand(0.3, 0.7), 0.7, rand(2, 5), color);
    }
  }

  spark(x: number, y: number, color: string): void {
    this.emit(x, y, rand(-40, 40), rand(-60, -10), rand(0.2, 0.5), 0.5, rand(1.5, 3.5), color);
  }

  trail(x: number, y: number, color: string): void {
    this.emit(
      x + rand(-4, 4),
      y + rand(-6, 6),
      rand(-120, -40),
      rand(-20, 20),
      rand(0.15, 0.35),
      0.35,
      rand(2, 4),
      color,
    );
  }

  update(dt: number): void {
    const ps = this.particles;
    let w = 0;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 40 * dt;
      p.life -= dt;
      if (p.life > 0) ps[w++] = p;
      else this.pool.push(p);
    }
    ps.length = w;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.useGlow) {
      for (const p of this.particles) {
        const a = p.life / p.maxLife;
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        const s = p.size * a;
        ctx.fillRect(p.x - s, p.y - s, s * 2, s * 2);
      }
      ctx.globalAlpha = 1;
      return;
    }
    for (const p of this.particles) {
      const a = p.life / p.maxLife;
      ctx.globalAlpha = a;
      if (p.glow) {
        ctx.shadowBlur = 12;
        ctx.shadowColor = p.color;
      }
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * a, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }
}

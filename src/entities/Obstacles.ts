import { rand, chance, lerp } from '../utils/math';

export type ObstacleKind = 'beam' | 'flare' | 'neon' | 'ring';

export interface Obstacle {
  kind: ObstacleKind;
  x: number;
  y: number;
  w: number;
  h: number;
  vy: number;
  phase: number;
  alive: boolean;
  pulse: number;
  /** Ring gates: the player's ship has crossed this ring's centre line (boost checked once). */
  passed: boolean;
  /** Ring gates: gate-boost glow countdown (s) after the player flew through the hole. */
  boostT: number;
}

export interface Collectible {
  /** 'shade' (sunglasses) or a kitchen-appliance power-up (silliness pack). */
  kind: 'shade' | 'toaster' | 'blender' | 'microwave';
  x: number;
  y: number;
  r: number;
  phase: number;
  alive: boolean;
  value: number;
}

export class WorldSpawner {
  obstacles: Obstacle[] = [];
  collectibles: Collectible[] = [];
  /** Spawn switches (the How to Play walkthrough turns hazards / circles on step by step). */
  spawnObstacles = true;
  spawnCollectibles = true;
  private spawnTimer = 0;
  private collectTimer = 0.8;
  /** Seconds until the next appliance power-up (modest: one every ~20-35 s). */
  private powerTimer = 22;
  /** Appliance picker (the game seeds it per run). */
  powerRand: () => number = Math.random;
  /** Off in the How to Play walkthrough and the title demo. */
  spawnPowers = false;
  private difficulty = 0;
  private laneTop = 80;
  private laneBot = 460;
  private obsPool: Obstacle[] = [];
  private colPool: Collectible[] = [];

  reset(): void {
    for (let i = 0; i < this.obstacles.length; i++) this.obsPool.push(this.obstacles[i]);
    for (let i = 0; i < this.collectibles.length; i++) this.colPool.push(this.collectibles[i]);
    this.obstacles.length = 0;
    this.collectibles.length = 0;
    this.spawnTimer = 0.6;
    this.collectTimer = 0.5;
    this.powerTimer = 20 + this.powerRand() * 12;
    this.difficulty = 0;
  }

  private obtainObs(): Obstacle {
    return (
      this.obsPool.pop() ?? {
        kind: 'beam',
        x: 0,
        y: 0,
        w: 0,
        h: 0,
        vy: 0,
        phase: 0,
        alive: true,
        pulse: 0,
        passed: false,
        boostT: 0,
      }
    );
  }

  private obtainCol(): Collectible {
    return (
      this.colPool.pop() ?? {
        x: 0,
        y: 0,
        r: 14,
        phase: 0,
        alive: true,
        value: 25,
        kind: 'shade',
      }
    );
  }

  private pushObs(
    kind: ObstacleKind,
    x: number,
    y: number,
    w: number,
    h: number,
    vy: number,
    pulse: number,
  ): void {
    const o = this.obtainObs();
    o.kind = kind;
    o.x = x;
    o.y = y;
    o.w = w;
    o.h = h;
    o.vy = vy;
    o.phase = 0;
    o.alive = true;
    o.pulse = pulse;
    o.passed = false;
    o.boostT = 0;
    this.obstacles.push(o);
  }

  update(
    dt: number,
    scrollSpeed: number,
    W: number,
    H: number,
    distance: number,
    yMin?: number,
    yMax?: number,
    density = 1,
    rampMul = 1,
  ): void {
    if (yMin !== undefined) this.laneTop = yMin;
    else this.laneTop = Math.max(80, H * 0.12);
    if (yMax !== undefined) this.laneBot = yMax;
    else this.laneBot = H - Math.max(80, H * 0.12);
    // rampMul > 1 stretches the ramp to full hazard density (difficulty easing; 1 = original).
    this.difficulty = Math.min(1, distance / (8000 * rampMul));
    this.spawnTimer -= dt;
    this.collectTimer -= dt;

    // density > 1 spawns obstacles more often (difficulty setting; 1 = original).
    const interval = lerp(1.1, 0.45, this.difficulty) / density;
    if (this.spawnTimer <= 0 && this.spawnObstacles) {
      this.spawnObstacle(W);
      this.spawnTimer = interval * rand(0.7, 1.15);
    }

    this.powerTimer -= dt;
    if (this.powerTimer <= 0 && this.spawnCollectibles && this.spawnPowers) {
      this.powerTimer = 20 + this.powerRand() * 15;
      const kinds = ['toaster', 'blender', 'microwave'] as const;
      this.addPower(kinds[Math.floor(this.powerRand() * 3) % 3], W + 30, this.laneTop + 40 + this.powerRand() * Math.max(10, this.laneBot - this.laneTop - 80));
    }
    if (this.collectTimer <= 0 && this.spawnCollectibles) {
      this.spawnCollectible(W);
      this.collectTimer = rand(0.55, 1.2);
    }

    for (const o of this.obstacles) {
      o.x -= scrollSpeed * dt;
      o.y += o.vy * dt;
      o.phase += dt;
      o.pulse += dt * 4;
      if (o.boostT > 0) o.boostT = Math.max(0, o.boostT - dt);
      if (o.kind === 'flare') {
        o.w = 40 + Math.sin(o.phase * 6) * 12;
        o.h = 40 + Math.cos(o.phase * 5) * 12;
      }
      if (o.x + o.w < -40) o.alive = false;
    }

    for (const c of this.collectibles) {
      c.x -= scrollSpeed * dt * 0.95;
      c.phase += dt * 3;
      c.y += Math.sin(c.phase) * 18 * dt;
      if (c.x < -30) c.alive = false;
    }

    this.recycleDead();
  }

  private recycleDead(): void {
    const os = this.obstacles;
    let w = 0;
    for (let i = 0; i < os.length; i++) {
      const o = os[i];
      if (o.alive) os[w++] = o;
      else this.obsPool.push(o);
    }
    os.length = w;
    const cs = this.collectibles;
    w = 0;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (c.alive) cs[w++] = c;
      else this.colPool.push(c);
    }
    cs.length = w;
  }

  private spawnObstacle(W: number): void {
    const roll = Math.random();
    const x = W + 40;
    const playTop = this.laneTop;
    const playBot = Math.max(this.laneTop + 80, this.laneBot);
    const playH = Math.max(120, playBot - playTop);

    if (roll < 0.35) {
      const h = Math.min(rand(90, 200), playH * 0.55);
      const y = rand(playTop, Math.max(playTop + 8, playBot - h));
      this.pushObs('beam', x, y, 18, h, 0, rand(0, Math.PI * 2));
    } else if (roll < 0.55) {
      const y = rand(playTop + 24, playBot - 24);
      this.pushObs('flare', x, y, 48, 48, rand(-40, 40), 0);
    } else if (roll < 0.8) {
      const y = chance(0.5)
        ? rand(playTop, playTop + playH * 0.28)
        : rand(playBot - playH * 0.28, playBot - 16);
      this.pushObs('neon', x, y, rand(70, 140), 16, 0, 0);
    } else {
      const y = rand(playTop + 40, playBot - 40);
      this.pushObs('ring', x, y, 90, 120, 0, 0);
    }

    if (chance(0.25 + this.difficulty * 0.3)) {
      this.pushObs(
        'beam',
        x + rand(80, 160),
        rand(playTop, Math.max(playTop + 8, playBot - 80)),
        14,
        Math.min(rand(70, 160), playH * 0.5),
        0,
        0,
      );
    }
  }

  /** An appliance power-up at (x, y). */
  addPower(kind: 'toaster' | 'blender' | 'microwave', x: number, y: number): void {
    const c = this.obtainCol();
    c.kind = kind;
    c.x = x;
    c.y = y;
    c.r = 20;
    c.phase = 0;
    c.alive = true;
    c.value = 0;
    this.collectibles.push(c);
  }

  /** A ring gate centred at (cx, cy) (the boss stun rings). */
  addRing(cx: number, cy: number): void {
    const y = Math.min(Math.max(cy - 60, this.laneTop), Math.max(this.laneTop, this.laneBot - 120));
    this.pushObs('ring', cx - 45, y, 90, 120, 0, 0);
  }

  private spawnCollectible(W: number): void {
    const n = chance(0.3) ? 3 : 1;
    const top = this.laneTop + 20;
    const bot = Math.max(top + 8, this.laneBot - 20);
    const baseY = rand(top, bot);
    for (let i = 0; i < n; i++) {
      const c = this.obtainCol();
      c.x = W + 30 + i * 36;
      c.y = baseY + Math.sin(i) * 40;
      c.r = 14;
      c.phase = i;
      c.alive = true;
      c.value = 25;
      c.kind = 'shade';
      this.collectibles.push(c);
    }
  }
}

export function aabb(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): boolean {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

export function circleRect(
  cx: number,
  cy: number,
  r: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
): boolean {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

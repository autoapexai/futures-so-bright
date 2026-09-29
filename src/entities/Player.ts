import { clamp } from '../utils/math';
import { PLAYER_BREED, breedScale, type Breed } from '../render/shipSprite';

export class Player {
  x = 160;
  y = 270;
  vx = 0;
  vy = 0;
  /** The player's dog; its AKC-weight scale sizes the sprite and hitbox (w / h). */
  breed: Breed = PLAYER_BREED;
  /** Linear draw / hitbox scale vs a standard ship. */
  scale = breedScale(PLAYER_BREED);
  w = 52 * breedScale(PLAYER_BREED);
  h = 28 * breedScale(PLAYER_BREED);
  invuln = 0;
  boostFlash = 0;
  trail: { x: number; y: number; a: number }[] = [];
  /** Cap trail nodes (lowered on mobile to cut ellipse fill). */
  maxTrail = 14;
  private readonly _hitbox = { x: 0, y: 0, w: 0, h: 0 };

  reset(h: number): void {
    this.x = 160;
    this.y = h * 0.5;
    this.vx = 0;
    this.vy = 0;
    this.invuln = 1.2;
    this.boostFlash = 0;
    this.trail.length = 0;
  }

  update(
    dt: number,
    axis: { x: number; y: number },
    boosting: boolean,
    boundsW: number,
    boundsH: number,
    speedMul: number,
    topReserve = 60,
    bottomReserve = 60,
    leftReserve = 20,
  ): void {
    const accel = 1800 * speedMul;
    const maxSpeed = (boosting ? 420 : 320) * speedMul;
    const drag = 8;

    this.vx += axis.x * accel * dt;
    this.vy += axis.y * accel * dt;
    this.vx *= Math.exp(-drag * dt);
    this.vy *= Math.exp(-drag * dt);

    const sp = Math.hypot(this.vx, this.vy);
    if (sp > maxSpeed) {
      this.vx = (this.vx / sp) * maxSpeed;
      this.vy = (this.vy / sp) * maxSpeed;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.x = clamp(this.x, Math.max(20, leftReserve), boundsW * 0.55);
    const yMin = topReserve;
    const yMax = Math.max(yMin + 8, boundsH - bottomReserve);
    this.y = clamp(this.y, yMin, yMax);

    this.invuln = Math.max(0, this.invuln - dt);
    this.boostFlash = Math.max(0, this.boostFlash - dt);
    if (boosting) this.boostFlash = 0.15;

    const cap = Math.max(4, this.maxTrail);
    let node = this.trail.length >= cap ? this.trail.pop() : undefined;
    if (!node) node = { x: 0, y: 0, a: 1 };
    node.x = this.x - 18;
    node.y = this.y;
    node.a = 1;
    this.trail.unshift(node);
    for (const t of this.trail) t.a *= 0.88;
  }

  get hitbox(): { x: number; y: number; w: number; h: number } {
    this._hitbox.x = this.x - this.w * 0.35;
    this._hitbox.y = this.y - this.h * 0.35;
    this._hitbox.w = this.w * 0.7;
    this._hitbox.h = this.h * 0.7;
    return this._hitbox;
  }
}

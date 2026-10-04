
/**
 * Movement tuning (v2.1). NO SPEED CAP and NO ACCELERATION LIMIT (by design): while the stick is
 * held in a direction the dogs keep speeding up that way for as long as it is held; there is no
 * maximum and nothing clamps the velocity's magnitude. Pushing against the current motion reverses
 * with twice the push (counter); releasing an axis lets it settle on drag 18 (a quick stop on
 * release; there is no slow-down control). Only the position is bounded (the lane), and touching a
 * lane edge zeroes the velocity INTO that edge (a wall, not a cap) so the stick reverses at once.
 * Fast moves are swept by the game (Game.sweepPlayer), so nothing is skipped at any speed.
 */
export const MOVE = { accel: 4200, stopDrag: 18, counter: 2, deadAxis: 0.02, maxDt: 1 / 20 };
/**
 * FIRE ramp r (0..1), on top of the stick: a press jumps r to at least 0.3, holding climbs r to 1
 * in 2.0 s, every fresh press adds +0.15 at once, and released, r fades to 0 over 1.5 s. While FIRE
 * is held the push is x (1.3 + 0.4 r) (still uncapped); r also drives the jet / trail cue.
 */
export const FIRE = { rFloor: 0.3, holdS: 2.0, tap: 0.15, decayS: 1.5, accelLo: 1.3, accelHi: 1.7 };
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
  /** FIRE ramp 0..1 (extra push while FIRE is held; drives the jet / trail cue). */
  boostRamp = 0;
  /** Fresh FIRE presses waiting to be applied to the ramp (set by the game each step). */
  boostTaps = 0;
  /** Position before the last update (Game sweeps collisions from here to (x, y)). */
  prevX = 0;
  prevY = 0;
  trail: { x: number; y: number; a: number }[] = [];
  /** Cap trail nodes (lowered on mobile to cut ellipse fill). */
  maxTrail = 14;
  private readonly _hitbox = { x: 0, y: 0, w: 0, h: 0 };

  reset(h: number): void {
    this.x = 160;
    this.y = h * 0.5;
    this.vx = 0;
    this.vy = 0;
    this.prevX = this.x;
    this.prevY = this.y;
    this.invuln = 1.2;
    this.boostFlash = 0;
    this.boostRamp = 0;
    this.boostTaps = 0;
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
    // Guard the physics step only (never the speed): no negative / NaN / huge dt.
    dt = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), MOVE.maxDt) : 0;
    // FIRE ramp: taps add instantly (with the 0.3 floor), holding climbs, release fades.
    let r = this.boostRamp;
    if (boosting && this.boostTaps > 0) r = Math.min(1, Math.max(FIRE.rFloor, r + FIRE.tap * this.boostTaps));
    this.boostTaps = 0;
    if (boosting) r = Math.min(1, Math.max(FIRE.rFloor, r) + ((1 - FIRE.rFloor) / FIRE.holdS) * dt);
    else r = Math.max(0, r - dt / FIRE.decayS);
    this.boostRamp = r;
    const accelMul = boosting ? FIRE.accelLo + (FIRE.accelHi - FIRE.accelLo) * r : 1;
    const accel = MOVE.accel * accelMul * speedMul;
    // NO SPEED CAP: the velocity is never clamped (see MOVE).
    this.vx = this.axisVel(this.vx, axis.x, accel, dt);
    this.vy = this.axisVel(this.vy, axis.y, accel, dt);

    this.prevX = this.x;
    this.prevY = this.y;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (!Number.isFinite(this.x)) this.x = this.prevX;
    if (!Number.isFinite(this.y)) this.y = this.prevY;

    // The lane bounds the position (not the speed): an edge stops motion into it.
    const xMin = Math.max(20, leftReserve);
    const xMax = Math.max(xMin, boundsW * 0.55);
    if (this.x <= xMin) {
      this.x = xMin;
      if (this.vx < 0) this.vx = 0;
    } else if (this.x >= xMax) {
      this.x = xMax;
      if (this.vx > 0) this.vx = 0;
    }
    const yMin = topReserve;
    const yMax = Math.max(yMin + 8, boundsH - bottomReserve);
    if (this.y <= yMin) {
      this.y = yMin;
      if (this.vy < 0) this.vy = 0;
    } else if (this.y >= yMax) {
      this.y = yMax;
      if (this.vy > 0) this.vy = 0;
    }

    this.invuln = Math.max(0, this.invuln - dt);
    this.boostFlash = Math.max(0, this.boostFlash - dt);
    if (boosting) this.boostFlash = 0.15;

    // The trail grows with the FIRE ramp (a few extra, longer-lived nodes; cheap).
    const cap = Math.max(4, this.maxTrail + Math.round(r * 6));
    let node = this.trail.length >= cap ? this.trail.pop() : undefined;
    if (!node) node = { x: 0, y: 0, a: 1 };
    node.x = this.x - 18;
    node.y = this.y;
    node.a = 1;
    this.trail.unshift(node);
    const fade = 0.88 + 0.06 * r;
    for (const t of this.trail) t.a *= fade;
  }

  /**
   * One axis. Held: v += push * dt with no drag and no maximum (counter-steer pushes x2). Released:
   * v settles on drag 18. Non-finite results reset to 0 (NaN / Infinity guard; not a cap).
   */
  private axisVel(v: number, a: number, accel: number, dt: number): number {
    let out: number;
    if (!Number.isFinite(a) || Math.abs(a) < MOVE.deadAxis) out = v * Math.exp(-MOVE.stopDrag * dt);
    else out = v + a * accel * (a * v < 0 ? MOVE.counter : 1) * dt;
    return Number.isFinite(out) ? out : 0;
  }

  get hitbox(): { x: number; y: number; w: number; h: number } {
    this._hitbox.x = this.x - this.w * 0.35;
    this._hitbox.y = this.y - this.h * 0.35;
    this._hitbox.w = this.w * 0.7;
    this._hitbox.h = this.h * 0.7;
    return this._hitbox;
  }
}

import { MAX_DRAWN_SHIPS } from '../utils/cloneLevels';
import { BREEDS, BREED_RMS, breedScale, slotBreed, type Breed } from '../render/shipSprite';

/** Clone slot count (drawn ships minus the player's own ship). */
export const CLONE_SLOTS = MAX_DRAWN_SHIPS - 1;

/** Clones are drawn / collide at this scale of the player ship. */
export const CLONE_SCALE = 0.6;

export interface CloneSlot {
  /** Formation offset from the player ship (world px). */
  ox: number;
  oy: number;
  /** Current position (eases toward player + offset). */
  x: number;
  y: number;
  occupied: boolean;
  /** Brief grace after a clone (re)fills this slot, so one obstacle can't eat the whole reserve. */
  invuln: number;
  phase: number;
  /** This clone's dog breed and its absolute scale vs a standard ship (sprite + hitbox). */
  breed: Breed;
  scale: number;
}

/**
 * Tight hex formation around the player: the CLONE_SLOTS grid cells closest
 * to the player, nearest first. Slots 0..k-1 fill first, so small formations
 * hug the player.
 */
function buildOffsets(count = CLONE_SLOTS, DX = 32, DY = 19): { ox: number; oy: number }[] {
  const cells: { ox: number; oy: number; d: number; a: number }[] = [];
  // Grid big enough for `count` cells (the original 9 x 11 grid for the clone formation).
  const k = Math.ceil(Math.sqrt(count)) + 2;
  const R = Math.max(4, k);
  const C = Math.max(5, k);
  for (let r = -R; r <= R; r++) {
    for (let c = -C; c <= C; c++) {
      const ox = c * DX + (r & 1 ? DX / 2 : 0);
      const oy = r * DY;
      if (ox === 0 && oy === 0) continue;
      // Slightly favour cells behind / beside the player over cells ahead of it.
      const d = Math.hypot(ox * (ox > 0 ? 1.15 : 1), oy * 1.25);
      cells.push({ ox, oy, d, a: Math.atan2(oy, -ox) });
    }
  }
  cells.sort((p, q) => p.d - q.d || p.a - q.a);
  return cells.slice(0, count).map(({ ox, oy }) => ({ ox, oy }));
}

/**
 * Up to CLONE_SLOTS drawn clones plus a numeric reserve. Invariant (kept by
 * Game): occupied slots === min(ships - 1, CLONE_SLOTS); the remaining
 * ships - 1 - occupied are the reserve that refills lost drawn clones.
 */
export class Formation {
  readonly slots: CloneSlot[];
  /** Slot capacity (CLONE_SLOTS for clone mode; a fan mode's whole swarm otherwise). */
  readonly capacity: number;

  /** Default: the clone-mode formation. Fan modes pass their own slot count and spacing. */
  constructor(capacity = CLONE_SLOTS, dx = 32, dy = 19) {
    this.capacity = capacity;
    this.slots = buildOffsets(capacity, dx, dy).map(({ ox, oy }, i) => ({
      ox,
      oy,
      x: 0,
      y: 0,
      occupied: false,
      invuln: 0,
      phase: i * 1.7,
      breed: BREEDS[0],
      scale: CLONE_SCALE,
    }));
  }
  occupiedCount = 0;
  /** Offset multiplier (1 = clone formation; the dog pack spreads out as its dogs grow). */
  spread = 1;
  /** Extents of the occupied slots (for keeping the formation on screen). */
  extLeft = 0;
  extRight = 0;
  extUp = 0;
  extDown = 0;

  /** Occupy the first `count` slots (holes filled), placing new clones at the player. */
  fill(count: number, px: number, py: number, grace = 0.6): void {
    const n = Math.max(0, Math.min(this.capacity, count));
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      const want = i < n;
      if (want && !s.occupied) {
        s.x = px + s.ox * this.spread * 0.4;
        s.y = py + s.oy * this.spread * 0.4;
        s.invuln = grace;
        // A breed from the active pet mix (together: cats & dogs alternate by slot).
        s.breed = slotBreed(i);
        s.scale = CLONE_SCALE * (breedScale(s.breed) / BREED_RMS);
      }
      if (!want) s.invuln = 0;
      s.occupied = want;
    }
    this.recount();
  }

  clear(): void {
    for (const s of this.slots) {
      s.occupied = false;
      s.invuln = 0;
    }
    this.recount();
  }

  /** Empty the outermost occupied slot (a clone moved up to replace the player's ship). */
  dropOutermost(): CloneSlot | null {
    for (let i = this.slots.length - 1; i >= 0; i--) {
      const s = this.slots[i];
      if (s.occupied) {
        s.occupied = false;
        this.recount();
        return s;
      }
    }
    return null;
  }

  empty(s: CloneSlot): void {
    s.occupied = false;
    this.recount();
  }

  setSpread(k: number): void {
    if (k === this.spread) return;
    this.spread = k;
    this.recount();
  }

  private recount(): void {
    let n = 0;
    let l = 0;
    let r = 0;
    let u = 0;
    let d = 0;
    for (const s of this.slots) {
      if (!s.occupied) continue;
      n++;
      l = Math.min(l, s.ox);
      r = Math.max(r, s.ox);
      u = Math.min(u, s.oy);
      d = Math.max(d, s.oy);
    }
    const k = this.spread;
    this.occupiedCount = n;
    this.extLeft = -l * k;
    this.extRight = r * k;
    this.extUp = -u * k;
    this.extDown = d * k;
  }

  /** Ease every clone toward player + offset (tight follow, tiny bob). */
  update(dt: number, px: number, py: number, t: number): void {
    const k = 1 - Math.exp(-22 * dt);
    for (const s of this.slots) {
      if (!s.occupied) continue;
      const tx = px + s.ox * this.spread + Math.sin(t * 2.6 + s.phase) * 1.6;
      const ty = py + s.oy * this.spread + Math.cos(t * 3.1 + s.phase) * 1.6;
      s.x += (tx - s.x) * k;
      s.y += (ty - s.y) * k;
      s.invuln = Math.max(0, s.invuln - dt);
    }
  }
}

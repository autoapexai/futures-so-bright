import { MAX_DRAWN_SHIPS } from '../utils/cloneLevels';
import { BREEDS, BREED_RMS, breedScale, randomBreed, type Breed } from '../render/shipSprite';

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
function buildOffsets(): { ox: number; oy: number }[] {
  const DX = 32;
  const DY = 19;
  const cells: { ox: number; oy: number; d: number; a: number }[] = [];
  for (let r = -4; r <= 4; r++) {
    for (let c = -5; c <= 5; c++) {
      const ox = c * DX + (r & 1 ? DX / 2 : 0);
      const oy = r * DY;
      if (ox === 0 && oy === 0) continue;
      // Slightly favour cells behind / beside the player over cells ahead of it.
      const d = Math.hypot(ox * (ox > 0 ? 1.15 : 1), oy * 1.25);
      cells.push({ ox, oy, d, a: Math.atan2(oy, -ox) });
    }
  }
  cells.sort((p, q) => p.d - q.d || p.a - q.a);
  return cells.slice(0, CLONE_SLOTS).map(({ ox, oy }) => ({ ox, oy }));
}

/**
 * Up to CLONE_SLOTS drawn clones plus a numeric reserve. Invariant (kept by
 * Game): occupied slots === min(ships - 1, CLONE_SLOTS); the remaining
 * ships - 1 - occupied are the reserve that refills lost drawn clones.
 */
export class Formation {
  readonly slots: CloneSlot[] = buildOffsets().map(({ ox, oy }, i) => ({
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
  occupiedCount = 0;
  /** Extents of the occupied slots (for keeping the formation on screen). */
  extLeft = 0;
  extRight = 0;
  extUp = 0;
  extDown = 0;

  /** Occupy the first `count` slots (holes filled), placing new clones at the player. */
  fill(count: number, px: number, py: number, grace = 0.6): void {
    const n = Math.max(0, Math.min(CLONE_SLOTS, count));
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      const want = i < n;
      if (want && !s.occupied) {
        s.x = px + s.ox * 0.4;
        s.y = py + s.oy * 0.4;
        s.invuln = grace;
        // A random breed from the mix, normalised so the swarm keeps its expected total area.
        s.breed = randomBreed();
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
    this.occupiedCount = n;
    this.extLeft = -l;
    this.extRight = r;
    this.extUp = -u;
    this.extDown = d;
  }

  /** Ease every clone toward player + offset (tight follow, tiny bob). */
  update(dt: number, px: number, py: number, t: number): void {
    const k = 1 - Math.exp(-22 * dt);
    for (const s of this.slots) {
      if (!s.occupied) continue;
      const tx = px + s.ox + Math.sin(t * 2.6 + s.phase) * 1.6;
      const ty = py + s.oy + Math.cos(t * 3.1 + s.phase) * 1.6;
      s.x += (tx - s.x) * k;
      s.y += (ty - s.y) * k;
      s.invuln = Math.max(0, s.invuln - dt);
    }
  }
}

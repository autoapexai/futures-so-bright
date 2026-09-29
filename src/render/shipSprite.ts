/**
 * THE shared ship sprite: every player "ship" (normal run, title, tutorial, clone swarm,
 * fan-mode swarms) is painted by paintShip() below, so a future sprite swap is one change.
 *
 * Ships are dogs in space (Dan, 2026-09-29): AKC breeds, each sized by the cube root of
 * its AKC adult weight (midpoint; male/female averaged), anchored at 40 lb = 1.0x a
 * standard ship. Sources: dog-breeds-akc.csv. Drawn in the game's existing palette and
 * treatment: soft gradient fills, neon glow, the signature shades, a space-helmet bubble.
 */
import { roundRectPath as rr } from './shapes';

export type EarKind = 'erect' | 'bigErect' | 'flop' | 'longFlop' | 'poof' | 'tiny';
export type TailKind = 'up' | 'curl' | 'poof' | 'straight' | 'plume';

export interface Breed {
  id: string;
  name: string;
  /** AKC midpoint weight (lb), see dog-breeds-akc.csv. */
  weightLb: number;
  /** In-game nickname for the tiniest ones. */
  nickname?: string;
  fur: string;
  fur2: string;
  /** Body half-length / half-height, leg length, head radius, snout length (standard-ship px). */
  bodyL: number;
  bodyH: number;
  legL: number;
  headR: number;
  snout: number;
  ear: EarKind;
  tail: TailKind;
  /** Poodle pom-poms / Pomeranian fluff / Yorkie skirt. */
  fluff?: 'poodle' | 'ball' | 'skirt';
}

// Fur colours are taken from the game's palette (sun / gold / amber / purple / pink / ice / night).
export const BREEDS: readonly Breed[] = [
  { id: 'chihuahua', name: 'Chihuahua', weightLb: 6, nickname: 'TEACUP', fur: '#ffaa44', fur2: '#ffe66d', bodyL: 12, bodyH: 6, legL: 5, headR: 8, snout: 4, ear: 'bigErect', tail: 'up' },
  { id: 'toy-poodle', name: 'Toy Poodle', weightLb: 5, nickname: 'TEACUP', fur: '#ffffff', fur2: '#ff7ad9', bodyL: 11, bodyH: 6, legL: 7, headR: 6.5, snout: 5, ear: 'poof', tail: 'poof', fluff: 'poodle' },
  { id: 'pomeranian', name: 'Pomeranian', weightLb: 5, nickname: 'TEACUP', fur: '#ff6b35', fur2: '#ffaa44', bodyL: 12, bodyH: 9, legL: 3, headR: 7, snout: 3, ear: 'tiny', tail: 'curl', fluff: 'ball' },
  { id: 'yorkshire-terrier', name: 'Yorkshire Terrier', weightLb: 7, nickname: 'TEACUP', fur: '#ffaa44', fur2: '#3a1560', bodyL: 12, bodyH: 6, legL: 3, headR: 6.5, snout: 4, ear: 'erect', tail: 'up', fluff: 'skirt' },
  { id: 'miniature-poodle', name: 'Miniature Poodle', weightLb: 12.5, fur: '#b4f0ff', fur2: '#9b5cff', bodyL: 13, bodyH: 6.5, legL: 7, headR: 6.5, snout: 6, ear: 'poof', tail: 'poof', fluff: 'poodle' },
  { id: 'dachshund', name: 'Dachshund', weightLb: 24, fur: '#ff6b35', fur2: '#3a1560', bodyL: 19, bodyH: 5.5, legL: 3, headR: 6, snout: 8, ear: 'longFlop', tail: 'straight' },
  { id: 'beagle', name: 'Beagle', weightLb: 25, fur: '#ffffff', fur2: '#ffaa44', bodyL: 14, bodyH: 7, legL: 6, headR: 7, snout: 6, ear: 'longFlop', tail: 'up' },
  { id: 'border-collie', name: 'Border Collie', weightLb: 42.5, fur: '#ffffff', fur2: '#2a1050', bodyL: 15, bodyH: 7, legL: 7, headR: 7, snout: 7, ear: 'flop', tail: 'plume' },
  { id: 'labrador-retriever', name: 'Labrador Retriever', weightLb: 67.5, fur: '#ffe66d', fur2: '#ffaa44', bodyL: 16, bodyH: 8, legL: 7, headR: 7.5, snout: 7, ear: 'flop', tail: 'straight' },
  { id: 'german-shepherd-dog', name: 'German Shepherd Dog', weightLb: 68.75, fur: '#ffaa44', fur2: '#2a1050', bodyL: 16, bodyH: 7.5, legL: 8, headR: 7, snout: 8, ear: 'erect', tail: 'plume' },
  { id: 'great-dane', name: 'Great Dane', weightLb: 141.25, fur: '#9b5cff', fur2: '#2a1050', bodyL: 16, bodyH: 7, legL: 11, headR: 7, snout: 8, ear: 'flop', tail: 'straight' },
  { id: 'mastiff', name: 'Mastiff', weightLb: 170, fur: '#ffe66d', fur2: '#2a1050', bodyL: 16, bodyH: 9.5, legL: 7, headR: 9, snout: 6, ear: 'flop', tail: 'straight' },
];

/** Linear size vs a standard ship: cube root of weight (body volume), 40 lb = 1.0x. */
export const breedScale = (b: Breed): number => Math.cbrt(b.weightLb / 40);

/** RMS breed scale over the uniform mix, so a random-breed swarm keeps its expected total area. */
export const BREED_RMS = Math.sqrt(BREEDS.reduce((a, b) => a + breedScale(b) ** 2, 0) / BREEDS.length);

/** Random breed from the full mix (small to large). */
export function randomBreed(): Breed {
  return BREEDS[Math.floor(Math.random() * BREEDS.length)];
}

export function breedById(id: string): Breed {
  return BREEDS.find((b) => b.id === id) ?? BREEDS[7];
}

/** The normal run's dog: Border Collie (42.5 lb, 1.02x) keeps the tuned hitbox ~unchanged. */
export const PLAYER_BREED = breedById('border-collie');

export interface ShipPaint {
  /** Shades lens colour (charge-coded on the player). */
  lens?: string;
  /** Helmet rim / collar accent (fan modes tint this). */
  accent?: string;
  /** Neon glow (player only; sprites are baked without blur). */
  glow?: boolean;
  /** Dark body + accent outline variant. */
  outline?: boolean;
  /** Draw the static jet flame (sprites); the player draws an animated one itself. */
  flame?: boolean;
}

/**
 * Paint one ship (a dog in space) facing right, centred on (0, 0), in standard-ship
 * units (~52 x 30 px at 1.0x). Callers scale the context for breed / mode size.
 */
export function paintShip(g: CanvasRenderingContext2D, b: Breed, o: ShipPaint = {}): void {
  const lens = o.lens ?? 'rgba(0, 255, 220, 0.8)';
  const accent = o.accent ?? '#00f0ff';
  const L = b.bodyL;
  const H = b.bodyH;
  const bx = -4; // body centre x
  const by = 2;
  const hx = bx + L + b.headR * 0.55; // head centre
  const hy = by - H - b.headR * 0.35;
  const dark = '#0a0018';

  if (o.flame) {
    g.fillStyle = 'rgba(0, 255, 255, 0.45)';
    g.beginPath();
    g.moveTo(bx - L + 1, by - 4);
    g.lineTo(bx - L - 16, by);
    g.lineTo(bx - L + 1, by + 4);
    g.closePath();
    g.fill();
  }

  g.lineJoin = 'round';
  g.lineCap = 'round';
  const furFill = (x0: number, x1: number): string | CanvasGradient => {
    if (o.outline) return dark;
    const gr = g.createLinearGradient(x0, 0, x1, 0);
    gr.addColorStop(0, shade(b.fur, -0.35));
    gr.addColorStop(0.6, b.fur);
    gr.addColorStop(1, b.fur);
    return gr;
  };

  // tail
  g.strokeStyle = o.outline ? accent : b.fur;
  g.fillStyle = o.outline ? dark : b.fur;
  g.lineWidth = b.tail === 'plume' ? 4 : 2.6;
  const tx = bx - L + 1;
  const ty = by - H * 0.4;
  g.beginPath();
  if (b.tail === 'up') {
    g.moveTo(tx, ty);
    g.quadraticCurveTo(tx - 6, ty - 4, tx - 5, ty - 10);
    g.stroke();
  } else if (b.tail === 'curl') {
    g.arc(tx - 1, ty - 5, 5, Math.PI * 0.4, Math.PI * 2.1);
    g.stroke();
  } else if (b.tail === 'poof') {
    g.moveTo(tx, ty);
    g.lineTo(tx - 5, ty - 6);
    g.stroke();
    g.beginPath();
    g.arc(tx - 6, ty - 8, 3.2, 0, Math.PI * 2);
    g.fillStyle = o.outline ? dark : b.fur;
    g.fill();
  } else if (b.tail === 'plume') {
    g.moveTo(tx, ty);
    g.quadraticCurveTo(tx - 9, ty + 1, tx - 12, ty + 6);
    g.stroke();
  } else {
    g.moveTo(tx, ty);
    g.lineTo(tx - 10, ty - 3);
    g.stroke();
  }

  // legs (floating: front pair reaching forward, back pair trailing)
  g.fillStyle = o.outline ? dark : shade(b.fur, -0.15);
  const legW = Math.max(2.4, H * 0.45);
  const legY = by + H * 0.55;
  for (const [lx, lean] of [[bx - L * 0.7, -0.35], [bx - L * 0.45, -0.25], [bx + L * 0.5, 0.35], [bx + L * 0.75, 0.45]] as const) {
    g.save();
    g.translate(lx, legY);
    g.rotate(lean);
    rr(g, -legW / 2, 0, legW, b.legL + 1, legW / 2);
    g.fill();
    if (o.outline) {
      g.strokeStyle = accent;
      g.lineWidth = 1.2;
      g.stroke();
    }
    g.restore();
  }

  // body
  g.fillStyle = furFill(bx - L, bx + L);
  rr(g, bx - L, by - H, L * 2, H * 2, H);
  g.fill();
  if (o.outline) {
    g.strokeStyle = accent;
    g.lineWidth = 2;
    g.stroke();
  } else if (b.fur2) {
    // saddle / patch
    g.fillStyle = b.fur2;
    g.globalAlpha = 0.9;
    rr(g, bx - L * 0.55, by - H, L * 1.0, H * 0.9, H * 0.45);
    g.fill();
    g.globalAlpha = 1;
  }
  if (b.fluff === 'poodle' && !o.outline) {
    g.fillStyle = b.fur;
    g.beginPath();
    g.arc(bx + L * 0.35, by - H * 0.2, H * 1.15, 0, Math.PI * 2);
    g.arc(bx - L * 0.85, by, H * 0.7, 0, Math.PI * 2);
    g.fill();
  } else if (b.fluff === 'ball' && !o.outline) {
    g.fillStyle = b.fur2;
    g.beginPath();
    g.arc(bx + L * 0.55, by - H * 0.35, H * 0.95, 0, Math.PI * 2);
    g.fill();
  } else if (b.fluff === 'skirt' && !o.outline) {
    g.fillStyle = b.fur;
    g.beginPath();
    g.moveTo(bx - L, by + H * 0.2);
    for (let i = 0; i <= 6; i++) g.lineTo(bx - L + (i * L * 2) / 6, by + H + (i % 2 ? 4 : 1.5));
    g.lineTo(bx + L, by + H * 0.2);
    g.closePath();
    g.fill();
  }

  // collar (accent)
  g.strokeStyle = accent;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(bx + L - 1, by - H + 1);
  g.lineTo(bx + L + 1, by + H * 0.3);
  g.stroke();

  // helmet bubble (behind head details, in front of body)
  const hr = b.headR + Math.max(5, b.snout * 0.55) + 2.5;
  g.fillStyle = 'rgba(180, 240, 255, 0.14)';
  g.beginPath();
  g.arc(hx + b.snout * 0.3, hy, hr, 0, Math.PI * 2);
  g.fill();

  // ears behind head
  g.fillStyle = o.outline ? dark : b.fur2 && b.ear !== 'poof' ? shade(b.fur2 === '#ffffff' ? b.fur : b.fur2, 0) : b.fur;
  const er = b.headR;
  g.beginPath();
  if (b.ear === 'erect' || b.ear === 'bigErect' || b.ear === 'tiny') {
    const k = b.ear === 'bigErect' ? 1.15 : b.ear === 'tiny' ? 0.55 : 1;
    g.moveTo(hx - er * 0.75, hy - er * 0.35);
    g.lineTo(hx - er * 0.55 - 2 * k, hy - er - 7 * k);
    g.lineTo(hx + er * 0.1, hy - er * 0.7);
    g.closePath();
  } else if (b.ear === 'poof') {
    g.arc(hx - er * 0.55, hy + er * 0.2, er * 0.6, 0, Math.PI * 2);
    g.arc(hx - er * 0.1, hy - er * 0.95, er * 0.55, 0, Math.PI * 2);
  } else {
    const len = b.ear === 'longFlop' ? er * 1.35 : er * 0.95;
    rr(g, hx - er * 0.9, hy - er * 0.55, er * 0.75, len, er * 0.35);
  }
  g.fill();

  // head + snout
  g.fillStyle = furFill(hx - b.headR, hx + b.headR + b.snout);
  g.beginPath();
  g.arc(hx, hy, b.headR, 0, Math.PI * 2);
  g.fill();
  rr(g, hx, hy - b.headR * 0.15, b.headR * 0.4 + b.snout, b.headR * 0.85, b.headR * 0.4);
  g.fill();
  if (o.outline) {
    g.strokeStyle = accent;
    g.lineWidth = 1.6;
    g.beginPath();
    g.arc(hx, hy, b.headR, 0, Math.PI * 2);
    g.stroke();
  }
  // nose
  g.fillStyle = dark;
  g.beginPath();
  g.arc(hx + b.headR * 0.4 + b.snout, hy + b.headR * 0.05, 1.6, 0, Math.PI * 2);
  g.fill();

  // the shades — still the star of the show
  g.fillStyle = dark;
  rr(g, hx - b.headR * 0.35, hy - b.headR * 0.55, b.headR * 1.35, 5, 1.5);
  g.fill();
  if (o.glow) {
    g.shadowBlur = 10;
    g.shadowColor = lens;
  }
  g.fillStyle = lens;
  rr(g, hx - b.headR * 0.25, hy - b.headR * 0.5, b.headR * 0.5, 3.6, 1);
  g.fill();
  rr(g, hx + b.headR * 0.35, hy - b.headR * 0.5, b.headR * 0.5, 3.6, 1);
  g.fill();
  g.shadowBlur = 0;

  // helmet rim + glint
  g.strokeStyle = accent;
  g.globalAlpha = 0.75;
  g.lineWidth = 1.6;
  g.beginPath();
  g.arc(hx + b.snout * 0.3, hy, hr, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 0.6;
  g.strokeStyle = '#ffffff';
  g.lineWidth = 1.4;
  g.beginPath();
  g.arc(hx + b.snout * 0.3, hy, hr - 2.5, -Math.PI * 0.85, -Math.PI * 0.55);
  g.stroke();
  g.globalAlpha = 1;
}

/** Lighten (amt > 0) or darken (amt < 0) a #rrggbb colour. */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  const r = f((n >> 16) & 255);
  const gg = f((n >> 8) & 255);
  const bl = f(n & 255);
  return `rgb(${r}, ${gg}, ${bl})`;
}

const spriteCache = new Map<string, HTMLCanvasElement>();
/** Sprite box in standard-ship units: the ship is painted at (SPRITE_AX, SPRITE_AY). */
export const SPRITE_W = 84;
export const SPRITE_H = 48;
export const SPRITE_AX = 40;
export const SPRITE_AY = 26;

/** Cached pre-rendered ship (supersampled 2x); one drawImage per ship in swarms. */
export function shipSprite(b: Breed, o: ShipPaint = {}): HTMLCanvasElement {
  const key = `${b.id}|${o.lens ?? ''}|${o.accent ?? ''}|${o.outline ? 1 : 0}|${o.flame ? 1 : 0}`;
  const hit = spriteCache.get(key);
  if (hit) return hit;
  const k = 2;
  const c = document.createElement('canvas');
  c.width = SPRITE_W * k;
  c.height = SPRITE_H * k;
  const g = c.getContext('2d');
  if (g) {
    g.scale(k, k);
    g.translate(SPRITE_AX, SPRITE_AY);
    paintShip(g, b, { ...o, glow: false });
  }
  spriteCache.set(key, c);
  return c;
}

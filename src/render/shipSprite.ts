/**
 * THE shared ship sprite: every player "ship" (normal run, title, tutorial, clone swarm,
 * fan-mode swarms) is painted by paintShip() below, so a future sprite swap is one change.
 *
 * Ships are pets in space (Dan, 2026-09-29): AKC dog breeds (and matched cat breeds for
 * the pet picker), each sized by the cube root of adult weight (midpoint), anchored at
 * 40 lb = 1.0x a standard ship. Cat tiers reuse the dog weightLb values so hitboxes stay
 * identical. Sources: dog-breeds-akc.csv. Drawn in the game's existing palette and
 * treatment: soft gradient fills, neon glow, friendly eyes, a space-helmet bubble.
 */
import { pet } from '../utils/pets';

import { roundRectPath as rr } from './shapes';

export type Species = 'dog' | 'cat' | 'platypus' | 'manatee';
export type EarKind = 'erect' | 'bigErect' | 'flop' | 'longFlop' | 'poof' | 'tiny';
export type TailKind = 'up' | 'curl' | 'poof' | 'straight' | 'plume';

export interface Breed {
  id: string;
  name: string;
  /** 'dog' (default pack), 'cat' (cat mode / mixed pack), or a story-mode animal (utils/campaign.ts). */
  species: Species;
  /** AKC midpoint weight (lb), see dog-breeds-akc.csv. Cat tiers reuse dog weights. */
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
  { species: 'dog', id: 'chihuahua', name: 'Chihuahua', weightLb: 6, nickname: 'TEACUP', fur: '#ffaa44', fur2: '#ffe66d', bodyL: 12, bodyH: 6, legL: 5, headR: 8, snout: 4, ear: 'bigErect', tail: 'up' },
  { species: 'dog', id: 'toy-poodle', name: 'Toy Poodle', weightLb: 5, nickname: 'TEACUP', fur: '#ffffff', fur2: '#ff7ad9', bodyL: 11, bodyH: 6, legL: 7, headR: 6.5, snout: 5, ear: 'poof', tail: 'poof', fluff: 'poodle' },
  { species: 'dog', id: 'pomeranian', name: 'Pomeranian', weightLb: 5, nickname: 'TEACUP', fur: '#ff6b35', fur2: '#ffaa44', bodyL: 12, bodyH: 9, legL: 3, headR: 7, snout: 3, ear: 'tiny', tail: 'curl', fluff: 'ball' },
  { species: 'dog', id: 'yorkshire-terrier', name: 'Yorkshire Terrier', weightLb: 7, nickname: 'TEACUP', fur: '#ffaa44', fur2: '#3a1560', bodyL: 12, bodyH: 6, legL: 3, headR: 6.5, snout: 4, ear: 'erect', tail: 'up', fluff: 'skirt' },
  { species: 'dog', id: 'miniature-poodle', name: 'Miniature Poodle', weightLb: 12.5, fur: '#b4f0ff', fur2: '#9b5cff', bodyL: 13, bodyH: 6.5, legL: 7, headR: 6.5, snout: 6, ear: 'poof', tail: 'poof', fluff: 'poodle' },
  { species: 'dog', id: 'dachshund', name: 'Dachshund', weightLb: 24, fur: '#ff6b35', fur2: '#3a1560', bodyL: 19, bodyH: 5.5, legL: 3, headR: 6, snout: 8, ear: 'longFlop', tail: 'straight' },
  { species: 'dog', id: 'beagle', name: 'Beagle', weightLb: 25, fur: '#ffffff', fur2: '#ffaa44', bodyL: 14, bodyH: 7, legL: 6, headR: 7, snout: 6, ear: 'longFlop', tail: 'up' },
  { species: 'dog', id: 'border-collie', name: 'Border Collie', weightLb: 42.5, fur: '#ffffff', fur2: '#2a1050', bodyL: 15, bodyH: 7, legL: 7, headR: 7, snout: 7, ear: 'flop', tail: 'plume' },
  { species: 'dog', id: 'labrador-retriever', name: 'Labrador Retriever', weightLb: 67.5, fur: '#ffe66d', fur2: '#ffaa44', bodyL: 16, bodyH: 8, legL: 7, headR: 7.5, snout: 7, ear: 'flop', tail: 'straight' },
  { species: 'dog', id: 'german-shepherd-dog', name: 'German Shepherd Dog', weightLb: 68.75, fur: '#ffaa44', fur2: '#2a1050', bodyL: 16, bodyH: 7.5, legL: 8, headR: 7, snout: 8, ear: 'erect', tail: 'plume' },
  { species: 'dog', id: 'great-dane', name: 'Great Dane', weightLb: 141.25, fur: '#9b5cff', fur2: '#2a1050', bodyL: 16, bodyH: 7, legL: 11, headR: 7, snout: 8, ear: 'flop', tail: 'straight' },
  { species: 'dog', id: 'mastiff', name: 'Mastiff', weightLb: 170, fur: '#ffe66d', fur2: '#2a1050', bodyL: 16, bodyH: 9.5, legL: 7, headR: 9, snout: 6, ear: 'flop', tail: 'straight' },
];

/**
 * Cat breeds mapped 1:1 onto dog weightLb / body tiers so hitbox scales stay unchanged.
 * Same art treatment as dogs, with triangle ears, whiskers and a long curved tail.
 */
export const CAT_BREEDS: readonly Breed[] = [
  { species: 'cat', id: 'singapura', name: 'Singapura', weightLb: 6, nickname: 'TEACUP', fur: '#ffaa44', fur2: '#ffe66d', bodyL: 12, bodyH: 6, legL: 5, headR: 8, snout: 4, ear: 'bigErect', tail: 'up' },
  { species: 'cat', id: 'devon-rex', name: 'Devon Rex', weightLb: 5, nickname: 'TEACUP', fur: '#ffffff', fur2: '#ff7ad9', bodyL: 11, bodyH: 6, legL: 7, headR: 6.5, snout: 5, ear: 'bigErect', tail: 'up' },
  { species: 'cat', id: 'munchkin', name: 'Munchkin', weightLb: 5, nickname: 'TEACUP', fur: '#ff6b35', fur2: '#ffaa44', bodyL: 12, bodyH: 9, legL: 3, headR: 7, snout: 3, ear: 'erect', tail: 'curl' },
  { species: 'cat', id: 'siamese', name: 'Siamese', weightLb: 7, nickname: 'TEACUP', fur: '#ffe66d', fur2: '#3a1560', bodyL: 12, bodyH: 6, legL: 3, headR: 6.5, snout: 4, ear: 'bigErect', tail: 'straight' },
  { species: 'cat', id: 'russian-blue', name: 'Russian Blue', weightLb: 12.5, fur: '#b4f0ff', fur2: '#9b5cff', bodyL: 13, bodyH: 6.5, legL: 7, headR: 6.5, snout: 6, ear: 'erect', tail: 'up' },
  { species: 'cat', id: 'oriental', name: 'Oriental', weightLb: 24, fur: '#ff6b35', fur2: '#3a1560', bodyL: 19, bodyH: 5.5, legL: 3, headR: 6, snout: 8, ear: 'bigErect', tail: 'straight' },
  { species: 'cat', id: 'british-shorthair', name: 'British Shorthair', weightLb: 25, fur: '#ffffff', fur2: '#ffaa44', bodyL: 14, bodyH: 7, legL: 6, headR: 7, snout: 6, ear: 'tiny', tail: 'up' },
  { species: 'cat', id: 'maine-coon', name: 'Maine Coon', weightLb: 42.5, fur: '#ffffff', fur2: '#2a1050', bodyL: 15, bodyH: 7, legL: 7, headR: 7, snout: 7, ear: 'erect', tail: 'plume' },
  { species: 'cat', id: 'ragdoll', name: 'Ragdoll', weightLb: 67.5, fur: '#ffe66d', fur2: '#ffaa44', bodyL: 16, bodyH: 8, legL: 7, headR: 7.5, snout: 7, ear: 'flop', tail: 'plume' },
  { species: 'cat', id: 'norwegian-forest', name: 'Norwegian Forest', weightLb: 68.75, fur: '#ffaa44', fur2: '#2a1050', bodyL: 16, bodyH: 7.5, legL: 8, headR: 7, snout: 8, ear: 'erect', tail: 'plume' },
  { species: 'cat', id: 'savannah', name: 'Savannah', weightLb: 141.25, fur: '#9b5cff', fur2: '#2a1050', bodyL: 16, bodyH: 7, legL: 11, headR: 7, snout: 8, ear: 'bigErect', tail: 'straight' },
  { species: 'cat', id: 'ragamuffin', name: 'Ragamuffin', weightLb: 170, fur: '#ffe66d', fur2: '#2a1050', bodyL: 16, bodyH: 9.5, legL: 7, headR: 9, snout: 6, ear: 'flop', tail: 'plume' },
];

/**
 * STORY MODES (utils/campaign.ts): PLATYPUS MODE and MANATEE MODE swap the dogs for that animal.
 * Each roster mirrors the dog tiers 1:1 (same weightLb and body numbers), so sizes and hitboxes
 * are exactly dog mode's; only the painting differs (see paintCritter). fur2 is the belly / bill.
 */
const PLATYPUS_FUR: readonly [string, string, string][] = [
  // [name, fur, bill]
  ['Puggle', '#c98a4b', '#7f9fb8'],
  ['Paddle', '#b8743a', '#8aa7c0'],
  ['Sunny', '#d9a05a', '#7f9fb8'],
  ['Pebble', '#a86a34', '#93b0c6'],
  ['Bubbles', '#c27d42', '#9ab4ff'],
  ['Splash', '#b06c33', '#7fb7c8'],
  ['Duckie', '#d39350', '#8aa7c0'],
  ['Captain', '#bf7e44', '#7f9fb8'],
  ['Rocket', '#b5763c', '#8fa0d8'],
  ['Comet', '#c88748', '#7fb7c8'],
  ['Big Bill', '#a86a34', '#93b0c6'],
  ['Admiral', '#b97a40', '#8aa7c0'],
];
const MANATEE_FUR: readonly [string, string, string][] = [
  // [name, body, snout]
  ['Bean', '#9fb2c6', '#cbd8e6'],
  ['Button', '#a9a6d8', '#d6d2f2'],
  ['Marshmallow', '#b4c4d4', '#e2eaf2'],
  ['Dumpling', '#93a8bd', '#c6d4e2'],
  ['Pudding', '#8fb8c0', '#c4e0e4'],
  ['Biscuit', '#a3b0c8', '#d0d8e8'],
  ['Mochi', '#b0a8cc', '#dcd6ee'],
  ['Gentle Gus', '#96aabe', '#c8d6e4'],
  ['Sea Cow', '#9cb0c2', '#cfdbe7'],
  ['Lettuce', '#8fb4b0', '#c4e0dc'],
  ['Big Hug', '#a0aec4', '#d0dae8'],
  ['Grand Gus', '#94a6bc', '#c8d4e4'],
];
const critters = (species: 'platypus' | 'manatee', fur: readonly [string, string, string][]): Breed[] =>
  BREEDS.map((d, i) => ({
    ...d,
    species,
    id: `${species}-${i}`,
    name: fur[i][0],
    fur: fur[i][1],
    fur2: fur[i][2],
    fluff: undefined,
  }));
export const PLATYPUS_BREEDS: readonly Breed[] = critters('platypus', PLATYPUS_FUR);
export const MANATEE_BREEDS: readonly Breed[] = critters('manatee', MANATEE_FUR);

/** Linear size vs a standard ship: cube root of weight (body volume), 40 lb = 1.0x. */
export const breedScale = (b: Breed): number => Math.cbrt(b.weightLb / 40);

/** RMS breed scale over the uniform mix, so a random-breed swarm keeps its expected total area. */
export const BREED_RMS = Math.sqrt(BREEDS.reduce((a, b) => a + breedScale(b) ** 2, 0) / BREEDS.length);

/** All breeds (dogs + cats) for id lookup. */
const ALL_BREEDS: readonly Breed[] = [...BREEDS, ...CAT_BREEDS, ...PLATYPUS_BREEDS, ...MANATEE_BREEDS];

/** Story-mode animal roster for a species run (null for dogs / cats / together). */
function critterRoster(p: string): readonly Breed[] | null {
  return p === 'platypus' ? PLATYPUS_BREEDS : p === 'manatee' ? MANATEE_BREEDS : null;
}
const tierIndex = (b: Breed): number => {
  const m = /-(\d+)$/.exec(b.id);
  if (b.species === 'platypus' || b.species === 'manatee') return m ? Number(m[1]) : 7;
  const i = (b.species === 'cat' ? CAT_BREEDS : BREEDS).findIndex((x) => x.id === b.id);
  return i >= 0 ? i : 7;
};

/** Dog index → matching cat tier (same weightLb / body). */
export function catTierOf(dog: Breed): Breed {
  const i = BREEDS.findIndex((b) => b.id === dog.id);
  return CAT_BREEDS[i >= 0 ? i : 7];
}

/** Cat index → matching dog tier. */
export function dogTierOf(cat: Breed): Breed {
  const i = CAT_BREEDS.findIndex((b) => b.id === cat.id);
  return BREEDS[i >= 0 ? i : 7];
}

/** Map a dog-id pick onto the active pet species (cats mode uses the matched cat tier). */
export function breedForPet(dogOrAnyId: string): Breed {
  const dog = BREEDS.find((b) => b.id === dogOrAnyId);
  const cat = CAT_BREEDS.find((b) => b.id === dogOrAnyId);
  const p = pet();
  const crit = critterRoster(p);
  if (crit) return crit[dog ? tierIndex(dog) : cat ? tierIndex(cat) : 7];
  if (p === 'cats') {
    if (cat) return cat;
    if (dog) return catTierOf(dog);
    return CAT_BREEDS[7];
  }
  if (dog) return dog;
  if (cat) return dogTierOf(cat);
  return BREEDS[7];
}

/** Random breed from the active pet mix. Together: 50/50 cat or dog (peaceful mix). */
export function randomBreed(): Breed {
  const p = pet();
  const crit = critterRoster(p);
  if (crit) return crit[Math.floor(Math.random() * crit.length)];
  if (p === 'cats') return CAT_BREEDS[Math.floor(Math.random() * CAT_BREEDS.length)];
  if (p === 'dogs') return BREEDS[Math.floor(Math.random() * BREEDS.length)];
  return Math.random() < 0.5
    ? BREEDS[Math.floor(Math.random() * BREEDS.length)]
    : CAT_BREEDS[Math.floor(Math.random() * CAT_BREEDS.length)];
}

/**
 * Breed for formation / swarm slot `i` (0 = first clone). Together mode alternates
 * dogs and cats so the pack flies as a mixed peaceful pack.
 */
export function slotBreed(i: number): Breed {
  const p = pet();
  const crit = critterRoster(p);
  if (crit) return crit[Math.floor(Math.random() * crit.length)];
  if (p === 'cats') return CAT_BREEDS[Math.floor(Math.random() * CAT_BREEDS.length)];
  if (p === 'dogs') return BREEDS[Math.floor(Math.random() * BREEDS.length)];
  // together: alternate starting with a cat so the lead dog flies with cats beside it
  if (i % 2 === 0) return CAT_BREEDS[Math.floor(Math.random() * CAT_BREEDS.length)];
  return BREEDS[Math.floor(Math.random() * BREEDS.length)];
}

export function breedById(id: string): Breed {
  return ALL_BREEDS.find((b) => b.id === id) ?? BREEDS[7];
}

/** The normal run's dog: Border Collie (42.5 lb, 1.02x) keeps the tuned hitbox ~unchanged. */
export const PLAYER_BREED = BREEDS[7];
/** Cats-mode lead: Maine Coon (same weightLb / scale as Border Collie). */
export const PLAYER_CAT = CAT_BREEDS[7];

/** Lead ship for the current pet choice (together keeps the Border Collie lead). */
export function playerBreedNow(): Breed {
  const p = pet();
  const crit = critterRoster(p);
  if (crit) return crit[7];
  return p === 'cats' ? PLAYER_CAT : PLAYER_BREED;
}

/** Same body tier in another species' roster (story modes keep every dog's size). */
export function rosterFor(species: string): readonly Breed[] {
  return critterRoster(species) ?? (species === 'cats' ? CAT_BREEDS : BREEDS);
}

export interface ShipPaint {
  /** Legacy charge colour (was the eyewear lens; unused since eyewear was removed). */
  lens?: string;
  /** Helmet rim / collar accent (fan modes tint this). */
  accent?: string;
  /** Neon glow (player only; sprites are baked without blur). */
  glow?: boolean;
  /** Dark body + accent outline variant. */
  outline?: boolean;
  /** Draw the static jet flame (sprites); the player draws an animated one itself. */
  flame?: boolean;
  /**
   * Cats wear a space suit (body suit, boots, backpack, neck ring) unless noSuit: CAT MODE needs
   * the suit. noSuit is only for the first-try "can't breathe up here" scene (catSuitScene.ts).
   */
  noSuit?: boolean;
  /** No helmet bubble (the suitless cats in that scene). */
  noHelmet?: boolean;
  /** Ear size multiplier (the scene's cartoon ear "pop"). */
  earK?: number;
}

/**
 * Paint one ship (a dog or cat in space) facing right, centred on (0, 0), in standard-ship
 * units (~52 x 30 px at 1.0x). Callers scale the context for breed / mode size.
 */
export function paintShip(g: CanvasRenderingContext2D, b: Breed, o: ShipPaint = {}): void {
  if (b.species === 'platypus' || b.species === 'manatee') {
    paintCritter(g, b, o);
    return;
  }
  const accent = o.accent ?? '#00f0ff';
  const isCat = b.species === 'cat';
  const suited = isCat && !o.noSuit && !o.outline;
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

  // tail (cats: long thin upward curve)
  g.strokeStyle = o.outline ? accent : b.fur;
  g.fillStyle = o.outline ? dark : b.fur;
  g.lineWidth = isCat ? 2.2 : b.tail === 'plume' ? 4 : 2.6;
  const tx = bx - L + 1;
  const ty = by - H * 0.4;
  g.beginPath();
  if (isCat) {
    g.moveTo(tx, ty);
    g.quadraticCurveTo(tx - 8, ty - 10, tx - 4, ty - 18);
    g.quadraticCurveTo(tx - 2, ty - 22, tx - 6, ty - 24);
    g.stroke();
  } else if (b.tail === 'up') {
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
  if (suited) {
    // space-suit boots
    g.fillStyle = '#eef4ff';
    for (const [lx, lean] of [[bx - L * 0.7, -0.35], [bx - L * 0.45, -0.25], [bx + L * 0.5, 0.35], [bx + L * 0.75, 0.45]] as const) {
      g.save();
      g.translate(lx, legY);
      g.rotate(lean);
      rr(g, -legW / 2 - 0.4, b.legL * 0.45, legW + 0.8, b.legL * 0.6 + 1.2, legW / 2);
      g.fill();
      g.restore();
    }
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

  if (suited) {
    // backpack (air tank) with a status light
    g.fillStyle = '#c9d6ea';
    rr(g, bx - L * 0.55, by - H - 3.2, L * 0.75, 4.4, 1.6);
    g.fill();
    g.fillStyle = '#7dffb0';
    g.beginPath();
    g.arc(bx - L * 0.45 + 1.2, by - H - 1, 0.9, 0, Math.PI * 2);
    g.fill();
    // white suit over the body, accent stripe and chest badge (tail and paws peek out)
    const sg = g.createLinearGradient(bx - L, 0, bx + L, 0);
    sg.addColorStop(0, '#b9c7dc');
    sg.addColorStop(0.55, '#eef4ff');
    sg.addColorStop(1, '#ffffff');
    g.fillStyle = sg;
    rr(g, bx - L * 0.92, by - H * 0.95, L * 1.88, H * 1.9, H * 0.95);
    g.fill();
    g.fillStyle = accent;
    g.globalAlpha = 0.85;
    rr(g, bx - L * 0.92, by - H * 0.12, L * 1.88, Math.max(1.6, H * 0.32), H * 0.16);
    g.fill();
    g.globalAlpha = 1;
    g.fillStyle = '#ffe66d';
    g.beginPath();
    g.arc(bx + L * 0.55, by - H * 0.45, Math.max(1.3, H * 0.22), 0, Math.PI * 2);
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
  if (!o.noHelmet) {
    g.fillStyle = suited ? 'rgba(180, 240, 255, 0.2)' : 'rgba(180, 240, 255, 0.14)';
    g.beginPath();
    g.arc(hx + b.snout * 0.3, hy, hr, 0, Math.PI * 2);
    g.fill();
  }

  // ears behind head (cats: twin triangles)
  g.fillStyle = o.outline ? dark : b.fur2 && b.ear !== 'poof' ? shade(b.fur2 === '#ffffff' ? b.fur : b.fur2, 0) : b.fur;
  const er = b.headR;
  if (isCat) {
    const k = (b.ear === 'bigErect' ? 1.2 : b.ear === 'tiny' ? 0.75 : 1) * (o.earK ?? 1);
    g.beginPath();
    g.moveTo(hx - er * 0.85, hy - er * 0.15);
    g.lineTo(hx - er * 0.55, hy - er - 8 * k);
    g.lineTo(hx - er * 0.15, hy - er * 0.45);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(hx + er * 0.05, hy - er * 0.45);
    g.lineTo(hx + er * 0.45, hy - er - 8 * k);
    g.lineTo(hx + er * 0.75, hy - er * 0.15);
    g.closePath();
    g.fill();
    // inner ear pink
    if (!o.outline) {
      g.fillStyle = '#ff7ad9';
      g.globalAlpha = 0.55;
      g.beginPath();
      g.moveTo(hx - er * 0.7, hy - er * 0.25);
      g.lineTo(hx - er * 0.52, hy - er - 5 * k);
      g.lineTo(hx - er * 0.28, hy - er * 0.4);
      g.closePath();
      g.fill();
      g.beginPath();
      g.moveTo(hx + er * 0.18, hy - er * 0.4);
      g.lineTo(hx + er * 0.42, hy - er - 5 * k);
      g.lineTo(hx + er * 0.62, hy - er * 0.25);
      g.closePath();
      g.fill();
      g.globalAlpha = 1;
    }
  } else {
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
  }

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

  // whiskers (cats)
  if (isCat && !o.outline) {
    const wx = hx + b.headR * 0.15 + b.snout * 0.35;
    const wy = hy + b.headR * 0.2;
    g.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    g.lineWidth = 0.9;
    for (const [dx, dy] of [[-10, -3], [-11, 0], [-10, 3], [6, -3], [7, 0], [6, 3]] as const) {
      g.beginPath();
      g.moveTo(wx, wy);
      g.lineTo(wx + dx, wy + dy);
      g.stroke();
    }
  }

  // friendly eyes (no eyewear anywhere: Dan, 2026-10-08)
  paintEyes(g, hx, hy, b.headR, dark);

  if (o.noHelmet) return;
  if (suited) {
    // suit neck ring where the helmet locks on
    g.strokeStyle = '#c9d6ea';
    g.lineWidth = 2.4;
    g.beginPath();
    g.arc(hx + b.snout * 0.3, hy, hr, Math.PI * 0.55, Math.PI * 0.95);
    g.stroke();
  }
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

/**
 * Two friendly eyes on a head at (hx, hy) of radius r (shared by every animal). No eyewear: the
 * game dropped sunglasses entirely (Dan, 2026-10-08).
 */
function paintEyes(g: CanvasRenderingContext2D, hx: number, hy: number, r: number, ink = '#0a0018'): void {
  const er = Math.max(1.5, r * 0.2);
  for (const ex of [hx + r * 0.0, hx + r * 0.6]) {
    const ey = hy - r * 0.3;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(ex, ey, er, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = ink;
    g.beginPath();
    g.arc(ex + er * 0.3, ey + er * 0.1, er * 0.58, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255, 255, 255, 0.9)';
    g.beginPath();
    g.arc(ex + er * 0.45, ey - er * 0.2, Math.max(0.35, er * 0.2), 0, Math.PI * 2);
    g.fill();
  }
}

/** Space-helmet bubble rim + glint around (cx, cy). */
function paintHelmetRim(g: CanvasRenderingContext2D, cx: number, cy: number, hr: number, accent: string): void {
  g.strokeStyle = accent;
  g.globalAlpha = 0.75;
  g.lineWidth = 1.6;
  g.beginPath();
  g.arc(cx, cy, hr, 0, Math.PI * 2);
  g.stroke();
  g.globalAlpha = 0.6;
  g.strokeStyle = '#ffffff';
  g.lineWidth = 1.4;
  g.beginPath();
  g.arc(cx, cy, hr - 2.5, -Math.PI * 0.85, -Math.PI * 0.55);
  g.stroke();
  g.globalAlpha = 1;
}

/**
 * PLATYPUS MODE / MANATEE MODE animals, same frame as the dogs (facing right, centred, standard-ship
 * units, same body numbers so the size reads the same) with friendly eyes and a space helmet.
 * Platypus: flat beaver tail, webbed feet, a blue-grey duck bill. Manatee: round grey body,
 * paddle tail, little flippers and a big whiskery snout.
 */
function paintCritter(g: CanvasRenderingContext2D, b: Breed, o: ShipPaint): void {
  const accent = o.accent ?? '#00f0ff';
  const dark = '#0a0018';
  const L = b.bodyL;
  const H = Math.max(b.bodyH, 6);
  const bx = -4;
  const by = 2;
  const out = !!o.outline;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  if (o.flame) {
    g.fillStyle = 'rgba(0, 255, 255, 0.45)';
    g.beginPath();
    g.moveTo(bx - L + 1, by - 4);
    g.lineTo(bx - L - 16, by);
    g.lineTo(bx - L + 1, by + 4);
    g.closePath();
    g.fill();
  }
  const furFill = (x0: number, x1: number): string | CanvasGradient => {
    if (out) return dark;
    const gr = g.createLinearGradient(x0, 0, x1, 0);
    gr.addColorStop(0, shade(b.fur, -0.3));
    gr.addColorStop(0.6, b.fur);
    gr.addColorStop(1, shade(b.fur, 0.12));
    return gr;
  };
  const edge = (): void => {
    if (!out) return;
    g.strokeStyle = accent;
    g.lineWidth = 1.6;
    g.stroke();
  };
  let hx: number;
  let hy: number;
  let hr: number;
  let r: number;
  if (b.species === 'platypus') {
    r = Math.max(5.5, b.headR * 0.9);
    hx = bx + L * 0.95;
    hy = by - H * 0.35;
    // flat beaver tail
    g.fillStyle = out ? dark : shade(b.fur, -0.35);
    g.beginPath();
    g.ellipse(bx - L - 5, by + 0.5, 8, 3.6, -0.12, 0, Math.PI * 2);
    g.fill();
    edge();
    if (!out) {
      g.strokeStyle = shade(b.fur, -0.5);
      g.lineWidth = 0.6;
      for (const dx of [-3, 0, 3]) {
        g.beginPath();
        g.moveTo(bx - L - 5 + dx, by - 2);
        g.lineTo(bx - L - 5 + dx, by + 3);
        g.stroke();
      }
    }
    // webbed feet
    g.fillStyle = out ? dark : b.fur2;
    for (const fx of [bx - L * 0.55, bx + L * 0.55]) {
      g.beginPath();
      g.moveTo(fx - 1.5, by + H * 0.7);
      g.lineTo(fx - 4, by + H + 4);
      g.lineTo(fx + 4, by + H + 4);
      g.lineTo(fx + 1.5, by + H * 0.7);
      g.closePath();
      g.fill();
      edge();
    }
    // body
    g.fillStyle = furFill(bx - L, bx + L);
    rr(g, bx - L, by - H, L * 2, H * 2, H);
    g.fill();
    edge();
    if (!out) {
      g.fillStyle = shade(b.fur, 0.35);
      g.globalAlpha = 0.55;
      rr(g, bx - L * 0.6, by + H * 0.1, L * 1.3, H * 0.75, H * 0.4);
      g.fill();
      g.globalAlpha = 1;
    }
    hr = r + 9;
    if (!o.noHelmet) {
      g.fillStyle = 'rgba(180, 240, 255, 0.14)';
      g.beginPath();
      g.arc(hx + 3, hy, hr, 0, Math.PI * 2);
      g.fill();
    }
    // head + bill
    g.fillStyle = furFill(hx - r, hx + r);
    g.beginPath();
    g.arc(hx, hy, r, 0, Math.PI * 2);
    g.fill();
    edge();
    g.fillStyle = out ? dark : b.fur2;
    rr(g, hx + r * 0.45, hy - r * 0.05, r * 0.8 + 6, r * 0.62, r * 0.31);
    g.fill();
    edge();
    if (!out) {
      g.fillStyle = shade(b.fur2, -0.4);
      g.beginPath();
      g.arc(hx + r * 1.05 + 4, hy + r * 0.12, 0.8, 0, Math.PI * 2);
      g.arc(hx + r * 1.05 + 2, hy + r * 0.12, 0.8, 0, Math.PI * 2);
      g.fill();
    }
    paintEyes(g, hx - 1, hy - 0.5, r);
    if (!o.noHelmet) paintHelmetRim(g, hx + 3, hy, hr, accent);
    return;
  }
  // manatee
  r = Math.max(6, b.headR);
  hx = bx + L * 0.9;
  hy = by - H * 0.25;
  // paddle tail
  g.fillStyle = out ? dark : shade(b.fur, -0.2);
  g.beginPath();
  g.ellipse(bx - L - 4, by + 0.5, Math.max(4.5, H * 0.7), Math.max(5, H * 0.95), 0, 0, Math.PI * 2);
  g.fill();
  edge();
  // body (big and round)
  g.fillStyle = furFill(bx - L, bx + L);
  g.beginPath();
  g.ellipse(bx, by, L * 1.02, H * 1.18, 0, 0, Math.PI * 2);
  g.fill();
  edge();
  if (!out) {
    // gentle wrinkles + lighter belly
    g.strokeStyle = shade(b.fur, -0.2);
    g.lineWidth = 0.7;
    for (const dx of [-0.45, -0.15]) {
      g.beginPath();
      g.arc(bx + L * dx, by, H * 0.9, -0.5, 0.5);
      g.stroke();
    }
    g.fillStyle = b.fur2;
    g.globalAlpha = 0.45;
    g.beginPath();
    g.ellipse(bx + L * 0.1, by + H * 0.55, L * 0.7, H * 0.45, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
  }
  // flipper
  g.fillStyle = out ? dark : shade(b.fur, -0.15);
  g.beginPath();
  g.ellipse(bx + L * 0.4, by + H * 0.95, 4.5, 2.4, 0.6, 0, Math.PI * 2);
  g.fill();
  edge();
  hr = r + 8;
  if (!o.noHelmet) {
    g.fillStyle = 'rgba(180, 240, 255, 0.14)';
    g.beginPath();
    g.arc(hx + 3, hy, hr, 0, Math.PI * 2);
    g.fill();
  }
  // head + whiskery snout
  g.fillStyle = furFill(hx - r, hx + r);
  g.beginPath();
  g.arc(hx, hy, r, 0, Math.PI * 2);
  g.fill();
  edge();
  g.fillStyle = out ? dark : b.fur2;
  g.beginPath();
  g.ellipse(hx + r * 0.8, hy + r * 0.3, r * 0.62, r * 0.5, 0, 0, Math.PI * 2);
  g.fill();
  edge();
  if (!out) {
    g.fillStyle = shade(b.fur2, -0.45);
    for (const [dx, dy] of [[0.6, 0.25], [0.85, 0.42], [1.0, 0.2], [0.7, 0.5]] as const) {
      g.beginPath();
      g.arc(hx + r * dx, hy + r * dy, 0.55, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = dark;
    g.beginPath();
    g.arc(hx + r * 1.25, hy + r * 0.12, 0.9, 0, Math.PI * 2);
    g.fill();
  }
  paintEyes(g, hx - 1.5, hy - 0.5, r);
  if (!o.noHelmet) paintHelmetRim(g, hx + 3, hy, hr, accent);
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
  const key = `${b.id}|${o.lens ?? ''}|${o.accent ?? ''}|${o.outline ? 1 : 0}|${o.flame ? 1 : 0}|${o.noSuit ? 1 : 0}|${o.noHelmet ? 1 : 0}|${o.earK ?? 1}`;
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

/**
 * Minimal flying-dog glyph for swarm dogs too small for the full sprite (about 0.05-0.15x):
 * a pixel silhouette (head + pointed ear + snout, body, legs, raised tail) in the breed's
 * fur with a darker head/ear and a dark rim, facing right like the sprite. Pre-rendered once
 * per breed and stamped with one drawImage each.
 */
const GLYPH = [
  '..........#.....',
  '.........##.....',
  '#.......####....',
  '.#......######..',
  '.##########.....',
  '..#########.....',
  '..#########.....',
  '..#.#....#.#....',
  '..#.#....#.#....',
];
/** Pointed-ear cat silhouette (same footprint as GLYPH). */
const CAT_GLYPH = [
  '.........#.#....',
  '........#####...',
  '#......#######..',
  '.#.....########.',
  '.##########.....',
  '..#########.....',
  '..#########.....',
  '..#.#....#.#....',
  '..#.#....#.#....',
];
/** Platypus: flat tail, round body, duck bill. */
const PLATYPUS_GLYPH = [
  '................',
  '..........###...',
  '.........#####..',
  '###......#######',
  '############....',
  '.##########.....',
  '..#########.....',
  '..##.....##.....',
  '................',
];
/** Manatee: paddle tail, big round body, snout. */
const MANATEE_GLYPH = [
  '................',
  '.....######.....',
  '##..#########...',
  '###############.',
  '###############.',
  '##.###########..',
  '.....#######....',
  '.......#........',
  '................',
];
/** Glyph box in glyph px; the dog's body centre is at (GLYPH_AX, GLYPH_AY). */
export const GLYPH_W = 16;
export const GLYPH_H = 9;
export const GLYPH_AX = 7;
export const GLYPH_AY = 5;
const glyphCache = new Map<string, HTMLCanvasElement>();
const GLYPH_K = 4; // supersample
const GLYPH_PAD = 1;
const glyphCell = (rows: readonly string[], x: number, y: number) => rows[y]?.[x] === '#';

function glyphCanvas(): [HTMLCanvasElement, CanvasRenderingContext2D | null] {
  const c = document.createElement('canvas');
  c.width = (GLYPH_W + GLYPH_PAD * 2) * GLYPH_K;
  c.height = (GLYPH_H + GLYPH_PAD * 2) * GLYPH_K;
  return [c, c.getContext('2d')];
}

/**
 * The glyph for breed `b`: fur, darker head, eye, and a light dark rim (alpha 0.5, so dense
 * swarms where rims overlap fills stay colourful rather than going dark). One drawImage per pet.
 */
export function dogGlyph(b: Breed): HTMLCanvasElement {
  const hit = glyphCache.get(b.id);
  if (hit) return hit;
  const rows = b.species === 'cat' ? CAT_GLYPH : b.species === 'platypus' ? PLATYPUS_GLYPH : b.species === 'manatee' ? MANATEE_GLYPH : GLYPH;
  const [c, g] = glyphCanvas();
  if (g) {
    const k = GLYPH_K;
    g.fillStyle = 'rgba(10, 0, 24, 0.5)';
    for (let y = -1; y <= GLYPH_H; y++) {
      for (let x = -1; x <= GLYPH_W; x++) {
        if (glyphCell(rows, x, y)) continue;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1 && !near; dx++) near = glyphCell(rows, x + dx, y + dy);
        if (near) g.fillRect((x + GLYPH_PAD) * k, (y + GLYPH_PAD) * k, k, k);
      }
    }
    for (let y = 0; y < GLYPH_H; y++) {
      for (let x = 0; x < GLYPH_W; x++) {
        if (!glyphCell(rows, x, y)) continue;
        // Head / ear / snout (x >= 8, top rows) in the second fur colour, the rest in the main fur.
        g.fillStyle = x >= 8 && y <= 3 ? b.fur2 : b.fur;
        g.fillRect((x + GLYPH_PAD) * k, (y + GLYPH_PAD) * k, k, k);
      }
    }
    // Eye.
    g.fillStyle = '#0a0018';
    g.fillRect((11 + GLYPH_PAD) * k, (2 + GLYPH_PAD) * k + 1, k - 1, k - 1);
  }
  glyphCache.set(b.id, c);
  return c;
}

/**
 * Fan modes (menu: MODES). Plain-text names only: fan nods, not affiliated with or
 * endorsed by anyone named. Every mode plays the normal game (30 s stages, the level
 * curve, the clone-mode swarm code); what changes is the player's swarm.
 *
 * Size rule: a mode's whole swarm has the area of 10 standard ships, so each of its
 * N ships is drawn and collides at linear scale sqrt(10 / N). Sizes are set when the
 * run starts; losing ships never grows the rest. THE CALVIN TWINS stay 2 dogs all run; the
 * menu Easter egg swaps in THE CALVIN TRIPLETS (3 dogs). TOO FAT is deliberately exempt.
 */
import { BREEDS, PLAYER_BREED, breedById, randomBreed, type Breed } from '../render/shipSprite';

export type ModeBehavior = 'none' | 'mirror' | 'calvin' | 'decoy';
export type ModeStyle = 'solid' | 'outline' | 'dot';

export interface ModeDef {
  id: string;
  name: string;
  ships: number;
  /** Linear scale of every ship vs the standard ship (sprite and hitbox). */
  scale: number;
  /** Ship tint, from the game's existing palette. */
  tint: string;
  style: ModeStyle;
  behavior: ModeBehavior;
  /** Formation spacing multiplier (1 = ships just clear each other; < 1 overlaps). */
  spacing: number;
}

/** Linear scale for N ships under the total-area-of-10 rule. */
export const areaTenScale = (n: number): number => Math.sqrt(10 / n);

export const MODES: readonly ModeDef[] = [
  { id: 'alw', name: 'ANDREW LLOYD WEBBER', ships: 239, scale: areaTenScale(239), tint: '#9b5cff', style: 'solid', behavior: 'none', spacing: 1 },
  { id: 'toosuccessful', name: 'TOO SUCCESSFUL', ships: 57, scale: areaTenScale(57), tint: '#ffe66d', style: 'solid', behavior: 'none', spacing: 1 },
  { id: 'daly', name: 'THE ANDY DALY PODCAST SHOW TRYOUT', ships: 44, scale: areaTenScale(44), tint: '#ff6b35', style: 'solid', behavior: 'none', spacing: 1 },
  // TOO FAT is deliberately EXEMPT from the total-area-of-10 rule: 16 ships at 2.0x
  // width and height (~4x area each, ~64 standard ships in total). Its formation is
  // tightened (ships overlap) so 16 of them still fit a portrait phone.
  { id: 'toofat', name: 'TOO FAT', ships: 16, scale: 2.0, tint: '#ff7ad9', style: 'solid', behavior: 'none', spacing: 0.62 },
  { id: 'mantzoukas', name: 'ADJACENT MANTZOUKAS', ships: 2, scale: areaTenScale(2), tint: '#00f0ff', style: 'solid', behavior: 'mirror', spacing: 1 },
  { id: 'calvin', name: 'THE CALVIN TWINS', ships: 2, scale: areaTenScale(2), tint: '#ff2bd6', style: 'solid', behavior: 'calvin', spacing: 1 },
  { id: 'decoy', name: 'OPERATION DOUBLE DECOY', ships: 2, scale: areaTenScale(2), tint: '#ffffff', style: 'outline', behavior: 'decoy', spacing: 1 },
  { id: 'cbb', name: 'COMEDY BANG BANG', ships: 668, scale: areaTenScale(668), tint: '#ffaa44', style: 'solid', behavior: 'none', spacing: 1 },
  { id: 'slackerman', name: 'SNOT SLACKERMAN', ships: 447, scale: areaTenScale(447), tint: '#00ffdc', style: 'outline', behavior: 'none', spacing: 1 },
  { id: 'itm', name: 'ITM', ships: 3333, scale: areaTenScale(3333), tint: '#b4f0ff', style: 'dot', behavior: 'none', spacing: 1 },
  { id: 'dvorak', name: 'JOHN C DVORAK', ships: 888, scale: areaTenScale(888), tint: '#c020a0', style: 'solid', behavior: 'none', spacing: 1 },
  { id: 'curry', name: 'ADAM CURRY', ships: 777, scale: areaTenScale(777), tint: '#7fffff', style: 'solid', behavior: 'none', spacing: 1 },
];

/**
 * THE CALVIN TWINS' Easter egg variant: tap the entry again while it's selected in the MODES
 * menu to toggle THE CALVIN TRIPLETS (3 dogs, total area still 10 -> 1.826x each).
 */
export const CALVIN_TRIPLETS: ModeDef = {
  id: 'calvin3',
  name: 'THE CALVIN TRIPLETS',
  ships: 3,
  scale: areaTenScale(3),
  tint: '#ff2bd6',
  style: 'solid',
  behavior: 'calvin',
  spacing: 1,
};


export function modeById(id: string): ModeDef | null {
  return MODES.find((m) => m.id === id) ?? null;
}

/** TOO FAT leans large: mostly the big breeds, the odd medium one. */
const LARGE_MIX = ['mastiff', 'great-dane', 'german-shepherd-dog', 'labrador-retriever', 'mastiff', 'great-dane', 'border-collie'];
/** 2-3 ship modes are copies of one dog (near-copy, twins, decoy of you). */
const PAIR_BREED: Record<string, string> = { mirror: 'beagle', calvin: 'dachshund', decoy: 'german-shepherd-dog' };

/** Breeds for a mode's n ships (index 0 = the player's dog). Big swarms: every breed, then a random mix. */
export function modeBreeds(m: ModeDef, n: number): Breed[] {
  const out: Breed[] = [];
  const pair = PAIR_BREED[m.behavior];
  for (let i = 0; i < n; i++) {
    if (pair) out.push(breedById(pair));
    else if (m.id === 'toofat') out.push(breedById(LARGE_MIX[Math.floor(Math.random() * LARGE_MIX.length)]));
    else if (i === 0) out.push(PLAYER_BREED); // you stay the Border Collie in the crowd
    else if (i <= BREEDS.length) out.push(BREEDS[i - 1]); // every breed appears at least once
    else out.push(randomBreed());
  }
  return out;
}

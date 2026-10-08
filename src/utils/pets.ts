/**
 * Three-way pet choice (MODES row + localStorage): dogs (default), cats, or
 * "Cats and dogs getting along together". Gameplay hitboxes / scales / scoring
 * stay identical; only sprites, bark words, and player-facing copy change.
 */
import { loadCatSuit } from './storage';

export type PetChoice = 'dogs' | 'cats' | 'together';
/** Who is flying right now: the pet choice, or a story-mode run's animal (utils/campaign.ts). */
export type Species = PetChoice | 'platypus' | 'manatee';

const KEY = 'fsb_pet';

function isPet(v: unknown): v is PetChoice {
  return v === 'dogs' || v === 'cats' || v === 'together';
}

function detect(): PetChoice {
  try {
    const saved = localStorage.getItem(KEY);
    if (isPet(saved)) return saved;
  } catch {
    /* storage blocked */
  }
  return 'dogs';
}

let current: PetChoice = detect();
const listeners: ((p: Species) => void)[] = [];
/** A story-mode run's species (CAT MODE = 'together', PLATYPUS / MANATEE MODE); null otherwise. */
let runSpecies: Species | null = null;
/**
 * Cats need the CAT SPACE SUIT (beat dog mode first, utils/campaign.ts): until it's invented, a
 * saved Cats / Together pick flies as dogs (and the PETS row shows those two as locked).
 */
const catsAllowed = (): boolean => loadCatSuit();

/** The pet choice in effect outside story runs (cats only once the suit exists). */
export function petChoice(): PetChoice {
  return current !== 'dogs' && !catsAllowed() ? 'dogs' : current;
}

/** Who is flying: a story run's animal, else the pet choice. */
export function pet(): Species {
  return runSpecies ?? petChoice();
}

function notify(before: Species): void {
  const now = pet();
  if (now !== before) for (const cb of listeners) cb(now);
}

/** Story runs: fly as `s` until cleared (null). */
export function setRunSpecies(s: Species | null): void {
  const before = pet();
  runSpecies = s;
  notify(before);
}


export function setPet(p: PetChoice): void {
  try {
    localStorage.setItem(KEY, p);
  } catch {
    /* storage blocked */
  }
  if (p === current) return;
  const before = pet();
  current = p;
  notify(before);
}

export function onPet(cb: (p: Species) => void): void {
  listeners.push(cb);
}

/** FIRE / boss bark word. Together mode alternates WOOF and MEOW. */
export function barkWord(index = 0): string {
  const p = pet();
  if (p === 'cats') return 'MEOW';
  if (p === 'dogs') return 'WOOF';
  if (p === 'platypus') return 'QUACK';
  if (p === 'manatee') return 'MOO';
  return index % 2 === 0 ? 'WOOF' : 'MEOW';
}

export const PETS: { id: PetChoice; en: string }[] = [
  { id: 'dogs', en: 'Dogs' },
  { id: 'cats', en: 'Cats' },
  { id: 'together', en: 'Cats and dogs getting along together' },
];

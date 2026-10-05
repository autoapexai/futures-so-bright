/**
 * Three-way pet choice (MODES row + localStorage): dogs (default), cats, or
 * "Cats and dogs getting along together". Gameplay hitboxes / scales / scoring
 * stay identical; only sprites, bark words, and player-facing copy change.
 */
export type PetChoice = 'dogs' | 'cats' | 'together';

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
const listeners: ((p: PetChoice) => void)[] = [];

export function pet(): PetChoice {
  return current;
}

export function setPet(p: PetChoice): void {
  try {
    localStorage.setItem(KEY, p);
  } catch {
    /* storage blocked */
  }
  if (p === current) return;
  current = p;
  for (const cb of listeners) cb(p);
}

export function onPet(cb: (p: PetChoice) => void): void {
  listeners.push(cb);
}

/** FIRE / boss bark word. Together mode alternates WOOF and MEOW. */
export function barkWord(index = 0): string {
  if (current === 'cats') return 'MEOW';
  if (current === 'dogs') return 'WOOF';
  return index % 2 === 0 ? 'WOOF' : 'MEOW';
}

export const PETS: { id: PetChoice; en: string }[] = [
  { id: 'dogs', en: 'Dogs' },
  { id: 'cats', en: 'Cats' },
  { id: 'together', en: 'Cats and dogs getting along together' },
];

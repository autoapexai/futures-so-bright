/**
 * ONE BOARD, EVERY MODE (Dan, 2026-10-08): dog mode, CAT MODE (PART TWO), PLATYPUS MODE and
 * MANATEE MODE scores all share one leaderboard. Each row shows a short text mode label and that
 * mode's animal traits, grouped under the category name "pet food" (exact wording). There is no
 * mode selector / filter on the board. Labels and trait words are English in every language, like
 * every mode name. G-rated.
 *
 * Fan modes (ANDREW FLOYD WEBBER, TOO BIG, ...) are dog swarms, so their rows are DOG rows. The
 * vehicle modes keep their own boards (ON A MISSION's DEV BOARD, GHOST DUSTERS' local board).
 */
export type BoardMode = 'dog' | 'part2' | 'platypus' | 'manatee';

export const BOARD_MODES: readonly BoardMode[] = ['dog', 'part2', 'platypus', 'manatee'];

/** Short text label on each board row. */
export const MODE_LABEL: Record<BoardMode, string> = {
  dog: 'DOG',
  part2: 'PART TWO',
  platypus: 'PLATYPUS',
  manatee: 'MANATEE',
};

/** The category name the traits are grouped under, everywhere they appear. */
export const PET_FOOD = 'pet food';

/** Each mode's pet food: its food word, then its animal traits (short, G-rated). */
export const PET_FOOD_SETS: Record<BoardMode, { food: string; traits: readonly string[] }> = {
  dog: { food: 'dog food', traits: ['floppy ears', 'wagging tail', 'paws'] },
  part2: { food: 'cat food', traits: ['whiskers', 'pointy ears', 'paws'] },
  platypus: { food: 'platypus food', traits: ['duck bill', 'webbed feet', 'flat tail'] },
  manatee: { food: 'manatee food', traits: ['flippers', 'whiskers', 'paddle tail'] },
};

/**
 * Board mode for a stored / server mode id: the three story ids map to themselves; anything else
 * (null = plain dog mode, or a fan-mode id like 'toofat') is a dog-mode row.
 */
export function boardModeOf(raw: unknown): BoardMode {
  return raw === 'part2' || raw === 'platypus' || raw === 'manatee' ? raw : 'dog';
}

/** The trait words for a mode, joined: "dog food · floppy ears · wagging tail · paws". */
export function petFoodWords(m: BoardMode): string {
  const s = PET_FOOD_SETS[m];
  return [s.food, ...s.traits].join(' · ');
}

/** "pet food: dog food · floppy ears · wagging tail · paws" */
export function petFoodLine(m: BoardMode): string {
  return `${PET_FOOD}: ${petFoodWords(m)}`;
}

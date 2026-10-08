import { ALLOWED, chars } from './initials';

const HIGH_KEY = 'fsb-highscore-v1';
const BOARD_KEY = 'fsb-leaderboard-v1';
const HAND_KEY = 'futures-so-bright-hand';
const DIFFICULTY_KEY = 'fsb-difficulty-v1';
const CLAIMS_KEY = 'fsb-claims-v1';
const ELEVEN_KEY = 'fsb-eleven-v1';
const ELEVEN_REVEAL_KEY = 'fsb-eleven-reveal-v1';
const TUTORIAL_KEY = 'fsb-tutorial-done-v1';
const MAX_CLAIMS = 40;

export type HandPreference = 'left' | 'right';

export interface LeaderboardEntry {
  score: number;
  initials: string;
  /** 1-11; missing on old local entries (treated as 5). */
  difficulty?: number;
  /** The level the run began on (1-11); missing on old rows (shown as a dash). */
  start?: number;
}

const MAX_BOARD = 11;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function sanitizeInitials(raw: string): string {
  // Any character from the union of the language sets (A-Z, Ñ / accents, Vietnamese letters,
  // the curated Chinese characters, ★ and the emojis); counted in code points.
  const up = chars((raw || '').toUpperCase())
    .filter((c) => ALLOWED.has(c))
    .slice(0, 3)
    .join('');
  return up.length > 0 ? up : 'AAA';
}

/** Personal best on this device: max of the local board top and the stored best. */
export function loadHighScore(): number {
  try {
    const board = loadLeaderboard();
    const v = localStorage.getItem(HIGH_KEY);
    const stored = v ? Math.max(0, parseInt(v, 10) || 0) : 0;
    return Math.max(stored, board.length > 0 ? board[0].score : 0);
  } catch {
    return 0;
  }
}

export function saveHighScore(score: number): void {
  try {
    const prev = loadHighScore();
    if (score > prev) localStorage.setItem(HIGH_KEY, String(Math.floor(score)));
  } catch {
    /* ignore */
  }
}

function migrateOldHighScore(): LeaderboardEntry[] {
  try {
    const v = localStorage.getItem(HIGH_KEY);
    if (!v) return [];
    const score = Math.max(0, parseInt(v, 10) || 0);
    if (score <= 0) return [];
    return [{ score, initials: 'AAA' }];
  } catch {
    return [];
  }
}

function parseBoard(raw: string | null): LeaderboardEntry[] | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return null;
    const out: LeaderboardEntry[] = [];
    for (const item of data) {
      if (!item || typeof item !== 'object') continue;
      const score = Math.floor(Number((item as LeaderboardEntry).score));
      if (!Number.isFinite(score) || score < 0) continue;
      const initials = sanitizeInitials(String((item as LeaderboardEntry).initials ?? 'AAA'));
      const d = Math.round(Number((item as LeaderboardEntry).difficulty));
      const st = Math.round(Number((item as LeaderboardEntry).start));
      const e: LeaderboardEntry = d >= 1 && d <= 111 ? { score, initials, difficulty: d } : { score, initials };
      if (e.difficulty && st >= 1 && st <= e.difficulty) e.start = st;
      out.push(e);
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, MAX_BOARD);
  } catch {
    return null;
  }
}

export function loadLeaderboard(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(BOARD_KEY);
    const parsed = parseBoard(raw);
    if (parsed && parsed.length > 0) return parsed;
    if (raw === null) {
      // First load on this device: migrate a legacy single high score so old
      // records aren't lost, and write the board key (even if empty) so a
      // later personal best that skipped the board isn't re-migrated as "AAA".
      const migrated = migrateOldHighScore();
      saveLeaderboard(migrated);
      return migrated;
    }
    return parsed ?? [];
  } catch {
    return [];
  }
}

export function saveLeaderboard(entries: LeaderboardEntry[]): void {
  try {
    const cleaned = entries
      .map((e) => ({
        score: Math.floor(Math.max(0, e.score)),
        initials: sanitizeInitials(e.initials),
        ...(e.difficulty ? { difficulty: e.difficulty } : {}),
        ...(e.start ? { start: e.start } : {}),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_BOARD);
    localStorage.setItem(BOARD_KEY, JSON.stringify(cleaned));
    if (cleaned.length > 0) {
      // Only ever raise the personal best (a run can be a PB without making the shared board).
      const prev = Math.max(0, parseInt(localStorage.getItem(HIGH_KEY) ?? '0', 10) || 0);
      if (cleaned[0].score > prev) localStorage.setItem(HIGH_KEY, String(cleaned[0].score));
    }
  } catch {
    /* ignore */
  }
}

export function qualifiesForBoard(score: number, board?: LeaderboardEntry[]): boolean {
  const list = board ?? loadLeaderboard();
  const s = Math.floor(score);
  if (s <= 0) return false;
  if (list.length < MAX_BOARD) return true;
  return s > list[list.length - 1].score;
}

/** Insert entry, keep top 11 descending. Returns new board + index of inserted row (−1 if dropped). */
export function addEntry(
  score: number,
  initials: string,
  board?: LeaderboardEntry[],
  difficulty?: number,
  start?: number,
): { board: LeaderboardEntry[]; index: number } {
  const result = insertEntry(score, initials, board ?? loadLeaderboard(), difficulty, start);
  saveLeaderboard(result.board);
  return result;
}

/** Pure version of addEntry: insert into a copy of `board` without saving anything. */
export function insertEntry(
  score: number,
  initials: string,
  board: LeaderboardEntry[],
  difficulty?: number,
  start?: number,
): { board: LeaderboardEntry[]; index: number } {
  const list = [...board];
  const entry: LeaderboardEntry = {
    score: Math.floor(Math.max(0, score)),
    initials: sanitizeInitials(initials),
    ...(difficulty ? { difficulty } : {}),
    ...(difficulty && start && start <= difficulty ? { start } : {}),
  };
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const trimmed = list.slice(0, MAX_BOARD);
  // Prefer the first matching score+initials (newly inserted if tied).
  let index = -1;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i].score === entry.score && trimmed[i].initials === entry.initials) {
      index = i;
      break;
    }
  }
  return { board: trimmed, index };
}

export function nextLetter(ch: string, delta: number): string {
  const c = (ch || 'A').toUpperCase();
  const i = LETTERS.indexOf(c);
  const base = i >= 0 ? i : 0;
  const n = ((base + delta) % 26 + 26) % 26;
  return LETTERS[n];
}

export function loadHandPreference(): HandPreference {
  try {
    const v = localStorage.getItem(HAND_KEY);
    if (v === 'left' || v === 'right') return v;
  } catch {
    /* ignore */
  }
  return 'left';
}

export function saveHandPreference(hand: HandPreference): void {
  try {
    localStorage.setItem(HAND_KEY, hand);
  } catch {
    /* ignore */
  }
}

/** Apply hand preference as body classes for CSS layout. */
export function applyHandPreference(hand: HandPreference = loadHandPreference()): HandPreference {
  document.body.classList.toggle('hand-left', hand === 'left');
  document.body.classList.toggle('hand-right', hand === 'right');
  return hand;
}

/** Saved difficulty 1-11 (default 5). 11 is only honoured by the game while unlocked. */
export function loadDifficulty(): number {
  try {
    const n = parseInt(localStorage.getItem(DIFFICULTY_KEY) ?? '', 10);
    if (n >= 1 && n <= 11) return n;
  } catch {
    /* ignore */
  }
  return 1;
}

export function saveDifficulty(d: number): void {
  try {
    localStorage.setItem(DIFFICULTY_KEY, String(Math.min(11, Math.max(1, Math.round(d)))));
  } catch {
    /* ignore */
  }
}

/** Claim tokens returned by the server for this device's accepted scores (proof of #1). */
export function loadClaimTokens(): string[] {
  try {
    const data = JSON.parse(localStorage.getItem(CLAIMS_KEY) ?? '[]');
    return Array.isArray(data) ? data.filter((t) => typeof t === 'string' && /^[0-9a-f]{64}$/.test(t)) : [];
  } catch {
    return [];
  }
}

export function addClaimToken(token: string): void {
  if (!/^[0-9a-f]{64}$/.test(token)) return;
  try {
    const list = [token, ...loadClaimTokens().filter((t) => t !== token)].slice(0, MAX_CLAIMS);
    localStorage.setItem(CLAIMS_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/** Last known "this device holds #1" state (11 selectable). */
export function loadElevenUnlocked(): boolean {
  try {
    return localStorage.getItem(ELEVEN_KEY) === '1';
  } catch {
    return false;
  }
}

/** The 10 -> 11 reveal has been shown during the current #1 reign on this device. */
export function loadElevenRevealSeen(): boolean {
  try {
    return localStorage.getItem(ELEVEN_REVEAL_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveElevenRevealSeen(on: boolean): void {
  try {
    if (on) localStorage.setItem(ELEVEN_REVEAL_KEY, '1');
    else localStorage.removeItem(ELEVEN_REVEAL_KEY);
  } catch {
    /* ignore */
  }
}

export function saveElevenUnlocked(on: boolean): void {
  try {
    if (on) localStorage.setItem(ELEVEN_KEY, '1');
    else localStorage.removeItem(ELEVEN_KEY);
  } catch {
    /* ignore */
  }
}

/** The first-load How to Play walkthrough has been finished on this device. */
export function loadTutorialDone(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_KEY) === '1';
  } catch {
    return false;
  }
}
export function saveTutorialDone(): void {
  try {
    localStorage.setItem(TUTORIAL_KEY, '1');
  } catch {
    /* ignore */
  }
}

// --- ON A MISSION: best and board are kept apart from the normal ones (the unlock flag is legacy, unused) ---
const MISSION_UNLOCK_KEY = 'fsb_mission_unlocked';
const MISSION_HIGH_KEY = 'fsb_mission_high';
const MISSION_BOARD_KEY = 'fsb_mission_board';

/** This device tapped the MODES title 5 times (ON A MISSION + DEV BOARD showing). */
export function loadMissionUnlocked(): boolean {
  try {
    return localStorage.getItem(MISSION_UNLOCK_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMissionUnlocked(): void {
  try {
    localStorage.setItem(MISSION_UNLOCK_KEY, '1');
  } catch {
    /* ignore */
  }
}

/** ON A MISSION runs on this device (never mixed into the normal TOP 11 or personal best). */
export function loadMissionBoard(): LeaderboardEntry[] {
  try {
    return parseBoard(localStorage.getItem(MISSION_BOARD_KEY)) ?? [];
  } catch {
    return [];
  }
}

/** Best ON A MISSION score on this device (separate from the normal high score). */
export function loadMissionHigh(): number {
  try {
    const stored = Math.max(0, parseInt(localStorage.getItem(MISSION_HIGH_KEY) ?? '0', 10) || 0);
    const board = loadMissionBoard();
    return Math.max(stored, board.length > 0 ? board[0].score : 0);
  } catch {
    return 0;
  }
}

export function saveMissionHigh(score: number): void {
  try {
    if (score > loadMissionHigh()) localStorage.setItem(MISSION_HIGH_KEY, String(Math.floor(score)));
  } catch {
    /* ignore */
  }
}

/** Insert an ON A MISSION run into this device's mission board (top 11). */
export function addMissionEntry(score: number, initials: string, level?: number, start?: number): { board: LeaderboardEntry[]; index: number } {
  const result = insertEntry(score, initials, loadMissionBoard(), level, start);
  try {
    localStorage.setItem(MISSION_BOARD_KEY, JSON.stringify(result.board));
  } catch {
    /* ignore */
  }
  saveMissionHigh(score);
  return result;
}


// --- GHOST DUSTERS: own best and board (never mixed into the public TOP 11 or ON A MISSION DEV BOARD) ---
const GHOST_HIGH_KEY = 'fsb_ghost_high';
const GHOST_BOARD_KEY = 'fsb_ghost_board';

/** GHOST DUSTERS runs on this device. */
export function loadGhostBoard(): LeaderboardEntry[] {
  try {
    return parseBoard(localStorage.getItem(GHOST_BOARD_KEY)) ?? [];
  } catch {
    return [];
  }
}

/** Best GHOST DUSTERS score on this device. */
export function loadGhostHigh(): number {
  try {
    const stored = Math.max(0, parseInt(localStorage.getItem(GHOST_HIGH_KEY) ?? '0', 10) || 0);
    const board = loadGhostBoard();
    const top = board.length ? board[0].score : 0;
    return Math.max(stored, top);
  } catch {
    return 0;
  }
}

export function saveGhostHigh(score: number): void {
  try {
    if (score > loadGhostHigh()) localStorage.setItem(GHOST_HIGH_KEY, String(Math.floor(score)));
  } catch {
    /* storage blocked */
  }
}

/** Insert a GHOST DUSTERS run into this device's ghost board (top 11). */
export function addGhostEntry(score: number, initials: string, level?: number, start?: number): { board: LeaderboardEntry[]; index: number } {
  const result = insertEntry(score, initials, loadGhostBoard(), level, start);
  try {
    localStorage.setItem(GHOST_BOARD_KEY, JSON.stringify(result.board));
  } catch {
    /* storage blocked */
  }
  saveGhostHigh(score);
  return result;
}

// --- STORY PROGRESSION (utils/campaign.ts): unlocks + each story mode's own best and local board ---
/** Beat dog mode: the CAT SPACE SUIT is invented (CAT MODE / part two unlocked). */
const CAT_SUIT_KEY = 'fsb_cat_suit_v1';
/** Beat part two: PLATYPUS MODE and MANATEE MODE unlocked (together). */
const ANIMALS_KEY = 'fsb_animals_unlocked_v1';
/** The first-try "cats can't breathe up here" scene has been shown on this device. */
const CAT_TRIED_KEY = 'fsb_cat_tried_v1';

function flag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}
function setFlag(key: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(key, '1');
    else localStorage.removeItem(key);
  } catch {
    /* storage blocked */
  }
}

export const loadCatSuit = (): boolean => flag(CAT_SUIT_KEY);
export const saveCatSuit = (on = true): void => setFlag(CAT_SUIT_KEY, on);
export const loadAnimalsUnlocked = (): boolean => flag(ANIMALS_KEY);
export const saveAnimalsUnlocked = (on = true): void => setFlag(ANIMALS_KEY, on);
export const loadCatTried = (): boolean => flag(CAT_TRIED_KEY);
export const saveCatTried = (on = true): void => setFlag(CAT_TRIED_KEY, on);

/** Story-mode ids with their own best + board ('part2' = CAT MODE). */
export type StoryId = 'part2' | 'platypus' | 'manatee';
const storyHighKey = (id: StoryId): string => `fsb_${id}_high`;
const storyBoardKey = (id: StoryId): string => `fsb_${id}_board`;

/** This device's runs of one story mode (top 11; never the public board). */
export function loadStoryBoard(id: StoryId): LeaderboardEntry[] {
  try {
    return parseBoard(localStorage.getItem(storyBoardKey(id))) ?? [];
  } catch {
    return [];
  }
}

/** Best score of one story mode on this device (separate from the dog-mode high score). */
export function loadStoryHigh(id: StoryId): number {
  try {
    const stored = Math.max(0, parseInt(localStorage.getItem(storyHighKey(id)) ?? '0', 10) || 0);
    const board = loadStoryBoard(id);
    return Math.max(stored, board.length ? board[0].score : 0);
  } catch {
    return 0;
  }
}

export function saveStoryHigh(id: StoryId, score: number): void {
  try {
    if (score > loadStoryHigh(id)) localStorage.setItem(storyHighKey(id), String(Math.floor(score)));
  } catch {
    /* storage blocked */
  }
}

export function addStoryEntry(id: StoryId, score: number, initials: string, level?: number, start?: number): { board: LeaderboardEntry[]; index: number } {
  const result = insertEntry(score, initials, loadStoryBoard(id), level, start);
  try {
    localStorage.setItem(storyBoardKey(id), JSON.stringify(result.board));
  } catch {
    /* storage blocked */
  }
  saveStoryHigh(id, score);
  return result;
}

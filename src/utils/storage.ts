const HIGH_KEY = 'fsb-highscore-v1';
const BOARD_KEY = 'fsb-leaderboard-v1';
const HAND_KEY = 'futures-so-bright-hand';

export type HandPreference = 'left' | 'right';

export interface LeaderboardEntry {
  score: number;
  initials: string;
}

const MAX_BOARD = 10;
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function sanitizeInitials(raw: string): string {
  const up = (raw || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 3);
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
      out.push({ score, initials });
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

/** Insert entry, keep top 10 descending. Returns new board + index of inserted row (−1 if dropped). */
export function addEntry(
  score: number,
  initials: string,
  board?: LeaderboardEntry[],
): { board: LeaderboardEntry[]; index: number } {
  const result = insertEntry(score, initials, board ?? loadLeaderboard());
  saveLeaderboard(result.board);
  return result;
}

/** Pure version of addEntry: insert into a copy of `board` without saving anything. */
export function insertEntry(
  score: number,
  initials: string,
  board: LeaderboardEntry[],
): { board: LeaderboardEntry[]; index: number } {
  const list = [...board];
  const entry: LeaderboardEntry = {
    score: Math.floor(Math.max(0, score)),
    initials: sanitizeInitials(initials),
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
  return 'right';
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

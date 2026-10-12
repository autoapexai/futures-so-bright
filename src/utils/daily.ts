/**
 * DAILY CHALLENGE + STREAK: pure date / streak logic (local-only, no network).
 * One challenge per calendar day in America/Los_Angeles, resetting at midnight Pacific.
 * The twist is picked from the date alone, so every device gets the same one that day.
 * Every function takes the time as an argument (ms since epoch) so tests can mock the clock.
 */
import { mulberry32 } from './rng';

export const DAILY_TZ = 'America/Los_Angeles';
export const DAILY_KEY = 'fsb_daily_v1';

export type TwistId = 'double' | 'bowls' | 'bossrush' | 'slowmo' | 'holdfire' | 'tiny' | 'storm';

/** The twists. target = distance in metres (the HUD's m) to beat the day: about 2 minutes for a
 *  decent player (tuned with the dev bot, see tests/README-daily.md). */
export const TWISTS: readonly { id: TwistId; target: number }[] = [
  { id: 'double', target: 8000 },
  { id: 'bowls', target: 7500 },
  { id: 'bossrush', target: 7500 },
  { id: 'slowmo', target: 5000 },
  { id: 'holdfire', target: 10000 },
  { id: 'tiny', target: 7500 },
  { id: 'storm', target: 8000 },
];

let fmt: Intl.DateTimeFormat | null = null;

/** 'YYYY-MM-DD' of the Pacific calendar day containing nowMs. */
export function pacificDayKey(nowMs: number): string {
  fmt ??= new Intl.DateTimeFormat('en-CA', { timeZone: DAILY_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = fmt.formatToParts(new Date(nowMs));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Whole days since 1970-01-01 for a day key (calendar arithmetic, no time zone). */
export function dayNumber(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

/** Day key n days after (or before, n < 0) key. */
export function addDays(key: string, n: number): string {
  const t = new Date((dayNumber(key) + n) * 86400000);
  return t.toISOString().slice(0, 10);
}

/** The instant of the next midnight Pacific after nowMs (handles DST: 07:00 or 08:00 UTC). */
export function nextResetMs(nowMs: number): number {
  const tomorrow = addDays(pacificDayKey(nowMs), 1);
  const [y, m, d] = tomorrow.split('-').map(Number);
  for (const h of [7, 8]) {
    const t = Date.UTC(y, m - 1, d, h);
    if (pacificDayKey(t) === tomorrow && pacificDayKey(t - 1) !== tomorrow) return t;
  }
  // Unreachable for America/Los_Angeles; a safe fallback.
  return Date.UTC(y, m - 1, d, 8);
}

/** Deterministic twist for a day key (same everywhere). */
export function twistForDay(key: string): (typeof TWISTS)[number] {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  const r = mulberry32(h >>> 0);
  r();
  return TWISTS[Math.floor(r() * TWISTS.length) % TWISTS.length];
}

/** Seed for the day's run (same layout of the seeded parts on every device). */
export function daySeed(key: string): number {
  return (dayNumber(key) * 2654435761) >>> 0;
}

export interface DailyState {
  /** Pacific day keys on which the daily challenge was beaten (newest last, last 60 kept). */
  won: string[];
  /** Best streak ever. */
  best: number;
  /** Today's best score: only valid when day === today. */
  bestDay: string;
  bestScore: number;
}

export const emptyDaily = (): DailyState => ({ won: [], best: 0, bestDay: '', bestScore: 0 });

export function parseDaily(raw: string | null): DailyState {
  try {
    const d = JSON.parse(raw ?? '');
    if (!d || typeof d !== 'object') return emptyDaily();
    const won = Array.isArray(d.won) ? d.won.filter((k: unknown) => typeof k === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(k)) : [];
    return {
      won: [...new Set<string>(won)].sort().slice(-60),
      best: Math.max(0, Math.floor(Number(d.best) || 0)),
      bestDay: typeof d.bestDay === 'string' ? d.bestDay : '',
      bestScore: Math.max(0, Math.floor(Number(d.bestScore) || 0)),
    };
  } catch {
    return emptyDaily();
  }
}

/** Consecutive beaten days ending today, or ending yesterday if today isn't beaten yet. */
export function currentStreak(s: DailyState, today: string): number {
  const set = new Set(s.won);
  let day = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

export interface StreakInfo {
  streak: number;
  best: number;
  /** A streak existed but a full day was missed: show 'New streak starts today!'. */
  reset: boolean;
  doneToday: boolean;
  /** Last 7 days, oldest first, today last: true = beaten that day. */
  week: boolean[];
}

export function streakInfo(s: DailyState, today: string): StreakInfo {
  const streak = currentStreak(s, today);
  const doneToday = s.won.includes(today);
  const last = s.won.filter((k) => k < today).pop();
  const reset = streak === 0 && !!last && dayNumber(today) - dayNumber(last) >= 2;
  const set = new Set(s.won);
  const week = Array.from({ length: 7 }, (_, i) => set.has(addDays(today, i - 6)));
  return { streak, best: Math.max(s.best, streak), reset, doneToday, week };
}

/** Record today's win. Counts once per day: a second win the same day changes nothing. */
export function recordWin(s: DailyState, today: string): { state: DailyState; counted: boolean; streak: number } {
  if (s.won.includes(today)) return { state: s, counted: false, streak: currentStreak(s, today) };
  const won = [...s.won, today].sort().slice(-60);
  const next = { ...s, won };
  const streak = currentStreak(next, today);
  next.best = Math.max(next.best, streak);
  return { state: next, counted: true, streak };
}

/** Today's best score (resets each Pacific day). */
export function recordDailyScore(s: DailyState, today: string, score: number): { state: DailyState; newBest: boolean } {
  const prev = s.bestDay === today ? s.bestScore : 0;
  if (score <= prev) return { state: s, newBest: false };
  return { state: { ...s, bestDay: today, bestScore: Math.floor(score) }, newBest: true };
}

export const todaysBest = (s: DailyState, today: string): number => (s.bestDay === today ? s.bestScore : 0);

/** 'Xh Ym' (or 'Ym Zs' under an hour) until ms. */
export function countdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s % 60}s`;
}

export const STREAK_MILESTONES = [3, 5, 7, 10, 14, 21, 30, 50, 100];

/* ---------- RECENT WINS (last 5 on this device, 24 h) ---------- */

export const WINS_KEY = 'fsb_recent_wins_v1';
export const WIN_TTL_MS = 24 * 3600 * 1000;
export const WINS_MAX = 5;

export type WinKind = 'boss' | 'high' | 'daily' | 'streak';
export interface RecentWin {
  t: number;
  kind: WinKind;
  /** Boss name, score or streak length. */
  v?: string;
}

export function parseWins(raw: string | null, nowMs: number): RecentWin[] {
  try {
    const a = JSON.parse(raw ?? '[]');
    if (!Array.isArray(a)) return [];
    return a
      .filter((w) => w && typeof w.t === 'number' && ['boss', 'high', 'daily', 'streak'].includes(w.kind))
      .map((w) => ({ t: w.t, kind: w.kind as WinKind, ...(w.v != null ? { v: String(w.v).slice(0, 40) } : {}) }))
      .filter((w) => nowMs - w.t < WIN_TTL_MS && w.t <= nowMs + 60000)
      .sort((a, b) => b.t - a.t)
      .slice(0, WINS_MAX);
  } catch {
    return [];
  }
}

export function addWin(list: RecentWin[], w: RecentWin, nowMs: number): RecentWin[] {
  return [w, ...list].filter((x) => nowMs - x.t < WIN_TTL_MS).sort((a, b) => b.t - a.t).slice(0, WINS_MAX);
}

/* ---------- clock (test builds can move it) ---------- */
let clockOverride: (() => number) | null = null;
export function dailyNow(): number {
  return clockOverride ? clockOverride() : Date.now();
}
/** Test hook only: pin the daily clock (null = real time). */
export function setDailyClock(fn: (() => number) | null): void {
  clockOverride = fn;
}

/* ---------- storage ---------- */
export function loadDaily(): DailyState {
  try {
    return parseDaily(localStorage.getItem(DAILY_KEY));
  } catch {
    return emptyDaily();
  }
}
export function saveDaily(s: DailyState): void {
  try {
    localStorage.setItem(DAILY_KEY, JSON.stringify(s));
  } catch {
    /* private mode: today only */
  }
}
export function loadWins(nowMs: number): RecentWin[] {
  try {
    return parseWins(localStorage.getItem(WINS_KEY), nowMs);
  } catch {
    return [];
  }
}
export function saveWins(list: RecentWin[]): void {
  try {
    localStorage.setItem(WINS_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

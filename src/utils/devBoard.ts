/**
 * DEV BOARD: the ON A MISSION leaderboard (Supabase table fsb_dev_scores, RPCs fsb_dev_submit /
 * fsb_dev_top, see supabase/fsb_dev_scores.sql). Completely separate from the public board:
 * mission runs never call fsb_submit_score / fsb_start_run, and nothing here touches fsb_scores.
 * Same failure rule as the public board: every call resolves to null on any failure (offline,
 * timeout, table not created yet) and the game falls back to this device's mission board.
 */
import { isValidInitials, maskInitials } from './initials';
import type { LeaderboardEntry } from './storage';
import { SCORE_CAP } from './difficulty';
import { remoteEnabled, rpc } from './remoteBoard';
import { SPEED_DEFAULT, SPEED_ON_PUBLIC_BOARD, clampSpeed } from './speed';

export const DEV_BOARD_SIZE = 11;
const FETCH_TIMEOUT_MS = 2500;
const SUBMIT_TIMEOUT_MS = 4000;

function parseDevRows(data: unknown): { board: LeaderboardEntry[]; index: number } | null {
  if (!Array.isArray(data)) return null;
  const board: LeaderboardEntry[] = [];
  let index = -1;
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const r = row as { initials?: unknown; score?: unknown; level?: unknown; start_level?: unknown; is_new?: unknown };
    const score = Math.floor(Number(r.score));
    const rawIni = String(r.initials ?? '');
    // Union of the language sets (or the server's own *** mask); rude initials show as ***.
    if (!Number.isFinite(score) || score <= 0 || !(rawIni === '***' || isValidInitials(rawIni))) continue;
    const initials = maskInitials(rawIni);
    if (r.is_new === true && index < 0) index = board.length;
    const lvl = Math.round(Number(r.level));
    const e: LeaderboardEntry = lvl >= 1 && lvl <= 111 ? { score, initials, difficulty: lvl } : { score, initials };
    const st = r.start_level == null ? NaN : Math.round(Number(r.start_level));
    if (e.difficulty && st >= 1 && st <= e.difficulty) e.start = st;
    board.push(e);
    if (board.length >= DEV_BOARD_SIZE) break;
  }
  return { board, index };
}

/** DEV BOARD top 11, or null if unavailable. */
export async function fetchDevBoard(timeoutMs = FETCH_TIMEOUT_MS): Promise<LeaderboardEntry[] | null> {
  if (!remoteEnabled) return null;
  try {
    return parseDevRows(await rpc('fsb_dev_top', { p_limit: DEV_BOARD_SIZE }, timeoutMs))?.board ?? null;
  } catch (err) {
    console.warn('[dev board] fetch failed, using this device:', err);
    return null;
  }
}

/** Submit an ON A MISSION run to the DEV BOARD. Returns the new top 11 + the new row's index, or null. */
export async function submitDevScore(
  initials: string,
  score: number,
  runMs: number,
  level: number,
  startLevel: number | null,
  timeoutMs = SUBMIT_TIMEOUT_MS,
  speedTenths: number | null = null,
): Promise<{ board: LeaderboardEntry[]; index: number } | null> {
  if (!remoteEnabled) return null;
  try {
    const body: Record<string, unknown> = {
      p_initials: initials,
      p_score: Math.min(SCORE_CAP, Math.floor(score)),
      p_run_ms: Math.max(0, Math.round(runMs)),
      p_level: Math.max(1, Math.min(111, Math.round(level))),
    };
    if (startLevel && startLevel >= 1 && startLevel <= 10 && startLevel <= level) body.p_start = startLevel;
    // GAME SPEED: the run's top speed in tenths, only when it isn't 1.0 (fsb_dev_submit p_speed,
    // supabase/fsb_speed_scores.sql). A 1.0 run's body is exactly today's.
    if (SPEED_ON_PUBLIC_BOARD && speedTenths && clampSpeed(speedTenths) !== SPEED_DEFAULT) body.p_speed = clampSpeed(speedTenths);
    return parseDevRows(await rpc('fsb_dev_submit', body, timeoutMs));
  } catch (err) {
    console.warn('[dev board] submit failed, kept on this device:', err);
    return null;
  }
}

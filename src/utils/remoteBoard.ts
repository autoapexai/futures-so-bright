/**
 * Shared online leaderboard via Supabase PostgREST RPCs (no SDK).
 * Every call has a short timeout and resolves to null on any failure, so the
 * game can always fall back to the local board.
 */
import type { LeaderboardEntry } from './storage';
import { SCORE_CAP } from './difficulty';

const MAX_BOARD = 11;
const FETCH_TIMEOUT_MS = 2500;
const SUBMIT_TIMEOUT_MS = 4000;

const RAW_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
const BASE_URL = RAW_URL.replace(/\/+$/, '');
export const SUPABASE_BASE = BASE_URL;
export const SUPABASE_ANON = ANON_KEY;

/** True when a real URL + key are configured (not blank / placeholder). */
export const remoteEnabled: boolean =
  /^https?:\/\/[^/]+/.test(BASE_URL) && ANON_KEY.length > 20 && !/REPLACE|PLACEHOLDER|YOUR_/i.test(ANON_KEY);

export async function rpc(fn: string, body: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
  if (!remoteEnabled) throw new Error('remote leaderboard not configured');
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers: Record<string, string> = {
      apikey: ANON_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    // Legacy anon keys are JWTs and also go in Authorization; new sb_publishable_ keys must not.
    if (ANON_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${ANON_KEY}`;
    const res = await fetch(`${BASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: ctrl.signal,
      cache: 'no-store',
    });
    if (!res.ok) {
      let msg = '';
      try {
        msg = ((await res.json()) as { message?: string }).message ?? '';
      } catch {
        /* ignore */
      }
      throw new Error(`${fn} HTTP ${res.status} ${msg}`.trim());
    }
    return await res.json();
  } finally {
    window.clearTimeout(timer);
  }
}

function parseRows(data: unknown): { board: LeaderboardEntry[]; index: number; claimToken: string | null } | null {
  if (!Array.isArray(data)) return null;
  const board: LeaderboardEntry[] = [];
  let index = -1;
  let claimToken: string | null = null;
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const r = row as { initials?: unknown; score?: unknown; difficulty?: unknown; start_level?: unknown; is_new?: unknown; claim_token?: unknown };
    const score = Math.floor(Number(r.score));
    const initials = String(r.initials ?? '');
    if (!Number.isFinite(score) || score <= 0 || !/^[A-Z]{3}$/.test(initials)) continue;
    if (typeof r.claim_token === 'string' && /^[0-9a-f]{64}$/.test(r.claim_token)) claimToken = r.claim_token;
    if (r.is_new === true && index < 0) index = board.length;
    const d = Math.round(Number(r.difficulty));
    const e: LeaderboardEntry = d >= 1 && d <= 111 ? { score, initials, difficulty: d } : { score, initials };
    const st = r.start_level == null ? NaN : Math.round(Number(r.start_level));
    if (e.difficulty && st >= 1 && st <= e.difficulty) e.start = st;
    board.push(e);
    if (board.length >= MAX_BOARD) break;
  }
  return { board, index, claimToken };
}

/** Global top 11, or null if unavailable. */
export async function fetchRemoteBoard(timeoutMs = FETCH_TIMEOUT_MS): Promise<LeaderboardEntry[] | null> {
  if (!remoteEnabled) return null;
  try {
    return parseRows(await rpc('fsb_get_leaderboard', {}, timeoutMs))?.board ?? null;
  } catch (err) {
    console.warn('[leaderboard] fetch failed, using local board:', err);
    return null;
  }
}

/**
 * Submit a score. Returns the new global top 10, the index of the new row
 * (-1 if it didn't make the board) and the row's claim token, or null on any
 * failure (network, timeout, rejected, rate-limited). Difficulty 11 needs the
 * run ticket from startRemoteRun().
 */
export async function submitRemoteScore(
  initials: string,
  score: number,
  runMs: number,
  difficulty = 5,
  ticket: string | null = null,
  timeoutMs = SUBMIT_TIMEOUT_MS,
  endMode: string | null = null,
  modeCount = 1,
  startLevel: number | null = null,
): Promise<{ board: LeaderboardEntry[]; index: number; claimToken: string | null } | null> {
  if (!remoteEnabled) return null;
  try {
    const body: Record<string, unknown> = {
      p_initials: initials,
      p_score: Math.min(SCORE_CAP, Math.floor(score)),
      p_run_ms: Math.max(0, Math.round(runMs)),
      p_difficulty: difficulty,
    };
    if (ticket) body.p_ticket = ticket;
    // The mode the run ended on and how many modes it used (stored only; the board is unchanged).
    if (endMode) body.p_mode = endMode;
    body.p_modes = Math.max(1, Math.min(13, Math.floor(modeCount)));
    if (startLevel && startLevel >= 1 && startLevel <= 11 && startLevel <= difficulty) body.p_start = startLevel;
    const data = await rpc('fsb_submit_score', body, timeoutMs);
    return parseRows(data);
  } catch (err) {
    console.warn('[leaderboard] submit failed, using local board:', err);
    return null;
  }
}

/** Does one of this device's claim tokens own the current #1? null = unknown (offline / error). */
export async function amITop(tokens: string[], timeoutMs = FETCH_TIMEOUT_MS): Promise<boolean | null> {
  if (!remoteEnabled) return null;
  if (tokens.length === 0) return false;
  try {
    return (await rpc('fsb_am_i_top', { p_tokens: tokens }, timeoutMs)) === true;
  } catch (err) {
    console.warn('[leaderboard] #1 check failed:', err);
    return null;
  }
}

/**
 * Ask for a difficulty-11 run ticket (issued to any player; the server logs a level-11 'start').
 * elapsedMs: play time already in this run (a climb from level 1 reaching 11); the server dates
 * the ticket back by that much so the whole run's duration fits the ticket.
 * Returns the ticket, 'denied' if the server refused, or null on network failure.
 */
export async function startRemoteRun(tokens: string[], elapsedMs = 0, timeoutMs = SUBMIT_TIMEOUT_MS): Promise<string | 'denied' | null> {
  if (!remoteEnabled) return null;
  try {
    const body: Record<string, unknown> = { p_tokens: tokens, p_difficulty: 11 };
    if (elapsedMs > 0) body.p_elapsed_ms = Math.min(3300000, Math.ceil(elapsedMs));
    const t = await rpc('fsb_start_run', body, timeoutMs);
    return typeof t === 'string' && /^[0-9a-f]{64}$/.test(t) ? t : null;
  } catch (err) {
    console.warn('[leaderboard] difficulty 11 ticket refused:', err);
    return /HTTP 403/.test(String(err)) ? 'denied' : null;
  }
}

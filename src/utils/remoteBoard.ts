/**
 * Shared online leaderboard via Supabase PostgREST RPCs (no SDK).
 * Every call has a short timeout and resolves to null on any failure, so the
 * game can always fall back to the local board.
 */
import type { LeaderboardEntry } from './storage';

const MAX_BOARD = 10;
const FETCH_TIMEOUT_MS = 2500;
const SUBMIT_TIMEOUT_MS = 4000;

const RAW_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').trim();
const ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim();
const BASE_URL = RAW_URL.replace(/\/+$/, '');

/** True when a real URL + key are configured (not blank / placeholder). */
export const remoteEnabled: boolean =
  /^https?:\/\/[^/]+/.test(BASE_URL) && ANON_KEY.length > 20 && !/REPLACE|PLACEHOLDER|YOUR_/i.test(ANON_KEY);

async function rpc(fn: string, body: Record<string, unknown>, timeoutMs: number): Promise<unknown> {
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

function parseRows(data: unknown): { board: LeaderboardEntry[]; index: number } | null {
  if (!Array.isArray(data)) return null;
  const board: LeaderboardEntry[] = [];
  let index = -1;
  for (const row of data) {
    if (!row || typeof row !== 'object') continue;
    const r = row as { initials?: unknown; score?: unknown; is_new?: unknown };
    const score = Math.floor(Number(r.score));
    const initials = String(r.initials ?? '');
    if (!Number.isFinite(score) || score <= 0 || !/^[A-Z]{3}$/.test(initials)) continue;
    if (r.is_new === true && index < 0) index = board.length;
    board.push({ score, initials });
    if (board.length >= MAX_BOARD) break;
  }
  return { board, index };
}

/** Global top 10, or null if unavailable. */
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
 * Submit a score. Returns the new global top 10 and the index of the new row
 * (-1 if it didn't make the board), or null on any failure (network, timeout,
 * rejected, rate-limited).
 */
export async function submitRemoteScore(
  initials: string,
  score: number,
  runMs: number,
  timeoutMs = SUBMIT_TIMEOUT_MS,
): Promise<{ board: LeaderboardEntry[]; index: number } | null> {
  if (!remoteEnabled) return null;
  try {
    const data = await rpc(
      'fsb_submit_score',
      { p_initials: initials, p_score: Math.floor(score), p_run_ms: Math.max(0, Math.round(runMs)) },
      timeoutMs,
    );
    return parseRows(data);
  } catch (err) {
    console.warn('[leaderboard] submit failed, using local board:', err);
    return null;
  }
}

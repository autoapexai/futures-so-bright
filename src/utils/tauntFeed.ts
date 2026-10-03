/**
 * DESERT SEARCH PARTY REPORT: the cross-player broadcast for the desert-search taunts.
 *
 * SHIPS SWITCHED OFF (TAUNT_BROADCAST = false). Turning it on needs Mr. Dan's OK twice: to apply
 * supabase/fsb_taunt_feed.sql (a new fsb_taunt_feed table + two RPCs; nothing existing changes)
 * and to push. While it is false no request is ever made from this file.
 *
 * Anonymous by design: a report carries only the taunt's index into src/data/leaderboard-taunts.json
 * (no initials, names, score, id, device or free text). Other players see the taunt text from their
 * own bundled copy of the list, so nothing a player types can ever reach another player's screen.
 * Reports also respect ?notrack=1 (the analytics opt-out): opted-out devices never report.
 */
import { remoteEnabled, rpc } from './remoteBoard';

/** Master switch for the broadcast. false = no reports, no polling, no ticker. */
export const TAUNT_BROADCAST = false;

/** How often the title / game-over screens poll for new reports while the broadcast is on. */
export const FEED_POLL_MS = 20000;
const FEED_TIMEOUT_MS = 2500;
/** How many recent reports one poll reads (the RPC caps this server-side too). */
const FEED_LIMIT = 5;

export interface FeedItem {
  id: number;
  taunt: number;
}

// Test-only override (FSB_TEST=1 builds): exercises the broadcast path against mocked responses.
// In production builds __FSB_TEST__ is false, so this can never turn the broadcast on.
let testOn = false;
export function setBroadcastForTest(on: boolean): void {
  if (__FSB_TEST__) testOn = on;
}

/** Is the broadcast live in this build / session? */
export function broadcastOn(): boolean {
  return remoteEnabled && (TAUNT_BROADCAST || (__FSB_TEST__ && testOn));
}

function optedOut(): boolean {
  if (__FSB_TEST__ && testOn) return false;
  try {
    if (new URLSearchParams(window.location.search).get('notrack') === '1') return true;
    return localStorage.getItem('fsb_notrack') === '1';
  } catch {
    return true;
  }
}

/** Report one missed-board taunt by index. Returns the new feed row id, or null (off / failed). */
export async function reportTaunt(index: number, count: number): Promise<number | null> {
  if (!broadcastOn() || optedOut()) return null;
  if (!Number.isInteger(index) || index < 0 || index >= count) return null;
  try {
    const id = await rpc('fsb_taunt_report', { p_taunt: index }, FEED_TIMEOUT_MS);
    return typeof id === 'number' && Number.isInteger(id) && id > 0 ? id : null;
  } catch (err) {
    console.warn('[desert search] report skipped:', err);
    return null;
  }
}

/** The most recent reports, newest first (only well-formed rows). null when off or unreachable. */
export async function fetchRecentTaunts(count: number): Promise<FeedItem[] | null> {
  if (!broadcastOn()) return null;
  try {
    const data = await rpc('fsb_taunt_recent', { p_limit: FEED_LIMIT }, FEED_TIMEOUT_MS);
    if (!Array.isArray(data)) return null;
    const out: FeedItem[] = [];
    for (const row of data) {
      if (!row || typeof row !== 'object') continue;
      const r = row as { id?: unknown; taunt?: unknown };
      const id = Number(r.id);
      const taunt = Number(r.taunt);
      if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(taunt) || taunt < 0 || taunt >= count) continue;
      out.push({ id, taunt });
      if (out.length >= FEED_LIMIT) break;
    }
    return out.sort((a, b) => b.id - a.id);
  } catch (err) {
    console.warn('[desert search] feed unavailable:', err);
    return null;
  }
}

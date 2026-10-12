// Unit tests for src/utils/daily.ts with a mocked clock (every function takes the time).
// Run: node tests/run-daily-tests.mjs
import { pacificDayKey, nextResetMs, twistForDay, TWISTS, emptyDaily, recordWin, streakInfo, currentStreak, recordDailyScore, todaysBest, parseDaily, addDays, parseWins, addWin, WIN_TTL_MS, countdown } from '../src/utils/daily';

let pass = 0, fail = 0;
function t(name: string, fn: () => void) {
  try { fn(); pass++; console.log('ok  ', name); } catch (e) { fail++; console.log('FAIL', name, '\n     ', (e as Error).message); }
}
function eq<T>(a: T, b: T, msg = '') { const A = JSON.stringify(a), B = JSON.stringify(b); if (A !== B) throw new Error(`${msg} expected ${B} got ${A}`); }
const utc = (s: string) => Date.parse(s);

t('midnight Pacific rollover (PDT, UTC-7)', () => {
  eq(pacificDayKey(utc('2026-10-12T06:59:59Z')), '2026-10-11');
  eq(pacificDayKey(utc('2026-10-12T07:00:00Z')), '2026-10-12');
  eq(nextResetMs(utc('2026-10-11T12:00:00Z')), utc('2026-10-12T07:00:00Z'));
  eq(nextResetMs(utc('2026-10-12T06:59:59Z')), utc('2026-10-12T07:00:00Z'));
});
t('midnight Pacific rollover (PST, UTC-8)', () => {
  eq(pacificDayKey(utc('2026-12-01T07:59:59Z')), '2026-11-30');
  eq(pacificDayKey(utc('2026-12-01T08:00:00Z')), '2026-12-01');
  eq(nextResetMs(utc('2026-12-01T09:00:00Z')), utc('2026-12-02T08:00:00Z'));
});
t('DST ends (Nov 1 2026): 25-hour day, next reset at 08:00Z', () => {
  // Nov 1 starts at 07:00Z (still PDT) and Nov 2 starts at 08:00Z (PST).
  eq(pacificDayKey(utc('2026-11-01T07:00:00Z')), '2026-11-01');
  eq(nextResetMs(utc('2026-11-01T07:00:00Z')), utc('2026-11-02T08:00:00Z'));
  eq((utc('2026-11-02T08:00:00Z') - utc('2026-11-01T07:00:00Z')) / 3600000, 25);
});
t('DST starts (Mar 8 2026): 23-hour day, next reset at 07:00Z', () => {
  eq(pacificDayKey(utc('2026-03-08T08:00:00Z')), '2026-03-08');
  eq(nextResetMs(utc('2026-03-08T08:00:00Z')), utc('2026-03-09T07:00:00Z'));
});
t('addDays crosses months / years', () => {
  eq(addDays('2026-12-31', 1), '2027-01-01');
  eq(addDays('2026-03-01', -1), '2026-02-28');
});
t('twist is deterministic per day and varies across days', () => {
  eq(twistForDay('2026-10-12').id, twistForDay('2026-10-12').id);
  const seen = new Set<string>();
  for (let i = 0; i < 60; i++) seen.add(twistForDay(addDays('2026-10-01', i)).id);
  eq(seen.size, TWISTS.length, 'all twists appear within 60 days');
});
t('win counts once per day (double completion)', () => {
  let s = emptyDaily();
  const a = recordWin(s, '2026-10-12'); s = a.state;
  eq([a.counted, a.streak], [true, 1]);
  const b = recordWin(s, '2026-10-12');
  eq([b.counted, b.streak, b.state.won.length], [false, 1, 1]);
});
t('streak grows on consecutive days, survives until the day is over', () => {
  let s = emptyDaily();
  for (const d of ['2026-10-09', '2026-10-10', '2026-10-11']) s = recordWin(s, d).state;
  eq(currentStreak(s, '2026-10-11'), 3);
  // Next day, not played yet: streak still 3 (not reset until a full day is missed).
  const i = streakInfo(s, '2026-10-12');
  eq([i.streak, i.reset, i.doneToday], [3, false, false]);
  s = recordWin(s, '2026-10-12').state;
  eq(streakInfo(s, '2026-10-12').streak, 4);
  eq(s.best, 4);
});
t('missed a full day resets to 0 with the friendly message; best streak kept', () => {
  let s = emptyDaily();
  for (const d of ['2026-10-08', '2026-10-09', '2026-10-10']) s = recordWin(s, d).state;
  const i = streakInfo(s, '2026-10-12'); // 10-11 missed entirely
  eq([i.streak, i.reset, i.best], [0, true, 3]);
  s = recordWin(s, '2026-10-12').state;
  const j = streakInfo(s, '2026-10-12');
  eq([j.streak, j.reset, j.best], [1, false, 3]);
});
t('no reset message for a brand-new player', () => {
  eq(streakInfo(emptyDaily(), '2026-10-12').reset, false);
});
t('rollover at midnight Pacific with a mocked clock', () => {
  let s = emptyDaily();
  const lateNight = utc('2026-10-12T06:59:00Z'); // 11:59 pm Oct 11 Pacific
  s = recordWin(s, pacificDayKey(lateNight)).state;
  const justAfter = utc('2026-10-12T07:01:00Z'); // 12:01 am Oct 12 Pacific
  const day = pacificDayKey(justAfter);
  eq(day, '2026-10-12');
  eq([streakInfo(s, day).streak, streakInfo(s, day).doneToday], [1, false]);
  const r = recordWin(s, day);
  eq([r.counted, r.streak], [true, 2]);
});
t('7-day star row, oldest first, today last', () => {
  let s = emptyDaily();
  for (const d of ['2026-10-06', '2026-10-09', '2026-10-12']) s = recordWin(s, d).state;
  eq(streakInfo(s, '2026-10-12').week, [true, false, false, true, false, false, true]);
});
t("today's best resets each day", () => {
  let s = emptyDaily();
  s = recordDailyScore(s, '2026-10-11', 900).state;
  eq(todaysBest(s, '2026-10-11'), 900);
  eq(todaysBest(s, '2026-10-12'), 0);
  const r = recordDailyScore(s, '2026-10-12', 100);
  eq([r.newBest, todaysBest(r.state, '2026-10-12')], [true, 100]);
  eq(recordDailyScore(r.state, '2026-10-12', 50).newBest, false);
});
t('corrupt storage is safe', () => {
  eq(parseDaily('{nope'), emptyDaily());
  eq(parseDaily(JSON.stringify({ won: ['2026-10-12', 'x', 3, '2026-10-12'], best: 'a' })).won, ['2026-10-12']);
});
t('recent wins: newest first, max 5, expire after 24 h', () => {
  const now = utc('2026-10-12T12:00:00Z');
  let w = parseWins(null, now);
  for (let i = 0; i < 7; i++) w = addWin(w, { t: now - i * 1000, kind: 'boss', v: 'B' + i }, now);
  eq(w.length, 5); eq(w[0].v, 'B0');
  const later = now + WIN_TTL_MS + 1;
  eq(parseWins(JSON.stringify(w), later).length, 0);
  eq(parseWins(JSON.stringify(w), now + WIN_TTL_MS - 10000).length, 5);
});
t('countdown text', () => {
  eq(countdown(5 * 3600000 + 12 * 60000), '5h 12m');
  eq(countdown(61000), '1m 1s');
});
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) throw new Error('daily tests failed');

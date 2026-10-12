# Daily challenge tests

- `node tests/run-daily-tests.mjs`: unit tests for `src/utils/daily.ts` with a mocked clock
  (midnight Pacific rollover, both DST changes, a missed day, double completion on one day,
  the 7-day star row, today's best, recent-wins expiry).
- Dev-only hooks (FSB_TEST=1 builds): `__fsbTest.daily.setNow(ms)`, `.setWon([...days], best)`,
  `.start(twistId)`, `.nearGoal()`, `.addWin(kind, v, agoMs)`, `.finish()`, and `__fsbTest.bot(on, speedUp)`
  (a simple lane-dodging bot used to tune each twist's target to about 2 minutes).

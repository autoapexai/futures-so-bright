# GAME SPEED and the score server (APPLIED 2026-10-02, Pacific Time)

Status: `fsb_speed_scores.sql` was applied to project dcqpytggsoiyrdbewiwd on 2026-10-02 at
14:40 Pacific Time with Mr. Dan's OK (backup of the previous definitions:
`/workspace/fsb-phase2/backup-before-speed-scores.sql`). `fsb_speed_scores_rollback.sql` restores
them. The client now ships with `SPEED_ON_PUBLIC_BOARD = true`.

## What the live server checks today (read-only inspection, 2026-10-01 Pacific Time)

`fsb_submit_score` (public board), in order:
- initials `^[A-Z]{3}$`; score 1..777,777,777 (`fsb_score_cap()`); run_ms 1,000..10,800,000;
  difficulty 1..111; start level 1..11 (and <= difficulty).
- plausibility (run_ms is GAME time, from the client's `runTime`):
  `v_max = least(2*max(bound_d, m*p*bound_5) + 500, p*600*t + 2000) + 1,000,000 * bosses`,
  bosses = floor((level-1)/10) (+1 at 111). Score above `v_max` -> "score not plausible".
- level 11+: a single-use run ticket is required, and
  - run_ms <= wall time since the ticket was created + 5 s ("run longer than its ticket"),
  - run_ms >= (level-11)*30 s - 2 s,
  - wall time since the ticket was issued >= (level-11)*30 s - 5 s ("ticket too young"),
  - start level / ticket consistency.
- rate limit 5 submits per 10 minutes per client hash.

`fsb_dev_submit` (DEV BOARD, ON A MISSION): same plausibility, 30 s per level climbed (game
time), 5 per 10 minutes, no tickets. `fsb_start_run`: elapsed <= 3,300,000 ms. No triggers or RLS
policies on the score tables; the tables' CHECK constraints mirror the function ranges.

## Would a legit 11.1x run be rejected? Yes, for boss runs and level 11+ runs.

Local copy of the live functions (identical md5), scenarios from `/workspace/fsb-speed-sb/`:

| run | today | proposed, no p_speed | proposed + p_speed |
|---|---|---|---|
| A 11.1x L2, 6,764 pts / 48.8 s game | OK | OK | OK |
| B 1.0x L21, 2 bosses, 2.15M / 720 s | OK | OK | OK |
| C 11.1x L21, 2 bosses, 23.9M / 720 s game, 65 s wall | not plausible | not plausible | OK |
| D 11.1x L18 from 11, 315k / 240 s game, 40 s wall | longer than ticket | longer than ticket | OK |
| E 5.5x L11, 1 boss, 5.7M / 360 s game | not plausible | not plausible | OK (p_speed 55) |
| F cheat: 5.7M / 360 s claimed at 1.0 | not plausible | not plausible | not plausible |
| G dev 11.1x L21, 23.9M / 720 s | not plausible | not plausible | OK |
| H dev 11.1x L3, 4,567 / 73.9 s | OK | OK | OK |

p_speed 112 -> "speed must be 10-111". After the rollback both function bodies hash back to the
live md5s (fsb_submit_score a0a219d2..., fsb_dev_submit e91fc7bd...) and the ACLs match live.

## The proposal

`p_speed integer default null` (tenths, 10..111) on both functions; null = 1.0 = today's checks
exactly. With s = p_speed/10: `v_max = s * today's bound` (boss allowance included); the ticket
checks allow game time = (issued - created) + (now - issued) * s, and "ticket too young" uses
wall * s. Everything else is unchanged.

Before it was applied the client kept today's behaviour: `SPEED_ON_PUBLIC_BOARD = false` in
`src/utils/speed.ts`, so a run that ever ran above 1.0 stays on this device's board (no ticket,
no submit) and the request bodies are byte-for-byte today's. ON A MISSION still goes to the DEV
BOARD at any speed (today's body; a 11.1x boss run there would be rejected and kept on the device
until the migration is applied). After applying: set `SPEED_ON_PUBLIC_BOARD = true` and rebuild;
the client then sends `p_speed` (the run's top speed) only when it isn't 1.0.

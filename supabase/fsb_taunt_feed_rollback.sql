-- Future's So Bright: undo supabase/fsb_taunt_feed.sql (the DESERT SEARCH PARTY REPORT feed).
-- Drops exactly the three objects it created, by exact name. Dropping the table also drops its
-- identity sequence, index and constraint. Nothing else is touched (fsb_scores, fsb_dev_scores and
-- every other fsb_ object are unaffected). Discards only the (anonymous, 1-hour) feed rows.
-- Set TAUNT_BROADCAST back to false (src/utils/tauntFeed.ts) before or with this rollback.
--   /workspace/fsb-phase2/sbq.sh supabase/fsb_taunt_feed_rollback.sql
begin;
drop function if exists public.fsb_taunt_report(integer);
drop function if exists public.fsb_taunt_recent(integer);
drop table if exists public.fsb_taunt_feed;
commit;
notify pgrst, 'reload schema';

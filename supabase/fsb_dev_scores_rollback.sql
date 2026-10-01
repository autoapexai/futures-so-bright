-- Future's So Bright: undo supabase/fsb_dev_scores.sql (the ON A MISSION DEV BOARD).
-- Drops exactly the three objects it created, by exact name (never a pattern: the existing
-- helper fsb_device_label() also starts with "fsb_dev"). Dropping the table also drops its
-- identity sequence, indexes and constraints. Nothing else is touched; the public board
-- (fsb_scores and its RPCs) is unaffected. NOTE: this discards every DEV BOARD row.
--   /workspace/fsb-phase2/sbq.sh supabase/fsb_dev_scores_rollback.sql
begin;
drop function if exists public.fsb_dev_submit(text, integer, integer, integer, integer);
drop function if exists public.fsb_dev_top(integer);
drop table if exists public.fsb_dev_scores;
commit;
notify pgrst, 'reload schema';

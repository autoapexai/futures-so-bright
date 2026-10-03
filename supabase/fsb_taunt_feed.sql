-- =============================================================================
-- Future's So Bright: DESERT SEARCH PARTY REPORT feed (cross-player missed-board taunts)
--
-- STATUS: WRITTEN, NOT APPLIED. Needs Mr. Dan's OK before it is run, and the client switch
-- (TAUNT_BROADCAST in src/utils/tauntFeed.ts) stays false until then.
--
-- Only CREATES new fsb_taunt_ objects. Alters NO existing table, function, policy or grant:
-- fsb_scores, fsb_dev_scores and every existing fsb_ RPC are untouched.
-- Undo: supabase/fsb_taunt_feed_rollback.sql (drops exactly what this file adds).
-- Safe to re-run (create if not exists / create or replace; grants re-applied).
--
-- Apply (only with Mr. Dan's OK; same way the earlier fsb_ files were applied):
--   /workspace/fsb-phase2/sbq.sh supabase/fsb_taunt_feed.sql
--
-- Object (RLS on, no policies, no table / sequence grants to anon or authenticated):
--   public.fsb_taunt_feed   id, taunt (an index 0-99 into src/data/leaderboard-taunts.json), created_at.
--                           NOTHING ELSE: no initials, names, scores, IPs, hashes, devices or free
--                           text, so a report can never carry anything a player typed.
-- Functions (SECURITY DEFINER, search_path '', execute granted to anon / authenticated / service_role):
--   fsb_taunt_report(p_taunt)      validated insert; returns the new row id. Rate limit: at most
--                                  30 reports per rolling minute across ALL players (no per-player
--                                  limit, because that would mean storing something about the player).
--                                  Prunes rows older than 1 hour on every call (auto-expiry).
--   fsb_taunt_recent(p_limit = 5)  newest reports from the last 10 minutes (1-10 rows): id, taunt.
-- Worst case abuse: someone spends the global quota showing the game's own family-friendly list.
-- =============================================================================

begin;

create table if not exists public.fsb_taunt_feed (
  id         bigint generated always as identity primary key,
  taunt      smallint    not null,
  created_at timestamptz not null default now(),
  constraint fsb_taunt_feed_taunt_chk check (taunt >= 0 and taunt < 100)
);

comment on table public.fsb_taunt_feed is
  'Future''s So Bright DESERT SEARCH PARTY REPORT: anonymous missed-board taunt indexes (0-99) only. Write via fsb_taunt_report(), read via fsb_taunt_recent(). Rows expire after 1 hour.';

create index if not exists fsb_taunt_feed_created_idx on public.fsb_taunt_feed (created_at desc, id desc);

alter table public.fsb_taunt_feed enable row level security;
revoke all on table public.fsb_taunt_feed from public, anon, authenticated;
revoke all on sequence public.fsb_taunt_feed_id_seq from public, anon, authenticated;

-- --- Read: recent reports only ----------------------------------------------------

create or replace function public.fsb_taunt_recent(p_limit integer default 5)
returns table (id bigint, taunt integer)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, f.taunt::integer
  from public.fsb_taunt_feed f
  where f.created_at > now() - interval '10 minutes'
  order by f.created_at desc, f.id desc
  limit greatest(1, least(coalesce(p_limit, 5), 10));
$$;

comment on function public.fsb_taunt_recent(integer) is
  'Future''s So Bright DESERT SEARCH PARTY REPORT: newest anonymous taunt indexes from the last 10 minutes (1-10 rows).';

-- --- Write: one taunt index, globally rate-limited, prunes old rows ------------------

create or replace function public.fsb_taunt_report(p_taunt integer)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_recent integer;
  v_id     bigint;
begin
  if p_taunt is null or p_taunt < 0 or p_taunt >= 100 then
    raise exception using errcode = 'PT400', message = 'fsb: taunt index out of range';
  end if;

  -- One report at a time, so the global count below is exact.
  perform pg_advisory_xact_lock(hashtextextended('fsb_taunt_report', 0));

  -- Auto-expiry: nothing older than an hour is kept.
  delete from public.fsb_taunt_feed f where f.created_at < now() - interval '1 hour';

  select count(*) into v_recent
  from public.fsb_taunt_feed f
  where f.created_at > now() - interval '1 minute';
  if v_recent >= 30 then
    raise exception using errcode = 'PT429', message = 'fsb: the desert search party is busy, try again later';
  end if;

  insert into public.fsb_taunt_feed (taunt) values (p_taunt::smallint) returning id into v_id;
  return v_id;
end;
$$;

comment on function public.fsb_taunt_report(integer) is
  'Future''s So Bright DESERT SEARCH PARTY REPORT: store one anonymous taunt index (0-99). Max 30 per minute across all players; prunes rows older than 1 hour.';

-- --- Grants: only the two feed functions are callable by the API ----------------------

revoke all on function public.fsb_taunt_recent(integer) from public;
revoke all on function public.fsb_taunt_report(integer) from public;
grant execute on function public.fsb_taunt_recent(integer) to anon, authenticated, service_role;
grant execute on function public.fsb_taunt_report(integer) to anon, authenticated, service_role;

commit;

notify pgrst, 'reload schema';

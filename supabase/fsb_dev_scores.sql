-- =============================================================================
-- Future's So Bright: DEV BOARD for the hidden ON A MISSION mode (Supabase / Postgres)
--
-- Only CREATES new fsb_dev_ objects. Alters NO existing table, function, policy or grant:
-- the public board (fsb_scores, fsb_get_leaderboard, fsb_submit_score, fsb_start_run) is untouched.
-- Undo: supabase/fsb_dev_scores_rollback.sql (drops exactly what this file adds).
-- Safe to re-run (create if not exists / create or replace; grants re-applied).
--
-- Apply (same way every earlier fsb_ file was applied, Supabase Management API):
--   /workspace/fsb-phase2/sbq.sh supabase/fsb_dev_scores.sql
--   (POST https://api.supabase.com/v1/projects/<ref>/database/query {"query": "<this file>"})
--
-- Objects (RLS on, no policies, no table / sequence grants to anon or authenticated):
--   public.fsb_dev_scores      ON A MISSION runs only (the game has no accounts: "dev" = any
--                              ON A MISSION score). client_hash = sha256(pepper||ip), never the raw IP.
-- Functions (SECURITY DEFINER, execute granted to anon / authenticated / service_role):
--   fsb_dev_top(p_limit = 11)                          top N (1-11): initials, score, level, start_level
--   fsb_dev_submit(p_initials, p_score, p_run_ms, p_level, p_start = null)
--                                                      validated + rate-limited insert; returns the new
--                                                      top 11 with is_new on the new row
-- Uses (read-only, unchanged) the existing internal helpers public.fsb_client_hash() and
-- public.fsb_score_cap().
--
-- VALIDATION mirrors fsb_submit_score (supabase/fsb_l111.sql):
--   initials exactly 3 letters A-Z; 1 <= score <= fsb_score_cap() (777,777,777);
--   1 s <= run_ms <= 3 h; level (the level the run ENDED on) 1-111; start level null or 1-10
--   and <= level; the same play-points plausibility bound (difficulty factors of
--   least(level, 11), exponential bound for short runs, linear 600 * p per second for long ones,
--   + 1,000,000 per boss reachable by the ending level); at least 30 s of play per level climbed;
--   max 5 accepted submissions per client per rolling 10 minutes.
--   No run tickets (the public board's level 11+ tickets come from fsb_start_run, which a
--   mission run never calls): this is a dev board, so a determined cheater could post a
--   plausible fake score here, exactly as on any client-reported board. It can't reach fsb_scores.
-- =============================================================================

begin;

create table if not exists public.fsb_dev_scores (
  id          bigint generated always as identity primary key,
  initials    text        not null,
  score       integer     not null,
  run_ms      integer     not null,
  level       smallint    not null,
  start_level smallint,
  client_hash text        not null,
  created_at  timestamptz not null default now(),
  constraint fsb_dev_scores_initials_chk    check (initials ~ '^[A-Z]{3}$'),
  constraint fsb_dev_scores_score_chk       check (score >= 1 and score <= public.fsb_score_cap()),
  constraint fsb_dev_scores_run_ms_chk      check (run_ms >= 1000 and run_ms <= 10800000),
  constraint fsb_dev_scores_level_chk       check (level >= 1 and level <= 111),
  constraint fsb_dev_scores_start_level_chk check (start_level is null or (start_level >= 1 and start_level <= 10 and start_level <= level)),
  constraint fsb_dev_scores_client_hash_chk check (client_hash ~ '^[0-9a-f]{64}$')
);

comment on table public.fsb_dev_scores is
  'Future''s So Bright DEV BOARD: ON A MISSION (hidden mode) scores only, never shown on the public board. Write only via fsb_dev_submit(), read via fsb_dev_top(). client_hash = sha256(pepper||ip), never the raw IP.';

create index if not exists fsb_dev_scores_rank_idx
  on public.fsb_dev_scores (score desc, created_at asc, id asc);
create index if not exists fsb_dev_scores_client_idx
  on public.fsb_dev_scores (client_hash, created_at desc);

-- Lock the table down: RLS on, no policies, no grants to the API roles (Supabase's default
-- privileges would otherwise grant anon / authenticated on a new public table).
alter table public.fsb_dev_scores enable row level security;
revoke all on table public.fsb_dev_scores from public, anon, authenticated;
revoke all on sequence public.fsb_dev_scores_id_seq from public, anon, authenticated;

-- --- Read: top N ----------------------------------------------------------------

create or replace function public.fsb_dev_top(p_limit integer default 11)
returns table (initials text, score integer, level integer, start_level integer)
language sql
stable
security definer
set search_path = ''
as $$
  select s.initials, s.score, s.level::integer, s.start_level::integer
  from public.fsb_dev_scores s
  order by s.score desc, s.created_at asc, s.id asc
  limit least(greatest(coalesce(p_limit, 11), 1), 11);
$$;

comment on function public.fsb_dev_top(integer) is
  'Future''s So Bright DEV BOARD: top N (1-11) ON A MISSION scores (initials, score, level, start_level).';

-- --- Write: validated, plausibility-checked, rate-limited submit ------------------

create or replace function public.fsb_dev_submit(
  p_initials text,
  p_score    integer,
  p_run_ms   integer,
  p_level    integer,
  p_start    integer default null
)
returns table (initials text, score integer, level integer, start_level integer, is_new boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_hash    text;
  v_t       double precision;
  v_m       double precision;
  v_p       double precision;
  v_bound5  double precision;
  v_boundd  double precision;
  v_max     double precision;
  v_bosses  integer;
  v_recent  integer;
  v_id      bigint;
begin
  -- 1. Initials: exactly three uppercase A-Z letters.
  if p_initials is null or p_initials !~ '^[A-Z]{3}$' then
    raise exception using errcode = 'PT400', message = 'fsb: initials must be exactly 3 letters A-Z';
  end if;

  -- 2. Range checks.
  if p_score is null or p_score < 1 or p_score > public.fsb_score_cap() then
    raise exception using errcode = 'PT400', message = 'fsb: score out of range';
  end if;
  if p_run_ms is null or p_run_ms < 1000 or p_run_ms > 10800000 then
    raise exception using errcode = 'PT400', message = 'fsb: run duration out of range';
  end if;
  if p_level is null or p_level < 1 or p_level > 111 then
    raise exception using errcode = 'PT400', message = 'fsb: level must be 1-111';
  end if;
  -- ON A MISSION starts on the selected level 1-10 (never 11) and never above where it ended.
  if p_start is not null and (p_start < 1 or p_start > 10 or p_start > p_level) then
    raise exception using errcode = 'PT400', message = 'fsb: start level out of range';
  end if;

  -- 3. Plausibility: the same bound as fsb_submit_score (levels 12-111 use level 11's factors).
  v_m := (array[0.70, 0.775, 0.85, 0.925, 1.00, 1.09, 1.18, 1.27, 1.36, 1.45, 1.55])[least(p_level, 11)];
  v_p := (array[0.6, 0.7, 0.8, 0.9, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.5])[least(p_level, 11)];
  v_t := p_run_ms / 1000.0;
  v_bound5 := 3233.0 * (exp(0.01225 * v_t) - 1.0) + 149.0 * v_t;
  v_boundd := v_p * (0.12 * (240.0 * v_m + 90.0) / (0.01225 * v_m) * (exp(0.01225 * v_m * v_t) - 1.0) + 149.0 * v_t);
  v_bosses := (p_level - 1) / 10 + (case when p_level = 111 then 1 else 0 end);
  v_max := least(2.0 * greatest(v_boundd, v_m * v_p * v_bound5) + 500.0, v_p * 600.0 * v_t + 2000.0)
           + v_bosses * 1000000.0;
  if p_score > v_max then
    raise exception using errcode = 'PT400', message = 'fsb: score not plausible for run duration';
  end if;

  -- 4. Every level climbed is a 30 s stage: ending on level L from start S takes >= (L - S) * 30 s
  --    (2 s slack; an unknown start is taken as 10, the highest a mission run can start on).
  if p_run_ms < (p_level - coalesce(p_start, least(p_level, 10))) * 30000.0 - 2000.0 then
    raise exception using errcode = 'PT400', message = 'fsb: run too short for its level';
  end if;

  -- 5. Rate limit per client (hashed IP), max 5 per rolling 10 minutes.
  v_hash := public.fsb_client_hash();
  perform pg_advisory_xact_lock(hashtextextended('fsb_dev_submit:' || v_hash, 0));
  select count(*) into v_recent
  from public.fsb_dev_scores s
  where s.client_hash = v_hash
    and s.created_at > now() - interval '10 minutes';
  if v_recent >= 5 then
    raise exception using errcode = 'PT429', message = 'fsb: too many submissions, try again later';
  end if;

  -- 6. Insert.
  insert into public.fsb_dev_scores (initials, score, run_ms, level, start_level, client_hash)
  values (p_initials, p_score, p_run_ms, p_level, p_start, v_hash)
  returning id into v_id;

  -- 7. The new top 11; the new row carries is_new.
  return query
    select s.initials, s.score, s.level::integer, s.start_level::integer, (s.id = v_id)
    from public.fsb_dev_scores s
    order by s.score desc, s.created_at asc, s.id asc
    limit 11;
end;
$$;

comment on function public.fsb_dev_submit(text, integer, integer, integer, integer) is
  'Future''s So Bright DEV BOARD: submit an ON A MISSION score (3 A-Z initials, level 1-111, start 1-10, plausible for run_ms, max 5 per 10 min per client). Returns the new top 11.';

-- --- Grants: only the two DEV BOARD functions are callable by the API -------------

revoke all on function public.fsb_dev_top(integer) from public;
revoke all on function public.fsb_dev_submit(text, integer, integer, integer, integer) from public;
grant execute on function public.fsb_dev_top(integer) to anon, authenticated, service_role;
grant execute on function public.fsb_dev_submit(text, integer, integer, integer, integer) to anon, authenticated, service_role;

commit;

-- Ask PostgREST to pick up the new functions right away.
notify pgrst, 'reload schema';

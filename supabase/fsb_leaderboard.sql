-- =============================================================================
-- Future's So Bright: shared online leaderboard (Supabase / Postgres)
--
-- Only creates objects prefixed fsb_. Safe to re-run (idempotent).
-- Apply with the Supabase Management API:
--   POST https://api.supabase.com/v1/projects/<ref>/database/query  {"query": "<this file>"}
--
-- Objects:
--   public.fsb_scores            score rows (RLS on, no grants to anon/authenticated)
--   public.fsb_secrets           single-row random pepper for hashing client IPs (RLS on, no grants)
--   public.fsb_get_leaderboard() SECURITY DEFINER, top 10 (initials, score)
--   public.fsb_submit_score(p_initials, p_score, p_run_ms)
--                                SECURITY DEFINER, validated + rate-limited insert,
--                                returns the new top 10 (initials, score, is_new)
--
-- -----------------------------------------------------------------------------
-- ANTI-CHEAT: how the plausibility cap was derived (src/systems/Game.ts, src/entities/Obstacles.ts)
--
--   Per frame while playing (dt = simulated seconds, clamped to <= 0.05):
--     scrollSpeed = 240 + distance*0.035 + (boosting ? 90 : 0)
--     distance   += scrollSpeed * dt * 0.35
--     score      += scrollSpeed * dt * 0.12 + (boosting ? 12*dt : 0)
--   Collectibles (the only other score source): value 25 each, spawned every
--   rand(0.55, 1.2) s, 30% of spawns are a 3-pack.
--
--   Worst case (always boosting, a 3-pack every 0.55 s, every one collected):
--     scrollSpeed(t) = 330 * e^(k t),  k = 0.035 * 0.35 = 0.01225 /s
--     passive(t)     = (0.12*330/k) * (e^(k t) - 1) + 12 t  = 3233 (e^(k t) - 1) + 12 t
--     collect(t)     <= 3*25/0.55 = 136.4 pts/s
--     bound(t)       = 3233 (e^(0.01225 t) - 1) + 149 t        (t = run seconds)
--   A 1/240 s frame simulation of that worst case stays just under bound(t)
--   (e.g. 60 s: sim 12404 vs bound 12449; 180 s: 52773 vs 52911).
--
--   Accepted if  p_score <= 2 * bound(t) + 500   (2x headroom + 500 slack), e.g.
--     10 s -> 4323,  30 s -> 12312,  60 s -> 25399,  120 s -> 57916,  240 s -> 187864
--   The rate is not a single constant because speed (and so points/s) grows
--   exponentially with distance: ~40 pts/s at the start, ~1170 pts/s at 4 min.
--   p_run_ms is the client's *simulated* play time (sum of dt while playing;
--   pauses and hidden tabs excluded), which is exactly what the score integrates over.
--
--   Hard limits: 1 <= score <= 1,000,000 ; 1,000 <= run_ms <= 3,600,000 (1 h).
--   (Past ~4-5 min scroll speed exceeds ~6000 px/s; things skip past the
--   hitbox between frames, so collecting stops and the run ends in seconds.
--   Realistic ceilings are ~100k-200k, so 1M is a comfortable sanity cap.)
--
--   Rate limit: max 5 accepted submissions per client per rolling 10 minutes.
--   Client = sha256(pepper || ip), ip = cf-connecting-ip if present (set by
--   Cloudflare, not client-spoofable), else first entry of x-forwarded-for.
--   The raw IP is never stored.
--
--   Limitation: p_run_ms is client-reported, so a determined cheater can still
--   submit a plausible-but-fake score. These rules stop absurd scores and spam.
-- =============================================================================

begin;

-- --- Tables -------------------------------------------------------------------

create table if not exists public.fsb_scores (
  id          bigint generated always as identity primary key,
  initials    text        not null,
  score       integer     not null,
  run_ms      integer     not null,
  client_hash text        not null,
  created_at  timestamptz not null default now(),
  constraint fsb_scores_initials_chk    check (initials ~ '^[A-Z]{3}$'),
  constraint fsb_scores_score_chk       check (score >= 1 and score <= 1000000),
  constraint fsb_scores_run_ms_chk      check (run_ms >= 1000 and run_ms <= 3600000),
  constraint fsb_scores_client_hash_chk check (client_hash ~ '^[0-9a-f]{64}$')
);

comment on table public.fsb_scores is
  'Future''s So Bright leaderboard. Write only via fsb_submit_score(), read via fsb_get_leaderboard(). client_hash = sha256(pepper||ip), never the raw IP.';

create index if not exists fsb_scores_rank_idx
  on public.fsb_scores (score desc, created_at asc, id asc);
create index if not exists fsb_scores_client_idx
  on public.fsb_scores (client_hash, created_at desc);

create table if not exists public.fsb_secrets (
  id     integer primary key default 1,
  pepper text    not null,
  constraint fsb_secrets_single_row check (id = 1)
);

comment on table public.fsb_secrets is
  'Future''s So Bright: random pepper for hashing client IPs. Not readable by anon/authenticated.';

-- gen_random_uuid() is core Postgres (13+): ~244 random bits.
insert into public.fsb_secrets (id, pepper)
values (1, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (id) do nothing;

-- --- Lock the tables down: RLS on, no policies, no grants to API roles --------

alter table public.fsb_scores  enable row level security;
alter table public.fsb_secrets enable row level security;

revoke all on table public.fsb_scores  from public, anon, authenticated;
revoke all on table public.fsb_secrets from public, anon, authenticated;
revoke all on sequence public.fsb_scores_id_seq from public, anon, authenticated;

-- --- Read: top 10 -------------------------------------------------------------

create or replace function public.fsb_get_leaderboard()
returns table (initials text, score integer)
language sql
stable
security definer
set search_path = ''
as $$
  select s.initials, s.score
  from public.fsb_scores s
  order by s.score desc, s.created_at asc, s.id asc
  limit 10;
$$;

comment on function public.fsb_get_leaderboard() is
  'Future''s So Bright: global top 10 (initials, score).';

-- --- Write: validated, plausibility-checked, rate-limited submit --------------

create or replace function public.fsb_submit_score(p_initials text, p_score integer, p_run_ms integer)
returns table (initials text, score integer, is_new boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_headers json;
  v_ip      text;
  v_pepper  text;
  v_hash    text;
  v_t       double precision;
  v_max     double precision;
  v_recent  integer;
  v_id      bigint;
begin
  -- 1. Initials: exactly three uppercase A-Z letters.
  if p_initials is null or p_initials !~ '^[A-Z]{3}$' then
    raise exception using errcode = 'PT400', message = 'fsb: initials must be exactly 3 letters A-Z';
  end if;

  -- 2. Range checks.
  if p_score is null or p_score < 1 or p_score > 1000000 then
    raise exception using errcode = 'PT400', message = 'fsb: score out of range';
  end if;
  if p_run_ms is null or p_run_ms < 1000 or p_run_ms > 3600000 then
    raise exception using errcode = 'PT400', message = 'fsb: run duration out of range';
  end if;

  -- 3. Plausibility: score must be reachable in the reported play time.
  --    bound(t) = 3233*(e^(0.01225 t) - 1) + 149 t ; allowed = 2*bound + 500
  v_t   := p_run_ms / 1000.0;
  v_max := 2.0 * (3233.0 * (exp(0.01225 * v_t) - 1.0) + 149.0 * v_t) + 500.0;
  if p_score > v_max then
    raise exception using errcode = 'PT400', message = 'fsb: score not plausible for run duration';
  end if;

  -- 4. Rate limit per client (hashed IP), max 5 per rolling 10 minutes.
  v_headers := nullif(current_setting('request.headers', true), '')::json;
  v_ip := coalesce(
    nullif(btrim(v_headers ->> 'cf-connecting-ip'), ''),
    nullif(btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), ''),
    'unknown'
  );
  select sec.pepper into v_pepper from public.fsb_secrets sec where sec.id = 1;
  v_hash := encode(sha256(convert_to(coalesce(v_pepper, '') || '|' || v_ip, 'UTF8')), 'hex');

  -- Serialize concurrent submits from the same client so the count is exact.
  perform pg_advisory_xact_lock(hashtextextended('fsb_submit:' || v_hash, 0));

  select count(*) into v_recent
  from public.fsb_scores s
  where s.client_hash = v_hash
    and s.created_at > now() - interval '10 minutes';
  if v_recent >= 5 then
    raise exception using errcode = 'PT429', message = 'fsb: too many submissions, try again later';
  end if;

  -- 5. Insert and return the new top 10 (is_new marks the row just added).
  insert into public.fsb_scores (initials, score, run_ms, client_hash)
  values (p_initials, p_score, p_run_ms, v_hash)
  returning id into v_id;

  return query
    select s.initials, s.score, (s.id = v_id)
    from public.fsb_scores s
    order by s.score desc, s.created_at asc, s.id asc
    limit 10;
end;
$$;

comment on function public.fsb_submit_score(text, integer, integer) is
  'Future''s So Bright: submit a score (3 A-Z initials, plausible for run_ms, max 5 per 10 min per client). Returns the new top 10.';

-- --- Grants: only the two functions are callable by the public API -------------

revoke all on function public.fsb_get_leaderboard() from public;
revoke all on function public.fsb_submit_score(text, integer, integer) from public;
grant execute on function public.fsb_get_leaderboard() to anon, authenticated;
grant execute on function public.fsb_submit_score(text, integer, integer) to anon, authenticated;

commit;

-- Ask PostgREST to pick up the new functions right away.
notify pgrst, 'reload schema';

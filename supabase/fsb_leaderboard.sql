-- =============================================================================
-- Future's So Bright: shared online leaderboard (Supabase / Postgres)
--
-- Only creates objects prefixed fsb_. Safe to re-run (idempotent).
-- Apply with the Supabase Management API:
--   POST https://api.supabase.com/v1/projects/<ref>/database/query  {"query": "<this file>"}
--
-- Objects (all RLS on, no table grants to anon/authenticated):
--   public.fsb_scores            score rows (+ difficulty 1-11, claim_hash = sha256 of the row's claim token)
--   public.fsb_secrets           single-row random pepper for hashing client IPs
--   public.fsb_run_tickets       short-lived, single-use difficulty-11 run tickets (hashed)
--   public.fsb_events            alert log: 'start' / 'complete' (difficulty 11) and 'new_top' (1-10)
-- Functions (SECURITY DEFINER, execute granted to anon/authenticated):
--   fsb_get_leaderboard()                    top 10 (initials, score, difficulty)
--   fsb_submit_score(p_initials, p_score, p_run_ms, p_difficulty = 5, p_ticket = null)
--                                            validated + rate-limited insert; returns the new top 10
--                                            (initials, score, difficulty, is_new, claim_token on the new row only)
--   fsb_am_i_top(p_tokens text[])            true if one of the tokens owns the current #1 row
--   fsb_start_run(p_tokens text[], p_difficulty)
--                                            difficulty 11 only: issues a 1-hour single-use ticket to the current #1
-- Internal (no grants): fsb_device_label(ua), fsb_top_id()
--
-- DIFFICULTY (must match src/utils/difficulty.ts):
--   d:        1     2     3     4     5    6    7    8    9    10   11
--   speed:  0.70 0.775 0.85 0.925 1.00 1.09 1.18 1.27 1.36 1.45 1.55   (base scroll speed + speed ramp)
--   points: 0.6   0.7   0.8   0.9   1.0  1.2  1.4  1.6  1.8  2.0  2.5   (applied to every point earned)
--   Difficulty 5 is exactly the original game.
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
--   With difficulty (speed factor m, point multiplier P) the same derivation gives
--     bound_d(t) = P * [ 0.12*(240m + 90)/(0.01225 m) * (e^(0.01225 m t) - 1) + 149 t ]
--   and the cap is  2 * max(bound_d(t), m*P*bound(t)) + 500  (the second term is the plain
--   "scale by speed x points" rule; the first is the exact bound, larger for long runs at m > 1).
--   At difficulty 5 (m = P = 1) both reduce to the original rule below.
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
--   Rate limit: max 5 accepted submissions per client per rolling 10 minutes
--   (and max 20 difficulty-11 tickets per client per 10 minutes).
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

alter table public.fsb_scores add column if not exists difficulty integer not null default 5;
alter table public.fsb_scores add column if not exists claim_hash text;
alter table public.fsb_scores drop constraint if exists fsb_scores_difficulty_chk;
alter table public.fsb_scores add constraint fsb_scores_difficulty_chk check (difficulty between 1 and 11);
alter table public.fsb_scores drop constraint if exists fsb_scores_claim_hash_chk;
alter table public.fsb_scores add constraint fsb_scores_claim_hash_chk check (claim_hash is null or claim_hash ~ '^[0-9a-f]{64}$');

comment on table public.fsb_scores is
  'Future''s So Bright leaderboard. Write only via fsb_submit_score(), read via fsb_get_leaderboard(). client_hash = sha256(pepper||ip), never the raw IP. claim_hash = sha256 of the row''s claim token (raw token only ever returned to the submitting client).';

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

create table if not exists public.fsb_run_tickets (
  id          bigint generated always as identity primary key,
  ticket_hash text        not null unique,
  difficulty  integer     not null,
  client_hash text        not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  constraint fsb_run_tickets_hash_chk check (ticket_hash ~ '^[0-9a-f]{64}$'),
  constraint fsb_run_tickets_difficulty_chk check (difficulty = 11)
);
create index if not exists fsb_run_tickets_client_idx
  on public.fsb_run_tickets (client_hash, created_at desc);

comment on table public.fsb_run_tickets is
  'Future''s So Bright: single-use difficulty-11 run tickets (sha256 only), valid 1 hour, issued by fsb_start_run() to the current #1.';

create table if not exists public.fsb_events (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  event       text        not null,
  initials    text,
  score       integer,
  difficulty  integer,
  device      text,
  new_top     boolean     not null default false,
  notified_at timestamptz
);
alter table public.fsb_events add column if not exists new_top boolean not null default false;
alter table public.fsb_events add column if not exists notified_at timestamptz;
alter table public.fsb_events drop constraint if exists fsb_events_event_chk;
alter table public.fsb_events add constraint fsb_events_event_chk check (event in ('start', 'complete', 'new_top'));
create index if not exists fsb_events_pending_idx
  on public.fsb_events (created_at) where notified_at is null;

comment on table public.fsb_events is
  'Future''s So Bright alert log. start/complete = difficulty-11 runs (complete.new_top = took #1), new_top = a difficulty 1-10 submit that took #1. notified_at is set by whoever sends the alert.';

-- --- Lock the tables down: RLS on, no policies, no grants to API roles --------

alter table public.fsb_scores      enable row level security;
alter table public.fsb_secrets     enable row level security;
alter table public.fsb_run_tickets enable row level security;
alter table public.fsb_events      enable row level security;

revoke all on table public.fsb_scores      from public, anon, authenticated;
revoke all on table public.fsb_secrets     from public, anon, authenticated;
revoke all on table public.fsb_run_tickets from public, anon, authenticated;
revoke all on table public.fsb_events      from public, anon, authenticated;
revoke all on sequence public.fsb_scores_id_seq      from public, anon, authenticated;
revoke all on sequence public.fsb_run_tickets_id_seq from public, anon, authenticated;
revoke all on sequence public.fsb_events_id_seq      from public, anon, authenticated;

-- --- Drop every previous signature so re-runs replace cleanly -----------------

drop function if exists public.fsb_get_leaderboard();
drop function if exists public.fsb_submit_score(text, integer, integer);
drop function if exists public.fsb_submit_score(text, integer, integer, integer);
drop function if exists public.fsb_submit_score(text, integer, integer, integer, text);
drop function if exists public.fsb_am_i_top(text[]);
drop function if exists public.fsb_start_run(text[], integer);
drop function if exists public.fsb_device_label(text);
drop function if exists public.fsb_top_id();
drop function if exists public.fsb_client_hash();

-- --- Internal helpers (not callable through the API) --------------------------

-- Current #1 row: score desc, then earliest created_at (id breaks exact ties).
create function public.fsb_top_id()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select s.id from public.fsb_scores s
  order by s.score desc, s.created_at asc, s.id asc
  limit 1;
$$;

-- Coarse device label from the User-Agent (e.g. 'iPhone / Safari'); the raw UA is not stored.
create function public.fsb_device_label(ua text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
           when ua is null or ua = '' then 'unknown'
           else
             (case
                when ua ~* 'iphone' then 'iPhone'
                when ua ~* 'ipad' then 'iPad'
                when ua ~* 'android' and ua ~* 'mobile' then 'Android phone'
                when ua ~* 'android' then 'Android tablet'
                when ua ~* 'cros' then 'ChromeOS'
                when ua ~* 'macintosh|mac os x' then 'Mac'
                when ua ~* 'windows' then 'Windows'
                when ua ~* 'linux' then 'Linux'
                else 'other'
              end)
             || ' / ' ||
             (case
                when ua ~* 'edg/|edga/|edgios/' then 'Edge'
                when ua ~* 'firefox/|fxios/' then 'Firefox'
                when ua ~* 'samsungbrowser/' then 'Samsung Internet'
                when ua ~* 'crios/|chrome/|chromium/' then 'Chrome'
                when ua ~* 'safari/' then 'Safari'
                when ua ~* 'curl/' then 'curl'
                else 'other'
              end)
         end;
$$;

-- sha256(pepper || '|' || client ip). ip = cf-connecting-ip (set by Cloudflare), else first x-forwarded-for.
create function public.fsb_client_hash()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_headers json;
  v_ip      text;
  v_pepper  text;
begin
  v_headers := nullif(current_setting('request.headers', true), '')::json;
  v_ip := coalesce(
    nullif(btrim(v_headers ->> 'cf-connecting-ip'), ''),
    nullif(btrim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), ''),
    'unknown'
  );
  select sec.pepper into v_pepper from public.fsb_secrets sec where sec.id = 1;
  return encode(sha256(convert_to(coalesce(v_pepper, '') || '|' || v_ip, 'UTF8')), 'hex');
end;
$$;

-- --- Read: top 10 -------------------------------------------------------------

create function public.fsb_get_leaderboard()
returns table (initials text, score integer, difficulty integer)
language sql
stable
security definer
set search_path = ''
as $$
  select s.initials, s.score, s.difficulty
  from public.fsb_scores s
  order by s.score desc, s.created_at asc, s.id asc
  limit 10;
$$;

comment on function public.fsb_get_leaderboard() is
  'Future''s So Bright: global top 10 (initials, score, difficulty).';

-- --- Am I #1? -----------------------------------------------------------------

create function public.fsb_am_i_top(p_tokens text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select s.claim_hash is not null
       and s.claim_hash in (
         select encode(sha256(convert_to(t, 'UTF8')), 'hex')
         from unnest(p_tokens[1:50]) as t
         where t ~ '^[0-9a-f]{64}$'
       )
    from public.fsb_scores s
    where s.id = public.fsb_top_id()
  ), false);
$$;

comment on function public.fsb_am_i_top(text[]) is
  'Future''s So Bright: true if one of the claim tokens owns the current #1 row (score desc, earliest created_at).';

-- --- Difficulty-11 run ticket ---------------------------------------------------

create function public.fsb_start_run(p_tokens text[], p_difficulty integer)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_hash     text;
  v_recent   integer;
  v_ticket   text;
  v_top      record;
  v_headers  json;
begin
  if p_difficulty is distinct from 11 then
    raise exception using errcode = 'PT400', message = 'fsb: run tickets are only for difficulty 11';
  end if;
  if not public.fsb_am_i_top(p_tokens) then
    raise exception using errcode = 'PT403', message = 'fsb: difficulty 11 is reserved for the current #1';
  end if;

  v_hash := public.fsb_client_hash();
  perform pg_advisory_xact_lock(hashtextextended('fsb_ticket:' || v_hash, 0));
  select count(*) into v_recent
  from public.fsb_run_tickets r
  where r.client_hash = v_hash and r.created_at > now() - interval '10 minutes';
  if v_recent >= 20 then
    raise exception using errcode = 'PT429', message = 'fsb: too many runs started, try again later';
  end if;

  v_ticket := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.fsb_run_tickets (ticket_hash, difficulty, client_hash, expires_at)
  values (encode(sha256(convert_to(v_ticket, 'UTF8')), 'hex'), 11, v_hash, now() + interval '1 hour');

  select s.initials, s.score into v_top from public.fsb_scores s where s.id = public.fsb_top_id();
  v_headers := nullif(current_setting('request.headers', true), '')::json;
  insert into public.fsb_events (event, initials, score, difficulty, device)
  values ('start', v_top.initials, v_top.score, 11, public.fsb_device_label(v_headers ->> 'user-agent'));

  return v_ticket;
end;
$$;

comment on function public.fsb_start_run(text[], integer) is
  'Future''s So Bright: difficulty 11 only. Issues a single-use 1-hour run ticket if the caller holds #1 (proved by claim token).';

-- --- Write: validated, plausibility-checked, rate-limited submit --------------

create function public.fsb_submit_score(
  p_initials   text,
  p_score      integer,
  p_run_ms     integer,
  p_difficulty integer default 5,
  p_ticket     text default null
)
returns table (initials text, score integer, difficulty integer, is_new boolean, claim_token text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_headers json;
  v_hash    text;
  v_t       double precision;
  v_m       double precision;
  v_p       double precision;
  v_bound5  double precision;
  v_boundd  double precision;
  v_max     double precision;
  v_recent  integer;
  v_id      bigint;
  v_token   text;
  v_tid     bigint;
  v_tcreated timestamptz;
  v_is_top  boolean;
  v_device  text;
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
  if p_difficulty is null or p_difficulty < 1 or p_difficulty > 11 then
    raise exception using errcode = 'PT400', message = 'fsb: difficulty must be 1-11';
  end if;

  -- 3. Plausibility, scaled by the difficulty's speed factor (m) and point multiplier (p).
  v_m := (array[0.70, 0.775, 0.85, 0.925, 1.00, 1.09, 1.18, 1.27, 1.36, 1.45, 1.55])[p_difficulty];
  v_p := (array[0.6, 0.7, 0.8, 0.9, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.5])[p_difficulty];
  v_t := p_run_ms / 1000.0;
  v_bound5 := 3233.0 * (exp(0.01225 * v_t) - 1.0) + 149.0 * v_t;
  v_boundd := v_p * (0.12 * (240.0 * v_m + 90.0) / (0.01225 * v_m) * (exp(0.01225 * v_m * v_t) - 1.0) + 149.0 * v_t);
  v_max := 2.0 * greatest(v_boundd, v_m * v_p * v_bound5) + 500.0;
  if p_score > v_max then
    raise exception using errcode = 'PT400', message = 'fsb: score not plausible for run duration';
  end if;

  -- 4. Difficulty 11 needs a valid, unused run ticket from fsb_start_run().
  --    (A run started legitimately at 11 still counts if #1 was lost mid-run.)
  if p_difficulty = 11 then
    if p_ticket is null or p_ticket !~ '^[0-9a-f]{64}$' then
      raise exception using errcode = 'PT403', message = 'fsb: difficulty 11 needs a run ticket';
    end if;
    select r.id, r.created_at into v_tid, v_tcreated
    from public.fsb_run_tickets r
    where r.ticket_hash = encode(sha256(convert_to(p_ticket, 'UTF8')), 'hex')
      and r.difficulty = 11
      and r.used_at is null
      and r.expires_at > now()
    for update;
    if v_tid is null then
      raise exception using errcode = 'PT403', message = 'fsb: run ticket invalid, used or expired';
    end if;
    -- The run can't be longer than the time since its ticket was issued (+5 s slack).
    if p_run_ms > extract(epoch from (now() - v_tcreated)) * 1000.0 + 5000.0 then
      raise exception using errcode = 'PT400', message = 'fsb: run longer than its ticket';
    end if;
  end if;

  -- 5. Rate limit per client (hashed IP), max 5 per rolling 10 minutes.
  v_hash := public.fsb_client_hash();
  -- Serialize concurrent submits from the same client so the count is exact.
  perform pg_advisory_xact_lock(hashtextextended('fsb_submit:' || v_hash, 0));

  select count(*) into v_recent
  from public.fsb_scores s
  where s.client_hash = v_hash
    and s.created_at > now() - interval '10 minutes';
  if v_recent >= 5 then
    raise exception using errcode = 'PT429', message = 'fsb: too many submissions, try again later';
  end if;

  -- 6. Insert with a fresh claim token (only its hash is stored).
  if v_tid is not null then
    update public.fsb_run_tickets set used_at = now() where id = v_tid;
  end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.fsb_scores (initials, score, run_ms, client_hash, difficulty, claim_hash)
  values (p_initials, p_score, p_run_ms, v_hash, p_difficulty,
          encode(sha256(convert_to(v_token, 'UTF8')), 'hex'))
  returning id into v_id;

  -- 7. Alerts: difficulty 11 -> one 'complete' row (new_top true/false); 1-10 -> 'new_top' only if it took #1.
  v_is_top := (public.fsb_top_id() = v_id);
  v_headers := nullif(current_setting('request.headers', true), '')::json;
  v_device := public.fsb_device_label(v_headers ->> 'user-agent');
  if p_difficulty = 11 then
    insert into public.fsb_events (event, initials, score, difficulty, device, new_top)
    values ('complete', p_initials, p_score, 11, v_device, v_is_top);
  elsif v_is_top then
    insert into public.fsb_events (event, initials, score, difficulty, device, new_top)
    values ('new_top', p_initials, p_score, p_difficulty, v_device, true);
  end if;

  -- 8. Return the new top 10; the new row carries is_new and its raw claim token.
  return query
    select s.initials, s.score, s.difficulty, (s.id = v_id),
           case when s.id = v_id then v_token else null end
    from public.fsb_scores s
    order by s.score desc, s.created_at asc, s.id asc
    limit 10;
end;
$$;

comment on function public.fsb_submit_score(text, integer, integer, integer, text) is
  'Future''s So Bright: submit a score (3 A-Z initials, difficulty 1-11, plausible for run_ms, max 5 per 10 min per client; difficulty 11 needs a ticket). Returns the new top 10 with a claim token on the new row.';

-- --- Grants: only the four API functions are callable by the public API ---------

revoke all on function public.fsb_top_id() from public, anon, authenticated;
revoke all on function public.fsb_device_label(text) from public, anon, authenticated;
revoke all on function public.fsb_client_hash() from public, anon, authenticated;
revoke all on function public.fsb_get_leaderboard() from public;
revoke all on function public.fsb_submit_score(text, integer, integer, integer, text) from public;
revoke all on function public.fsb_am_i_top(text[]) from public;
revoke all on function public.fsb_start_run(text[], integer) from public;
grant execute on function public.fsb_get_leaderboard() to anon, authenticated;
grant execute on function public.fsb_submit_score(text, integer, integer, integer, text) to anon, authenticated;
grant execute on function public.fsb_am_i_top(text[]) to anon, authenticated;
grant execute on function public.fsb_start_run(text[], integer) to anon, authenticated;

commit;

-- Ask PostgREST to pick up the new functions right away.
notify pgrst, 'reload schema';

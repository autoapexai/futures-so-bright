-- Future's So Bright: levels 1-111 and the score cap.
-- Objects changed (all fsb_; backup first: /workspace/fsb-phase2/backup-before-l111.sql):
--   new      public.fsb_score_cap()            THE single cap value (one line to change)
--   check    fsb_scores.fsb_scores_score_chk   score <= fsb_score_cap()   (was <= 1000000)
--   check    fsb_scores.fsb_scores_difficulty_chk  1-111                   (was 1-11)
--   check    fsb_scores.fsb_scores_run_ms_chk  1 s - 3 h                     (was 1 s - 1 h)
--   column   fsb_run_tickets.issued_at         real issue time (created_at stays dated back by the play time)
--   function fsb_submit_score                  cap via fsb_score_cap(); levels 1-111; tickets for 11-111
--                                              with a minimum climb time; 'complete' events carry the level
--   function fsb_start_run                     tickets live 4 h (was 1 h); rate limit on issued_at
--   columns  fsb_scores.mode, fsb_scores.mode_count  the mode a run ENDED on + how many modes it used
--                                              (nullable; old rows / old clients leave them null)
--   function fsb_submit_score is re-created with two optional params (p_mode, p_modes) so old cached
--            clients that send the original five still resolve to it; grants re-applied.
--            Boss bonus: + 1,000,000 per boss reachable by the ending level (floor((L-1)/10), +1 at 111).
--            Run length cap 3 h (was 1 h): 111 levels of 30 s plus up to 12 boss fights.
--            Play-points bound is now also linear in run time (600 * p per s), see step 3.
--   column   fsb_scores.start_level            the level a run BEGAN on (nullable; old rows stay null = shown
--                                              as a dash, never backfilled). END is the existing difficulty.
--   function fsb_submit_score also takes p_start (start <= end; must agree with the ticket's dated-back
--            play time) and returns start_level with each board row.
--   function fsb_get_leaderboard re-created to also return start_level and the TOP 11 (was 10); grants re-applied.
-- Columns stay INTEGER (777,777,777 < 2,147,483,647). fsb_events has no difficulty check to widen.

begin;

-- The score cap: change this one value to switch caps.
create or replace function public.fsb_score_cap() returns integer
language sql immutable parallel safe set search_path to ''
as $$ select 777777777 $$;
revoke all on function public.fsb_score_cap() from public, anon, authenticated;
grant execute on function public.fsb_score_cap() to service_role;

alter table public.fsb_scores drop constraint fsb_scores_score_chk;
alter table public.fsb_scores add constraint fsb_scores_score_chk check (score >= 1 and score <= public.fsb_score_cap());
alter table public.fsb_scores drop constraint fsb_scores_difficulty_chk;
alter table public.fsb_scores add constraint fsb_scores_difficulty_chk check (difficulty >= 1 and difficulty <= 111);
alter table public.fsb_scores drop constraint fsb_scores_run_ms_chk;
alter table public.fsb_scores add constraint fsb_scores_run_ms_chk check (run_ms >= 1000 and run_ms <= 10800000);

alter table public.fsb_run_tickets add column issued_at timestamptz not null default now();
-- Every existing ticket was issued with a 1 h lifetime.
update public.fsb_run_tickets set issued_at = expires_at - interval '1 hour';

alter table public.fsb_scores add column mode text
  constraint fsb_scores_mode_chk check (mode is null or mode ~ '^[a-z0-9]{1,16}$');
alter table public.fsb_scores add column mode_count smallint
  constraint fsb_scores_mode_count_chk check (mode_count is null or (mode_count >= 1 and mode_count <= 13));

alter table public.fsb_scores add column start_level smallint
  constraint fsb_scores_start_level_chk check (start_level is null or (start_level >= 1 and start_level <= 111 and start_level <= difficulty));

drop function public.fsb_submit_score(text, integer, integer, integer, text);
drop function public.fsb_get_leaderboard();
create function public.fsb_get_leaderboard()
 returns table(initials text, score integer, difficulty integer, start_level integer)
 language sql stable security definer set search_path to ''
as $function$
  select s.initials, s.score, s.difficulty, s.start_level::integer
  from public.fsb_scores s
  order by s.score desc, s.created_at asc, s.id asc
  limit 11;
$function$;
revoke all on function public.fsb_get_leaderboard() from public;
grant execute on function public.fsb_get_leaderboard() to anon, authenticated, service_role;

CREATE FUNCTION public.fsb_submit_score(p_initials text, p_score integer, p_run_ms integer, p_difficulty integer DEFAULT 5, p_ticket text DEFAULT NULL::text, p_mode text DEFAULT NULL::text, p_modes integer DEFAULT NULL::integer, p_start integer DEFAULT NULL::integer)
 RETURNS TABLE(initials text, score integer, difficulty integer, is_new boolean, claim_token text, start_level integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_tissued timestamptz;
  v_min_ms  double precision;
  v_bosses  integer;
  v_mode    text;
  v_modes   smallint;
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
  if p_difficulty is null or p_difficulty < 1 or p_difficulty > 111 then
    raise exception using errcode = 'PT400', message = 'fsb: difficulty must be 1-111';
  end if;
  -- Start level (optional; old clients omit it): runs begin on 1-10 (the stepper) or 11 (the
  -- clone start), and never above the level they ended on.
  if p_start is not null and (p_start < 1 or p_start > 11 or p_start > p_difficulty) then
    raise exception using errcode = 'PT400', message = 'fsb: start level out of range';
  end if;

  -- 3. Plausibility, scaled by the difficulty's speed factor (m) and point multiplier (p).
  --    Levels 12-111 use level 11's factors (gold-zone hazard speed stays <= 1.55; points stay 2.5x).
  v_m := (array[0.70, 0.775, 0.85, 0.925, 1.00, 1.09, 1.18, 1.27, 1.36, 1.45, 1.55])[least(p_difficulty, 11)];
  v_p := (array[0.6, 0.7, 0.8, 0.9, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0, 2.5])[least(p_difficulty, 11)];
  v_t := p_run_ms / 1000.0;
  v_bound5 := 3233.0 * (exp(0.01225 * v_t) - 1.0) + 149.0 * v_t;
  v_boundd := v_p * (0.12 * (240.0 * v_m + 90.0) / (0.01225 * v_m) * (exp(0.01225 * v_m * v_t) - 1.0) + 149.0 * v_t);
  -- THE BOARD: a flat 1,000,000 per boss beaten. Bosses end levels 10, 20 ... 110 and 111, so a
  -- run ending on level L can have beaten floor((L-1)/10) of them, plus the final one at 111.
  v_bosses := (p_difficulty - 1) / 10 + (case when p_difficulty = 111 then 1 else 0 end);
  -- Every level is a 30 s stage whose ramp resets, so play points grow at most linearly with run
  -- time: <= ~150 * p per second (scroll + boost + shades at the fastest gold level); 600 * p per
  -- second is 4x headroom. The old exponential bound still applies to short runs (whichever is
  -- lower). Without this, the 777,777,777 cap would be reachable by any long-enough run.
  v_max := least(2.0 * greatest(v_boundd, v_m * v_p * v_bound5) + 500.0, v_p * 600.0 * v_t + 2000.0)
           + v_bosses * 1000000.0;
  if p_score > v_max then
    raise exception using errcode = 'PT400', message = 'fsb: score not plausible for run duration';
  end if;

  -- 4. Levels 11-111 (the gold zone) need a valid, unused run ticket from fsb_start_run(),
  --    issued when level 10 was cleared (or when a run started at 11).
  if p_difficulty >= 11 then
    if p_ticket is null or p_ticket !~ '^[0-9a-f]{64}$' then
      raise exception using errcode = 'PT403', message = 'fsb: levels 11-111 need a run ticket';
    end if;
    select r.id, r.created_at, r.issued_at into v_tid, v_tcreated, v_tissued
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
    -- Reaching level N means clearing levels 11..N-1 after the ticket was issued: at least
    -- 30 s of play each. The play time and the wall time since issue must both cover that.
    v_min_ms := (p_difficulty - 11) * 30000.0;
    if p_run_ms < v_min_ms - 2000.0 then
      raise exception using errcode = 'PT400', message = 'fsb: run too short for its level';
    end if;
    if extract(epoch from (now() - v_tissued)) * 1000.0 < v_min_ms - 5000.0 then
      raise exception using errcode = 'PT400', message = 'fsb: ticket too young for its level';
    end if;
    -- The ticket is dated back by the play time before it was issued (levels start..10), so it
    -- must agree with the claimed start: a start at 11 has (almost) none, a start at S <= 10 needs
    -- at least 30 s per level S..10.
    if p_start is not null then
      if p_start = 11 and extract(epoch from (v_tissued - v_tcreated)) > 60 then
        raise exception using errcode = 'PT400', message = 'fsb: start level does not match its ticket';
      end if;
      if p_start <= 10 and extract(epoch from (v_tissued - v_tcreated)) * 1000.0 < (11 - p_start) * 30000.0 - 5000.0 then
        raise exception using errcode = 'PT400', message = 'fsb: start level does not match its ticket';
      end if;
    end if;
  end if;

  -- Mode info (stored only; never rejects a run): a known mode id or null, and a 1-13 count.
  v_mode := case when p_mode in ('alw','toosuccessful','daly','toofat','mantzoukas','calvin','decoy',
                                 'cbb','slackerman','itm','dvorak','curry','calvin3') then p_mode end;
  v_modes := case when p_modes between 1 and 13 then p_modes end;

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
  insert into public.fsb_scores (initials, score, run_ms, client_hash, difficulty, claim_hash, mode, mode_count, start_level)
  values (p_initials, p_score, p_run_ms, v_hash, p_difficulty,
          encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_mode, v_modes, p_start)
  returning id into v_id;

  -- 7. Alerts: levels 11-111 -> one 'complete' row with the level reached (new_top true/false);
  --    1-10 -> 'new_top' only if it took #1.
  v_is_top := (public.fsb_top_id() = v_id);
  v_headers := nullif(current_setting('request.headers', true), '')::json;
  v_device := public.fsb_device_label(v_headers ->> 'user-agent');
  if p_difficulty >= 11 then
    insert into public.fsb_events (event, initials, score, difficulty, device, new_top)
    values ('complete', p_initials, p_score, p_difficulty, v_device, v_is_top);
  elsif v_is_top then
    insert into public.fsb_events (event, initials, score, difficulty, device, new_top)
    values ('new_top', p_initials, p_score, p_difficulty, v_device, true);
  end if;

  -- 8. Return the new top 11 (the board shows 11 rows); the new row carries is_new and its raw claim token.
  return query
    select s.initials, s.score, s.difficulty, (s.id = v_id),
           case when s.id = v_id then v_token else null end, s.start_level::integer
    from public.fsb_scores s
    order by s.score desc, s.created_at asc, s.id asc
    limit 11;
end;
$function$;
revoke all on function public.fsb_submit_score(text, integer, integer, integer, text, text, integer, integer) from public;
grant execute on function public.fsb_submit_score(text, integer, integer, integer, text, text, integer, integer) to anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fsb_start_run(p_tokens text[], p_difficulty integer, p_elapsed_ms integer DEFAULT 0)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_hash     text;
  v_recent   integer;
  v_ticket   text;
  v_me       record;
  v_headers  json;
  v_elapsed  integer := coalesce(p_elapsed_ms, 0);
begin
  if p_difficulty is distinct from 11 then
    raise exception using errcode = 'PT400', message = 'fsb: run tickets are only for difficulty 11';
  end if;
  -- Elapsed = play time before level 11 (levels 1-10: at most ~5 min plus the 30 s stages ... a
  -- generous 55 min cap). The ticket lives 4 h from issue: levels 11-111 are >= 50.5 min of play
  -- plus up to 11 boss fights (and any pauses).
  if v_elapsed < 0 or v_elapsed > 3300000 then
    raise exception using errcode = 'PT400', message = 'fsb: elapsed run time out of range';
  end if;

  v_hash := public.fsb_client_hash();
  perform pg_advisory_xact_lock(hashtextextended('fsb_ticket:' || v_hash, 0));
  -- Rate limit on issue time: max 20 tickets per client per 10 minutes.
  select count(*) into v_recent
  from public.fsb_run_tickets r
  where r.client_hash = v_hash and r.issued_at > now() - interval '10 minutes';
  if v_recent >= 20 then
    raise exception using errcode = 'PT429', message = 'fsb: too many runs started, try again later';
  end if;

  v_ticket := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.fsb_run_tickets (ticket_hash, difficulty, client_hash, created_at, issued_at, expires_at)
  values (encode(sha256(convert_to(v_ticket, 'UTF8')), 'hex'), 11, v_hash,
          now() - make_interval(secs => v_elapsed / 1000.0), now(), now() + interval '4 hours');

  -- 'start' alert row, same shape as before. initials / score = the player's own best claimed
  -- score (for the #1 that is the #1 row, exactly as before); null for a player with no score yet.
  select s.initials, s.score into v_me
  from public.fsb_scores s
  where s.claim_hash is not null
    and s.claim_hash in (
      select encode(sha256(convert_to(t, 'UTF8')), 'hex')
      from unnest(p_tokens[1:50]) as t
      where t ~ '^[0-9a-f]{64}$'
    )
  order by s.score desc, s.created_at asc, s.id asc
  limit 1;
  v_headers := nullif(current_setting('request.headers', true), '')::json;
  insert into public.fsb_events (event, initials, score, difficulty, device)
  values ('start', v_me.initials, v_me.score, 11, public.fsb_device_label(v_headers ->> 'user-agent'));

  return v_ticket;
end;
$function$;

commit;

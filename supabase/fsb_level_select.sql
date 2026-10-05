-- =============================================================================
-- Future's So Bright: LEVEL SELECT (start on any level 1-111) + FIGHT THE BOSS starts.
-- Apply: /workspace/fsb-phase2/sbq.sh supabase/fsb_level_select.sql   (drops + recreates)
-- Undo:  supabase/fsb_level_select_rollback.sql (the exact definition live before, dumped with
--        pg_get_functiondef on 2026-10-04, Pacific Time; copy in /workspace/level-select/sql-backup/).
--
-- fsb_submit_score only (no table, column, row, policy or other function is touched):
--   * p_start may be 1-111 (was 1-11), still <= the level the run ended on.
--   * new optional p_fight boolean (DEFAULT NULL): the run began right at its start level's
--     boss / mini-boss. Needs p_start. Omitted / false = every check exactly as before.
--   * plausibility: the 1,000,000-per-boss allowance no longer counts bosses below the start
--     level (tighter for every start > 10; identical for start 1-10 / unknown).
--   * levels 11-111 still need a valid, unused, unexpired run ticket (fsb_start_run, unchanged).
--     30 s-per-level floors count from max(11, start) (+1 for a boss-fight start); a start at
--     11-111 must have a ticket issued at the start (<= 60 s dated back, as the start-11 rule
--     already did); a start at S <= 10 still needs 30 s per level S..10 before its ticket
--     (S+1..10 for a boss-fight start).
--   Unchanged: initials, the 777,777,777 cap (fsb_score_cap), run_ms 1 s-3 h, GAME SPEED,
--   mini-boss allowance (already start-aware), modes, rate limit 5 / 10 min, alerts, return
--   shape, grants.
-- =============================================================================
begin;

drop function if exists public.fsb_submit_score(text, integer, integer, integer, text, text, integer, integer, integer);

create function public.fsb_submit_score(p_initials text, p_score integer, p_run_ms integer, p_difficulty integer DEFAULT 5, p_ticket text DEFAULT NULL::text, p_mode text DEFAULT NULL::text, p_modes integer DEFAULT NULL::integer, p_start integer DEFAULT NULL::integer, p_speed integer DEFAULT NULL::integer, p_fight boolean DEFAULT NULL::boolean)
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
  v_s       double precision;
  v_minis   bigint;
  v_fight   boolean;
  v_from    integer;
begin
  -- 1. Initials: exactly three characters from the game's initials sets (English A-Z, Spanish
  --    with Ñ and accents, Vietnamese letters, the curated Chinese characters, ★ and the emojis;
  --    see src/utils/initials.ts), and not a rude combo (family board).
  if not public.fsb_initials_allowed(p_initials) then
    raise exception using errcode = 'PT400', message = 'fsb: initials must be 3 characters from the initials picker';
  end if;
  if public.fsb_initials_rude(p_initials) then
    raise exception using errcode = 'PT400', message = 'fsb: those initials slipped on a banana peel - please pick different ones';
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
  -- Start level (optional; old clients omit it): LEVEL SELECT starts a run on any level 1-111
  -- (1-10 also via the stepper, 11 via the clone button), never above the level it ended on.
  if p_start is not null and (p_start < 1 or p_start > 111 or p_start > p_difficulty) then
    raise exception using errcode = 'PT400', message = 'fsb: start level out of range';
  end if;
  -- FIGHT THE BOSS (optional; only with a start level): the run began at its start level's
  -- boss / mini-boss encounter, i.e. without that level's 30 s stage. Every check below is
  -- today's exactly when it is omitted / false.
  if p_fight is true and p_start is null then
    raise exception using errcode = 'PT400', message = 'fsb: a boss-fight start needs its start level';
  end if;
  v_fight := coalesce(p_fight, false);
  -- GAME SPEED (optional; old clients omit it = 1.0): the run's top speed in tenths, 10-111
  -- (1.0-11.1). run_ms stays GAME time; at speed s the game runs s x faster than the wall clock
  -- and every point is worth s x, so every rate bound below scales by s.
  if p_speed is not null and (p_speed < 10 or p_speed > 111) then
    raise exception using errcode = 'PT400', message = 'fsb: speed must be 10-111 (tenths: 1.0-11.1)';
  end if;
  v_s := coalesce(p_speed, 10) / 10.0;

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
  -- ... minus the bosses on levels below its start (a run from S never met them). Unknown start = 1.
  v_bosses := v_bosses - (coalesce(p_start, 1) - 1) / 10;
  -- MINI-BOSSES (every level that isn't 10, 20 ... 110, 111): 1,000 x level each, x speed. A run
  -- from start S ending on level L can have beaten the minis on S..L (L's own included, in case the
  -- run ended right after it). Unknown start = 1. Sum of non-multiples of 10 in 1..n is
  -- n(n+1)/2 - 10 q(q+1)/2 with q = floor(n/10).
  v_minis := public.fsb_mini_levels_sum(p_difficulty) - public.fsb_mini_levels_sum(coalesce(p_start, 1) - 1);
  -- Every level is a 30 s stage whose ramp resets, so play points grow at most linearly with run
  -- time: <= ~150 * p per second (scroll + boost + shades at the fastest gold level); 600 * p per
  -- second is 4x headroom. The old exponential bound still applies to short runs (whichever is
  -- lower). Without this, the 777,777,777 cap would be reachable by any long-enough run.
  -- GAME SPEED: points per game second and the boss bonus are both worth s x.
  v_max := v_s * (least(2.0 * greatest(v_boundd, v_m * v_p * v_bound5) + 500.0, v_p * 600.0 * v_t + 2000.0)
                  + v_bosses * 1000000.0 + v_minis * 1000.0);
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
    -- (GAME SPEED: the game time after the ticket was issued can be up to s x the wall time.)
    if p_run_ms > (extract(epoch from (v_tissued - v_tcreated)) + extract(epoch from (now() - v_tissued)) * v_s) * 1000.0 + 5000.0 then
      raise exception using errcode = 'PT400', message = 'fsb: run longer than its ticket';
    end if;
    -- Reaching level N means clearing levels F..N-1 after the ticket was issued: at least
    -- 30 s of play each, from F = 11 (a climb, or a start at 11) or F = the start level (a
    -- LEVEL SELECT start at 12-111; the ticket is issued at that start). A boss-fight start
    -- skips its first level's 30 s stage, so it counts from the next one. The play time and the
    -- wall time since issue must both cover that.
    v_from := case when coalesce(p_start, 1) >= 11 then p_start + (case when v_fight then 1 else 0 end) else 11 end;
    v_min_ms := greatest(0, p_difficulty - v_from) * 30000.0;
    if p_run_ms < v_min_ms - 2000.0 then
      raise exception using errcode = 'PT400', message = 'fsb: run too short for its level';
    end if;
    if extract(epoch from (now() - v_tissued)) * 1000.0 * v_s < v_min_ms - 5000.0 then
      raise exception using errcode = 'PT400', message = 'fsb: ticket too young for its level';
    end if;
    -- The ticket is dated back by the play time before it was issued (levels start..10), so it
    -- must agree with the claimed start: a start at 11-111 has (almost) none, a start at S <= 10
    -- needs at least 30 s per level S..10 (S+1..10 for a boss-fight start at S).
    if p_start is not null then
      if p_start >= 11 and extract(epoch from (v_tissued - v_tcreated)) > 60 then
        raise exception using errcode = 'PT400', message = 'fsb: start level does not match its ticket';
      end if;
      if p_start <= 10 and extract(epoch from (v_tissued - v_tcreated)) * 1000.0 < (11 - p_start - (case when v_fight then 1 else 0 end)) * 30000.0 - 5000.0 then
        raise exception using errcode = 'PT400', message = 'fsb: start level does not match its ticket';
      end if;
    end if;
  end if;

  -- Mode info (stored only; never rejects a run): a known mode id or null, and a 1-13 count.
  v_mode := case when p_mode in ('alw','toosuccessful','daly','toofat','nextdoor','calvin','decoy',
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

revoke all on function public.fsb_submit_score(text, integer, integer, integer, text, text, integer, integer, integer, boolean) from public;
grant execute on function public.fsb_submit_score(text, integer, integer, integer, text, text, integer, integer, integer, boolean) to anon, authenticated, service_role;

commit;
notify pgrst, 'reload schema';

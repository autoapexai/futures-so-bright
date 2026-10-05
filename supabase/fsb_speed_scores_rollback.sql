-- Future's So Bright: undo supabase/fsb_speed_scores.sql (GAME SPEED server rules).
-- PROPOSED, NOT APPLIED. Restores the exact fsb_submit_score / fsb_dev_submit definitions that
-- were live on 2026-10-01 (pg_get_functiondef dumps, Pacific Time) and their grants. No table or
-- row is touched. After this, set SPEED_ON_PUBLIC_BOARD = false again in src/utils/speed.ts.
--   /workspace/fsb-phase2/sbq.sh supabase/fsb_speed_scores_rollback.sql
begin;

drop function if exists public.fsb_submit_score(text, integer, integer, integer, text, text, integer, integer, integer);

CREATE OR REPLACE FUNCTION public.fsb_submit_score(p_initials text, p_score integer, p_run_ms integer, p_difficulty integer DEFAULT 5, p_ticket text DEFAULT NULL::text, p_mode text DEFAULT NULL::text, p_modes integer DEFAULT NULL::integer, p_start integer DEFAULT NULL::integer)
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

revoke all on function public.fsb_submit_score(text, integer, integer, integer, text, text, integer, integer) from public;
grant execute on function public.fsb_submit_score(text, integer, integer, integer, text, text, integer, integer) to anon, authenticated, service_role;

drop function if exists public.fsb_dev_submit(text, integer, integer, integer, integer, integer);

CREATE OR REPLACE FUNCTION public.fsb_dev_submit(p_initials text, p_score integer, p_run_ms integer, p_level integer, p_start integer DEFAULT NULL::integer)
 RETURNS TABLE(initials text, score integer, level integer, start_level integer, is_new boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$;

revoke all on function public.fsb_dev_submit(text, integer, integer, integer, integer) from public;
grant execute on function public.fsb_dev_submit(text, integer, integer, integer, integer) to anon, authenticated, service_role;

commit;

notify pgrst, 'reload schema';

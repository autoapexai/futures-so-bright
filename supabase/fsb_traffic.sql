-- Future's So Bright: anonymous, privacy-respecting traffic counts.
-- New objects only (nothing existing is altered):
--   table    public.fsb_visits             (no anon/authenticated access at all; RLS on, no policies)
--   function public.fsb_track(...)         SECURITY DEFINER insert path, the only thing anon may call
--   views    public.fsb_traffic_daily      per Pacific day   } service role / Management API only
--            public.fsb_traffic_totals     all-time uniques  }
-- Stored per event: a SHA-256 hash of a random per-browser id (computed in the browser; the raw id
-- never leaves the device), the event, mode + starting level (run_start only), a coarse device class
-- and the referrer host. No IP, user agent, cookies or fingerprinting.

begin;

create table public.fsb_visits (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  visitor_hash  text not null check (visitor_hash ~ '^[0-9a-f]{64}$'),
  event         text not null check (event in ('page_view', 'run_start')),
  mode          text check (mode is null or mode ~ '^[A-Z0-9][A-Z0-9 .&''!-]{0,39}$'),
  level         smallint check (level is null or level between 1 and 11),
  device_class  text check (device_class is null or device_class in ('phone', 'tablet', 'desktop')),
  referrer_host text check (referrer_host is null or (length(referrer_host) <= 253 and referrer_host ~ '^[a-z0-9.-]+$')),
  constraint fsb_visits_shape_chk check (
    (event = 'page_view' and mode is null and level is null) or
    (event = 'run_start' and mode is not null and level is not null))
);
create index fsb_visits_visitor_idx on public.fsb_visits (visitor_hash, created_at);
create index fsb_visits_created_idx on public.fsb_visits (created_at);

alter table public.fsb_visits enable row level security;
revoke all on table public.fsb_visits from public, anon, authenticated;
revoke all on sequence public.fsb_visits_id_seq from public, anon, authenticated;

create function public.fsb_track(
  p_visitor_hash  text,
  p_event         text,
  p_mode          text default null,
  p_level         integer default null,
  p_device_class  text default null,
  p_referrer_host text default null
) returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ref    text := lower(nullif(btrim(coalesce(p_referrer_host, '')), ''));
  v_recent integer;
begin
  if p_visitor_hash is null or p_visitor_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'PT400', message = 'fsb: bad visitor hash';
  end if;
  if p_event = 'page_view' then
    if p_mode is not null or p_level is not null then
      raise exception using errcode = 'PT400', message = 'fsb: page_view takes no mode or level';
    end if;
  elsif p_event = 'run_start' then
    if p_mode is null or p_mode !~ '^[A-Z0-9][A-Z0-9 .&''!-]{0,39}$' then
      raise exception using errcode = 'PT400', message = 'fsb: bad mode';
    end if;
    if p_level is null or p_level < 1 or p_level > 11 then
      raise exception using errcode = 'PT400', message = 'fsb: bad level';
    end if;
  else
    raise exception using errcode = 'PT400', message = 'fsb: unknown event';
  end if;
  if p_device_class is not null and p_device_class not in ('phone', 'tablet', 'desktop') then
    raise exception using errcode = 'PT400', message = 'fsb: bad device class';
  end if;
  -- Referrer: host names only; anything else is dropped rather than failing the event.
  if v_ref is not null and (length(v_ref) > 253 or v_ref !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$') then
    v_ref := null;
  end if;

  -- Light rate limits (over the limit = quietly not stored): 60 events / hour per visitor hash,
  -- and a global safety cap of 20,000 events / hour.
  perform pg_advisory_xact_lock(hashtextextended('fsb_track:' || p_visitor_hash, 0));
  select count(*) into v_recent from public.fsb_visits v
  where v.visitor_hash = p_visitor_hash and v.created_at > now() - interval '1 hour';
  if v_recent >= 60 then
    return false;
  end if;
  select count(*) into v_recent from public.fsb_visits v where v.created_at > now() - interval '1 hour';
  if v_recent >= 20000 then
    return false;
  end if;

  insert into public.fsb_visits (visitor_hash, event, mode, level, device_class, referrer_host)
  values (p_visitor_hash, p_event, case when p_event = 'run_start' then p_mode end,
          case when p_event = 'run_start' then p_level end, p_device_class, v_ref);
  return true;
end;
$function$;

revoke all on function public.fsb_track(text, text, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.fsb_track(text, text, text, integer, text, text) to anon, authenticated;

-- Reporting (service role / Management API only).
create view public.fsb_traffic_daily with (security_invoker = true) as
select (v.created_at at time zone 'America/Los_Angeles')::date               as day,
       count(*) filter (where v.event = 'page_view')                        as page_views,
       count(distinct v.visitor_hash)                                       as unique_visitors,
       count(*) filter (where v.event = 'run_start')                        as run_starts,
       count(distinct v.visitor_hash) filter (where v.event = 'run_start')  as unique_players
from public.fsb_visits v
group by 1;

create view public.fsb_traffic_totals with (security_invoker = true) as
select count(*) filter (where v.event = 'page_view')                        as page_views,
       count(distinct v.visitor_hash)                                       as unique_visitors,
       count(*) filter (where v.event = 'run_start')                        as run_starts,
       count(distinct v.visitor_hash) filter (where v.event = 'run_start')  as unique_players,
       min(v.created_at)                                                    as first_event,
       max(v.created_at)                                                    as last_event
from public.fsb_visits v;

revoke all on table public.fsb_traffic_daily, public.fsb_traffic_totals from public, anon, authenticated;

commit;

-- VALUE FOR VALUE: TIME (suggestions) and TALENT (resumes). New objects only (backup first:
-- /workspace/fsb-phase2/backup-before-l111.sql covers the pre-change state; nothing here alters
-- an existing object except adding policies on storage.objects scoped to the new bucket).
--   table    public.fsb_suggestions     (RLS on, no anon/auth privileges)
--   table    public.fsb_resumes         (RLS on, no anon/auth privileges)
--   function public.fsb_suggest(...)       SECURITY DEFINER: validate, honeypot, 3/hour per client hash
--   function public.fsb_resume_start(...)  SECURITY DEFINER: validate, honeypot, 3/hour per client hash,
--                                          issues a one-time upload path r/<uuid>.<ext>
--   function public.fsb_resume_path_ok(text)  SECURITY DEFINER helper used by the upload policy
--   function public.fsb_resume_done(text)     marks the row uploaded once the object exists
--   bucket   storage 'fsb-resumes'      private, 5 MB, PDF / DOC / DOCX only
--   policy   storage.objects "fsb_resumes_anon_insert"  INSERT only, only bucket fsb-resumes, only
--            to a path fsb_resume_start issued in the last 30 min and not yet uploaded. No select,
--            update or delete policy, so no public read and no overwrite.
-- client_hash = SHA-256 of the browser's random visitor id (no IP, no fingerprint).
begin;

create table public.fsb_suggestions (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  message text not null constraint fsb_suggestions_message_chk check (char_length(message) between 1 and 1000),
  name text constraint fsb_suggestions_name_chk check (name is null or char_length(name) between 1 and 40),
  email text constraint fsb_suggestions_email_chk check (email is null or (char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$')),
  client_hash text not null constraint fsb_suggestions_client_chk check (client_hash ~ '^[0-9a-f]{64}$')
);
alter table public.fsb_suggestions enable row level security;
revoke all on public.fsb_suggestions from public, anon, authenticated;
create index fsb_suggestions_client_idx on public.fsb_suggestions (client_hash, created_at desc);

create table public.fsb_resumes (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null constraint fsb_resumes_name_chk check (char_length(name) between 1 and 80),
  email text not null constraint fsb_resumes_email_chk check (char_length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'),
  note text constraint fsb_resumes_note_chk check (note is null or char_length(note) <= 500),
  file_path text not null unique constraint fsb_resumes_path_chk check (file_path ~ '^r/[0-9a-f-]{36}\.(pdf|doc|docx)$'),
  file_name text constraint fsb_resumes_fname_chk check (file_name is null or char_length(file_name) <= 120),
  mime text not null constraint fsb_resumes_mime_chk check (mime in ('application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  size_bytes integer not null constraint fsb_resumes_size_chk check (size_bytes between 1 and 5242880),
  client_hash text not null constraint fsb_resumes_client_chk check (client_hash ~ '^[0-9a-f]{64}$'),
  uploaded_at timestamptz
);
alter table public.fsb_resumes enable row level security;
revoke all on public.fsb_resumes from public, anon, authenticated;
create index fsb_resumes_client_idx on public.fsb_resumes (client_hash, created_at desc);

create function public.fsb_suggest(p_message text, p_name text default null, p_email text default null,
                                   p_client text default null, p_hp text default null)
returns boolean language plpgsql security definer set search_path to '' as $$
declare v_msg text := btrim(coalesce(p_message, '')); v_name text := nullif(btrim(coalesce(p_name, '')), '');
        v_email text := nullif(lower(btrim(coalesce(p_email, ''))), ''); v_n integer;
begin
  -- Honeypot: bots that fill the hidden field get a silent "ok" and nothing is stored.
  if coalesce(p_hp, '') <> '' then return true; end if;
  if p_client is null or p_client !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'PT400', message = 'fsb: missing client id'; end if;
  if char_length(v_msg) < 1 or char_length(v_msg) > 1000 then
    raise exception using errcode = 'PT400', message = 'fsb: suggestion must be 1-1000 characters'; end if;
  if v_name is not null and char_length(v_name) > 40 then
    raise exception using errcode = 'PT400', message = 'fsb: name too long'; end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$') then
    raise exception using errcode = 'PT400', message = 'fsb: email looks off'; end if;
  perform pg_advisory_xact_lock(hashtextextended('fsb_suggest:' || p_client, 0));
  select count(*) into v_n from public.fsb_suggestions where client_hash = p_client and created_at > now() - interval '1 hour';
  if v_n >= 3 then raise exception using errcode = 'PT429', message = 'fsb: too many suggestions, try again later'; end if;
  select count(*) into v_n from public.fsb_suggestions where created_at > now() - interval '1 hour';
  if v_n >= 200 then raise exception using errcode = 'PT429', message = 'fsb: too many suggestions, try again later'; end if;
  insert into public.fsb_suggestions (message, name, email, client_hash) values (v_msg, v_name, v_email, p_client);
  return true;
end $$;
revoke all on function public.fsb_suggest(text, text, text, text, text) from public;
grant execute on function public.fsb_suggest(text, text, text, text, text) to anon, authenticated, service_role;

create function public.fsb_resume_start(p_name text, p_email text, p_note text, p_file_name text, p_mime text,
                                        p_size integer, p_client text default null, p_hp text default null)
returns text language plpgsql security definer set search_path to '' as $$
declare v_name text := btrim(coalesce(p_name, '')); v_email text := lower(btrim(coalesce(p_email, '')));
        v_note text := nullif(btrim(coalesce(p_note, '')), ''); v_ext text; v_path text; v_n integer;
begin
  if coalesce(p_hp, '') <> '' then return 'hp/' || gen_random_uuid()::text; end if;
  if p_client is null or p_client !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = 'PT400', message = 'fsb: missing client id'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception using errcode = 'PT400', message = 'fsb: name required'; end if;
  if char_length(v_email) > 254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' then
    raise exception using errcode = 'PT400', message = 'fsb: email required'; end if;
  if v_note is not null and char_length(v_note) > 500 then
    raise exception using errcode = 'PT400', message = 'fsb: note too long'; end if;
  v_ext := case p_mime when 'application/pdf' then 'pdf' when 'application/msword' then 'doc'
                       when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then 'docx' end;
  if v_ext is null or lower(coalesce(p_file_name, '')) !~ ('\.' || v_ext || '$') then
    raise exception using errcode = 'PT400', message = 'fsb: PDF, DOC or DOCX only'; end if;
  if p_size is null or p_size < 1 or p_size > 5242880 then
    raise exception using errcode = 'PT400', message = 'fsb: files up to 5 MB'; end if;
  perform pg_advisory_xact_lock(hashtextextended('fsb_resume:' || p_client, 0));
  select count(*) into v_n from public.fsb_resumes where client_hash = p_client and created_at > now() - interval '1 hour';
  if v_n >= 3 then raise exception using errcode = 'PT429', message = 'fsb: too many uploads, try again later'; end if;
  select count(*) into v_n from public.fsb_resumes where created_at > now() - interval '1 hour';
  if v_n >= 60 then raise exception using errcode = 'PT429', message = 'fsb: too many uploads, try again later'; end if;
  v_path := 'r/' || gen_random_uuid()::text || '.' || v_ext;
  insert into public.fsb_resumes (name, email, note, file_path, file_name, mime, size_bytes, client_hash)
  values (v_name, v_email, v_note, v_path, left(p_file_name, 120), p_mime, p_size, p_client);
  return v_path;
end $$;
revoke all on function public.fsb_resume_start(text, text, text, text, text, integer, text, text) from public;
grant execute on function public.fsb_resume_start(text, text, text, text, text, integer, text, text) to anon, authenticated, service_role;

create function public.fsb_resume_path_ok(p_path text) returns boolean
language sql stable security definer set search_path to '' as $$
  select exists (select 1 from public.fsb_resumes r
                 where r.file_path = p_path and r.uploaded_at is null and r.created_at > now() - interval '30 minutes');
$$;
revoke all on function public.fsb_resume_path_ok(text) from public;
grant execute on function public.fsb_resume_path_ok(text) to anon, authenticated, service_role;

create function public.fsb_resume_done(p_path text) returns boolean
language plpgsql security definer set search_path to '' as $$
declare v_ok boolean;
begin
  update public.fsb_resumes r set uploaded_at = now()
  where r.file_path = p_path and r.uploaded_at is null
    and exists (select 1 from storage.objects o where o.bucket_id = 'fsb-resumes' and o.name = p_path);
  get diagnostics v_ok = row_count;
  return v_ok;
end $$;
revoke all on function public.fsb_resume_done(text) from public;
grant execute on function public.fsb_resume_done(text) to anon, authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fsb-resumes', 'fsb-resumes', false, 5242880,
        array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document']);

create policy "fsb_resumes_anon_insert" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'fsb-resumes' and public.fsb_resume_path_ok(name));

commit;

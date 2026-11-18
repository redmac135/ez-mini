-- Run ONLY in a disposable, empty PostgreSQL 17 database as postgres.
-- This fixture creates roles and schemas and models the catalog observed in production.
\set ON_ERROR_STOP on
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create schema auth;
create schema blank;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth, blank to authenticated;
create table auth.users (id uuid primary key);
insert into auth.users values
  ('00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000003');
create table blank.pages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on update cascade on delete cascade,
  title text not null default '', content text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table blank.pages enable row level security;
create policy pages_select on blank.pages for select to authenticated using (auth.uid() = user_id);
create policy pages_insert on blank.pages for insert to authenticated with check (auth.uid() = user_id);
create policy pages_update on blank.pages for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger blank_pages_updated_at before update on blank.pages for each row execute function public.set_updated_at();
grant all privileges on blank.pages to anon, authenticated, service_role;
alter default privileges in schema blank grant select, insert, update on tables to authenticated;
-- Exercise separately granted column ACLs, including PUBLIC and anon grants.
grant select (title), insert (title), update (content), references (id) on blank.pages to public, anon, authenticated;
insert into blank.pages (id, user_id, title, content) values
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'existing', 'draft');
-- Prove the fixture's RLS restricts ordinary reads before the migration.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
do $$ begin
  if exists (select 1 from blank.pages) then raise exception 'fixture RLS leaked another user''s row'; end if;
  begin
    insert into blank.pages (user_id) values ('00000000-0000-0000-0000-000000000001');
    raise exception 'fixture RLS accepted cross-user insert';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
-- Execute the migration atomically, as required for a production cutover.
begin;
\ir ../migrations/20261117000000_blank_page_sync.sql
commit;

-- Validate effective privileges, owners, security-definer configuration, and default ACLs.
do $$
declare r text; p text; c record; f record;
begin
  if current_setting('server_version_num')::int / 10000 <> 17 then raise exception 'PostgreSQL 17 required'; end if;
  if not (select relrowsecurity and not relforcerowsecurity and pg_get_userbyid(relowner) = 'postgres' from pg_class where oid = 'blank.pages'::regclass) then raise exception 'pages ownership/RLS mismatch'; end if;
  if (select pg_get_userbyid(relowner) from pg_class where oid = 'blank.page_change_clock'::regclass) <> 'postgres' then raise exception 'clock ownership mismatch'; end if;
  for r in select unnest(array['anon', 'authenticated']) loop
    foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'] loop
      if has_table_privilege(r, 'blank.pages', p) then raise exception '% still has table %', r, p; end if;
      if has_table_privilege(r, 'blank.page_change_clock', p) then raise exception '% still has clock %', r, p; end if;
    end loop;
    for c in select attname from pg_attribute where attrelid = 'blank.pages'::regclass and attnum > 0 and not attisdropped loop
      foreach p in array array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES'] loop
        if has_column_privilege(r, 'blank.pages', c.attname, p) then raise exception '% still has column % on %', r, p, c.attname; end if;
      end loop;
    end loop;
  end loop;
  for f in select oid, proname, prosecdef, proconfig, proowner from pg_proc where oid in ('blank.sync_pages(text)'::regprocedure, 'blank.write_page(jsonb,bigint)'::regprocedure) loop
    if not f.prosecdef or pg_get_userbyid(f.proowner) <> 'postgres' or not ('search_path=""' = any(f.proconfig)) then raise exception 'unsafe function configuration: %', f.proname; end if;
    if not has_function_privilege('authenticated', f.oid, 'EXECUTE') or has_function_privilege('anon', f.oid, 'EXECUTE') then raise exception 'unsafe function grants: %', f.proname; end if;
  end loop;
  if not has_table_privilege('service_role', 'blank.pages', 'TRUNCATE') then raise exception 'privileged role access unexpectedly changed'; end if;
end $$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
do $$
declare result jsonb; payload jsonb := '{"id":"00000000-0000-0000-0000-000000000010","title":"existing","content":"changed","created_at":"2001-01-01T00:00:00Z","updated_at":"2001-01-01T00:00:00Z","deleted_at":null}';
begin
  result := blank.sync_pages(null);
  if result->>'cursor' <> '0' or jsonb_array_length(result->'pages') <> 1 or result->'pages'->0->>'content' <> 'draft' then raise exception 'existing full sync failed: %', result; end if;
  result := blank.write_page(payload, 1);
  if (result->>'conflict')::boolean or (result->'page'->>'revision')::int <> 2 or (result->'page'->>'updated_at')::timestamptz <> now() then raise exception 'update/trigger failed: %', result; end if;
  result := blank.sync_pages('0');
  if result->>'cursor' <> '1' or result->'pages'->0->>'content' <> 'changed' then raise exception 'delta failed: %', result; end if;
  begin truncate blank.pages; raise exception 'unsafe truncate succeeded'; exception when insufficient_privilege then null; end;
  begin delete from blank.pages; raise exception 'unsafe delete succeeded'; exception when insufficient_privilege then null; end;
  begin insert into blank.pages (title) values ('unsafe'); raise exception 'unsafe insert succeeded'; exception when insufficient_privilege then null; end;
  perform set_config('request.jwt.claim.sub', '', true);
  begin perform blank.sync_pages(null); raise exception 'unauthenticated sync succeeded'; exception when insufficient_privilege then null; end;
  begin perform blank.write_page(payload, 2); raise exception 'unauthenticated write succeeded'; exception when insufficient_privilege then null; end;
end $$;
rollback;

-- Existing regression suite covers CAS, cross-user access, tombstones and cursors.
\ir blank_page_sync.sql

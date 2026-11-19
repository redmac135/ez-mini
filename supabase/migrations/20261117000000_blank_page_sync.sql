-- The existing blank.pages table is provisioned separately. Run this migration before
-- deploying the revision-aware API. Direct client writes are disabled so every write
-- participates in compare-and-swap and the serialized change feed.
alter table blank.pages add column if not exists revision bigint not null default 1;
alter table blank.pages add column if not exists change_seq bigint not null default 0;

create table if not exists blank.page_change_clock (
  user_id uuid primary key,
  value bigint not null default 0
);
revoke all on blank.page_change_clock from public, anon, authenticated;
-- Legacy clients can also lose a draft during a timestamp-based pull. Disable
-- direct reads as well as writes while the old API and new migration overlap.
revoke all privileges on table blank.pages from public, anon, authenticated;
-- Table-level REVOKE does not remove separately granted column privileges.
do $$
declare columns_sql text;
begin
  select string_agg(format('%I', a.attname), ', ' order by a.attnum) into columns_sql
    from pg_catalog.pg_attribute a
    where a.attrelid = 'blank.pages'::regclass and a.attnum > 0 and not a.attisdropped;
  execute format('revoke select (%s), insert (%s), update (%s), references (%s) on blank.pages from public, anon, authenticated', columns_sql, columns_sql, columns_sql, columns_sql);
end;
$$;

create index if not exists blank_pages_user_change_idx on blank.pages (user_id, change_seq);

create or replace function blank.sync_pages(p_since text default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_cursor bigint;
  v_pages jsonb;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_since is not null and p_since !~ '^[0-9]+$' then
    raise exception 'invalid cursor' using errcode = '22023';
  end if;
  select coalesce((select value from blank.page_change_clock where user_id = v_user), 0)
    into v_cursor;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.change_seq, p.id), '[]'::jsonb)
    into v_pages from blank.pages p
    where p.user_id = v_user and (p_since is null or p.change_seq > p_since::bigint)
      and p.change_seq <= v_cursor;
  return jsonb_build_object('pages', v_pages, 'cursor', v_cursor::text);
end;
$$;

create or replace function blank.write_page(p_page jsonb, p_expected_revision bigint)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid := (p_page->>'id')::uuid;
  v_current blank.pages%rowtype;
  v_seq bigint;
begin
  if v_user is null then raise exception 'authentication required' using errcode = '42501'; end if;
  insert into blank.page_change_clock (user_id, value) values (v_user, 0)
    on conflict (user_id) do nothing;
  select value into v_seq from blank.page_change_clock where user_id = v_user for update;
  select * into v_current from blank.pages where id = v_id for update;
  if found then
    if v_current.user_id <> v_user then
      return jsonb_build_object('conflict', true, 'page', null);
    end if;
    if p_expected_revision is null or v_current.revision <> p_expected_revision then
      return jsonb_build_object('conflict', true, 'page', to_jsonb(v_current));
    end if;
  else
    if p_expected_revision is not null then
      return jsonb_build_object('conflict', true, 'page', null);
    end if;
  end if;
  -- Serialize accepted writes per account so sequence assignment follows commit order.
  update blank.page_change_clock set value = value + 1
    where user_id = v_user returning value into v_seq;
  if v_current.id is not null then
    update blank.pages set title = p_page->>'title', content = p_page->>'content',
      updated_at = (p_page->>'updated_at')::timestamptz,
      deleted_at = (p_page->>'deleted_at')::timestamptz,
      revision = revision + 1, change_seq = v_seq
      where id = v_id and user_id = v_user returning * into v_current;
  else
    insert into blank.pages (id, user_id, title, content, created_at, updated_at, deleted_at, revision, change_seq)
      values (v_id, v_user, p_page->>'title', p_page->>'content',
        (p_page->>'created_at')::timestamptz, (p_page->>'updated_at')::timestamptz,
        (p_page->>'deleted_at')::timestamptz, 1, v_seq)
      on conflict (id) do nothing returning * into v_current;
    if not found then return jsonb_build_object('conflict', true, 'page', null); end if;
  end if;
  return jsonb_build_object('conflict', false, 'page', to_jsonb(v_current));
end;
$$;
revoke all on function blank.sync_pages(text) from public, anon;
revoke all on function blank.write_page(jsonb, bigint) from public, anon;
grant execute on function blank.sync_pages(text) to authenticated;
grant execute on function blank.write_page(jsonb, bigint) to authenticated;

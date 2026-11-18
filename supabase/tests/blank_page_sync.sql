-- Run after the blank page sync migration in a disposable database, never production.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
do $$
declare
  result jsonb;
  cursor_before text;
  cursor_after_valid text;
  payload jsonb := '{"id":"00000000-0000-0000-0000-000000000002","title":"title","content":"first","created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z","deleted_at":null}';
begin
  result := blank.sync_pages(null);
  cursor_before := result->>'cursor';
  result := blank.write_page(payload, null);
  if (result->>'conflict')::boolean or (result->'page'->>'revision')::int <> 1 then raise exception 'create failed: %', result; end if;
  result := blank.write_page(jsonb_set(payload, '{content}', '"second"'), 1);
  if (result->>'conflict')::boolean or (result->'page'->>'revision')::int <> 2 then raise exception 'update failed: %', result; end if;
  result := blank.sync_pages(null);
  cursor_after_valid := result->>'cursor';
  result := blank.write_page(jsonb_set(payload, '{content}', '"stale"'), 1);
  if not (result->>'conflict')::boolean or result->'page'->>'content' <> 'second' then raise exception 'stale write accepted: %', result; end if;
  result := blank.sync_pages(cursor_after_valid);
  if jsonb_array_length(result->'pages') <> 0 or result->>'cursor' <> cursor_after_valid then raise exception 'stale write advanced cursor: %', result; end if;
  result := blank.sync_pages(cursor_before);
  if jsonb_array_length(result->'pages') <> 1 or result->'pages'->0->>'content' <> 'second' then raise exception 'delta failed: %', result; end if;
  result := blank.sync_pages(result->>'cursor');
  if jsonb_array_length(result->'pages') <> 0 then raise exception 'empty delta failed: %', result; end if;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000003', true);
  result := blank.sync_pages(null);
  if jsonb_array_length(result->'pages') <> 0 or result->>'cursor' <> '0' then raise exception 'cross-user read or cursor isolation failed: %', result; end if;
  result := blank.write_page(payload, null);
  if not (result->>'conflict')::boolean or result->'page' <> 'null'::jsonb then raise exception 'cross-user write: %', result; end if;
  result := blank.sync_pages(null);
  if result->>'cursor' <> '0' then raise exception 'cross-user conflict advanced cursor: %', result; end if;
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
  result := blank.write_page(jsonb_set(payload, '{deleted_at}', '"2026-01-02T00:00:00Z"'), 2);
  if (result->>'conflict')::boolean or result->'page'->>'deleted_at' is null then raise exception 'delete failed: %', result; end if;
  result := blank.write_page(payload, 2);
  if not (result->>'conflict')::boolean or result->'page'->>'deleted_at' is null then raise exception 'stale resurrection accepted: %', result; end if;
  begin
    perform * from blank.pages;
    raise exception 'unsafe direct read succeeded';
  exception when insufficient_privilege then null; end;
  begin
    update blank.pages set content = 'unsafe';
    raise exception 'unsafe direct write succeeded';
  exception when insufficient_privilege then null; end;
end $$;
rollback;

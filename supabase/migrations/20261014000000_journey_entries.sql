create schema if not exists journey;

grant usage on schema journey to authenticated, service_role;

create table if not exists journey.entries (
	 id uuid primary key,
	 user_id uuid not null references auth.users (id) on delete cascade,
	 text text not null default '',
	 created_at timestamptz not null,
	 updated_at timestamptz not null,
	 deleted_at timestamptz,
	 constraint journey_entries_text_length check (char_length(text) <= 100000)
);

create index if not exists journey_entries_user_created_idx
	on journey.entries (user_id, created_at, id);

create index if not exists journey_entries_user_updated_idx
	on journey.entries (user_id, updated_at);

alter table journey.entries enable row level security;

drop policy if exists "Users can read their Journey entries" on journey.entries;
create policy "Users can read their Journey entries"
	on journey.entries for select to authenticated
	using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their Journey entries" on journey.entries;
create policy "Users can insert their Journey entries"
	on journey.entries for insert to authenticated
	with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their Journey entries" on journey.entries;
create policy "Users can update their Journey entries"
	on journey.entries for update to authenticated
	using ((select auth.uid()) = user_id)
	with check ((select auth.uid()) = user_id);

grant select, insert, update on journey.entries to authenticated;
revoke all on journey.entries from anon;

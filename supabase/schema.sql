-- Bonjour Flashcards: private per-user data model.
-- Run this once in Supabase Dashboard -> SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_id uuid not null,
  front text not null check (char_length(trim(front)) between 1 and 5000),
  back text not null check (char_length(trim(back)) between 1 and 10000),
  schedule jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (deck_id, user_id) references public.decks(id, user_id) on delete cascade
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id uuid not null,
  deck_id uuid not null,
  reviewed_at timestamptz not null default now(),
  rating smallint not null check (rating between 1 and 4),
  was_new boolean not null default false,
  log jsonb,
  foreign key (card_id, user_id) references public.cards(id, user_id) on delete cascade,
  foreign key (deck_id, user_id) references public.decks(id, user_id) on delete cascade
);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  new_per_day integer not null default 15 check (new_per_day between 0 and 100),
  retention numeric not null default 0.9 check (retention between 0.8 and 0.97),
  updated_at timestamptz not null default now()
);

create index if not exists decks_user_id_idx on public.decks(user_id);
create index if not exists cards_user_id_idx on public.cards(user_id);
create index if not exists cards_deck_id_idx on public.cards(deck_id);
create index if not exists reviews_user_id_idx on public.reviews(user_id);
create index if not exists reviews_card_id_idx on public.reviews(card_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists decks_set_updated_at on public.decks;
create trigger decks_set_updated_at before update on public.decks
for each row execute function public.set_updated_at();
drop trigger if exists cards_set_updated_at on public.cards;
create trigger cards_set_updated_at before update on public.cards
for each row execute function public.set_updated_at();
drop trigger if exists settings_set_updated_at on public.user_settings;
create trigger settings_set_updated_at before update on public.user_settings
for each row execute function public.set_updated_at();

alter table public.decks enable row level security;
alter table public.cards enable row level security;
alter table public.reviews enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists "decks own rows" on public.decks;
create policy "decks own rows" on public.decks for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "cards own rows" on public.cards;
create policy "cards own rows" on public.cards for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "reviews own rows" on public.reviews;
create policy "reviews own rows" on public.reviews for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "settings own row" on public.user_settings;
create policy "settings own row" on public.user_settings for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.decks to authenticated;
grant select, insert, update, delete on public.cards to authenticated;
grant select, insert, update, delete on public.reviews to authenticated;
grant select, insert, update, delete on public.user_settings to authenticated;

-- AI card templates, private to each authenticated account.
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  front_prompt text not null check (char_length(trim(front_prompt)) between 1 and 6000),
  back_prompt text not null check (char_length(trim(back_prompt)) between 1 and 6000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index if not exists templates_user_id_idx on public.templates(user_id);

drop trigger if exists templates_set_updated_at on public.templates;
create trigger templates_set_updated_at before update on public.templates
for each row execute function public.set_updated_at();

alter table public.templates enable row level security;

drop policy if exists "templates own rows" on public.templates;
create policy "templates own rows" on public.templates for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.templates to authenticated;

-- Shared AI usage for the two authenticated accounts.
-- Re-running this section is safe.
create table if not exists public.ai_usage_daily (
  usage_date date primary key,
  ai_requests integer not null default 0 check (ai_requests >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  edge_invocations integer not null default 0 check (edge_invocations >= 0),
  updated_at timestamptz not null default now()
);

alter table public.ai_usage_daily enable row level security;
revoke all on public.ai_usage_daily from anon, authenticated;

-- The future AI Edge Function calls this atomically before contacting Gemini.
-- The 100 request limit is shared by Vlad and Andreea.
create or replace function public.claim_ai_generation()
returns table (allowed boolean, used_today integer, remaining_today integer)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  today_in_bucharest date := (now() at time zone 'Europe/Bucharest')::date;
  current_usage integer;
begin
  insert into public.ai_usage_daily (usage_date)
  values (today_in_bucharest)
  on conflict (usage_date) do nothing;

  select ai_requests
  into current_usage
  from public.ai_usage_daily
  where usage_date = today_in_bucharest
  for update;

  update public.ai_usage_daily
  set edge_invocations = edge_invocations + 1,
      updated_at = now()
  where usage_date = today_in_bucharest;

  if current_usage >= 100 then
    return query select false, current_usage, 0;
    return;
  end if;

  current_usage := current_usage + 1;
  update public.ai_usage_daily
  set ai_requests = current_usage,
      updated_at = now()
  where usage_date = today_in_bucharest;

  return query select true, current_usage, 100 - current_usage;
end;
$$;

-- Called after Gemini responds, using the usageMetadata returned by the API.
create or replace function public.record_ai_result(
  p_input_tokens integer,
  p_output_tokens integer
)
returns void
language sql
security definer
set search_path = public, pg_catalog
as $$
  update public.ai_usage_daily
  set input_tokens = input_tokens + greatest(p_input_tokens, 0),
      output_tokens = output_tokens + greatest(p_output_tokens, 0),
      updated_at = now()
  where usage_date = (now() at time zone 'Europe/Bucharest')::date;
$$;

-- Safe aggregate exposed to either authenticated account.
create or replace function public.get_shared_usage()
returns table (
  ai_today integer,
  ai_this_month bigint,
  daily_limit integer,
  input_tokens_this_month bigint,
  output_tokens_this_month bigint,
  edge_invocations_this_month bigint,
  database_bytes bigint,
  database_rows bigint
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with period as (
    select
      (now() at time zone 'Europe/Bucharest')::date as today,
      date_trunc('month', now() at time zone 'Europe/Bucharest')::date as month_start
  )
  select
    coalesce((
      select ai_requests
      from public.ai_usage_daily, period
      where usage_date = period.today
    ), 0)::integer,
    coalesce((
      select sum(ai_requests)
      from public.ai_usage_daily, period
      where usage_date >= period.month_start
    ), 0)::bigint,
    100::integer,
    coalesce((
      select sum(input_tokens)
      from public.ai_usage_daily, period
      where usage_date >= period.month_start
    ), 0)::bigint,
    coalesce((
      select sum(output_tokens)
      from public.ai_usage_daily, period
      where usage_date >= period.month_start
    ), 0)::bigint,
    coalesce((
      select sum(edge_invocations)
      from public.ai_usage_daily, period
      where usage_date >= period.month_start
    ), 0)::bigint,
    (
      coalesce(pg_total_relation_size(to_regclass('public.decks')), 0) +
      coalesce(pg_total_relation_size(to_regclass('public.cards')), 0) +
      coalesce(pg_total_relation_size(to_regclass('public.reviews')), 0) +
      coalesce(pg_total_relation_size(to_regclass('public.user_settings')), 0) +
      coalesce(pg_total_relation_size(to_regclass('public.ai_usage_daily')), 0) +
      coalesce(pg_total_relation_size(to_regclass('public.templates')), 0)
    )::bigint,
    (
      (select count(*) from public.decks) +
      (select count(*) from public.cards) +
      (select count(*) from public.reviews) +
      (select count(*) from public.user_settings) +
      (select count(*) from public.ai_usage_daily) +
      (select count(*) from public.templates)
    )::bigint;
$$;

revoke all on function public.claim_ai_generation() from public, anon, authenticated;
revoke all on function public.record_ai_result(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_ai_generation() to service_role;
grant execute on function public.record_ai_result(integer, integer) to service_role;

revoke all on function public.get_shared_usage() from public, anon;
grant execute on function public.get_shared_usage() to authenticated;

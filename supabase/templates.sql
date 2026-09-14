-- Run this once in Supabase Dashboard -> SQL Editor.

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

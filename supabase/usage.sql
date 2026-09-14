-- Run this once in Supabase Dashboard -> SQL Editor.

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
      coalesce(pg_total_relation_size(to_regclass('public.ai_usage_daily')), 0)
    )::bigint,
    (
      (select count(*) from public.decks) +
      (select count(*) from public.cards) +
      (select count(*) from public.reviews) +
      (select count(*) from public.user_settings) +
      (select count(*) from public.ai_usage_daily)
    )::bigint;
$$;

revoke all on function public.claim_ai_generation() from public, anon, authenticated;
revoke all on function public.record_ai_result(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_ai_generation() to service_role;
grant execute on function public.record_ai_result(integer, integer) to service_role;

revoke all on function public.get_shared_usage() from public, anon;
grant execute on function public.get_shared_usage() to authenticated;

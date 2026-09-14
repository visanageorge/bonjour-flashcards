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

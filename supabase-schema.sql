-- ReStock Supabase Schema — Safe to re-run
-- Paste this in Supabase → SQL Editor → Run

-- ── Drop existing (clean slate) ───────────────────────────────────────────────
drop trigger  if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop table if exists public.market_list cascade;
drop table if exists public.barcodes    cascade;
drop table if exists public.variants    cascade;
drop table if exists public.products    cascade;
drop table if exists public.brands      cascade;
drop table if exists public.profiles    cascade;

-- ── Profiles ──────────────────────────────────────────────────────────────────
create table public.profiles (
  id                    uuid primary key references auth.users(id) on delete cascade,
  market_name           text        not null default 'My Store',
  appearance            text        not null default 'light'
                          check (appearance in ('light','dark','system')),
  print_header_default  boolean     not null default false,
  print_show_store_name boolean     not null default false,
  print_show_date       boolean     not null default false,
  updated_at            timestamptz not null default now()
);

-- Auto-create profile when a new user signs up
create function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Brands ────────────────────────────────────────────────────────────────────
create table public.brands (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users(id) on delete cascade,
  name          text        not null,
  logo_url      text,
  print_enabled boolean     not null default true,
  created_at    timestamptz not null default now()
);
create index brands_user_idx on public.brands(user_id);

-- ── Products ──────────────────────────────────────────────────────────────────
create table public.products (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  brand_id   uuid        not null references public.brands(id)   on delete cascade,
  name       text        not null,
  image_url  text,
  created_at timestamptz not null default now()
);
create index products_user_idx  on public.products(user_id);
create index products_brand_idx on public.products(brand_id);

-- ── Variants ──────────────────────────────────────────────────────────────────
create table public.variants (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users(id) on delete cascade,
  product_id uuid        not null references public.products(id) on delete cascade,
  name       text        not null,
  created_at timestamptz not null default now()
);
create index variants_user_idx    on public.variants(user_id);
create index variants_product_idx on public.variants(product_id);

-- ── Barcodes ──────────────────────────────────────────────────────────────────
create table public.barcodes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  barcode    text not null,
  variant_id uuid references public.variants(id) on delete set null,
  constraint barcodes_user_barcode_unique unique (user_id, barcode)
);
create index barcodes_user_idx on public.barcodes(user_id);

-- ── Market List ───────────────────────────────────────────────────────────────
create table public.market_list (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  variant_id   uuid        not null references public.variants(id) on delete cascade,
  added_at     timestamptz not null default now(),
  completed_at timestamptz
);
create index market_list_user_idx on public.market_list(user_id);
create index market_list_active   on public.market_list(user_id, completed_at)
  where completed_at is null;

-- ── Row Level Security ────────────────────────────────────────────────────────
alter table public.profiles    enable row level security;
alter table public.brands      enable row level security;
alter table public.products    enable row level security;
alter table public.variants    enable row level security;
alter table public.barcodes    enable row level security;
alter table public.market_list enable row level security;

create policy "own profile"     on public.profiles    for all using (auth.uid() = id);
create policy "own brands"      on public.brands      for all using (auth.uid() = user_id);
create policy "own products"    on public.products    for all using (auth.uid() = user_id);
create policy "own variants"    on public.variants    for all using (auth.uid() = user_id);
create policy "own barcodes"    on public.barcodes    for all using (auth.uid() = user_id);
create policy "own market_list" on public.market_list for all using (auth.uid() = user_id);

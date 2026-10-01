-- =====================================================================
-- Solo Multi-Board Kanban — schema.sql
-- Run in Supabase Dashboard > SQL Editor
-- =====================================================================
create extension if not exists "pgcrypto";

-- ---------- Enums ----------
do $$ begin
  create type card_priority as enum ('low','medium','high','urgent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type energy_level as enum ('low','medium','high');
exception when duplicate_object then null; end $$;

-- ---------- Profiles (role: Admin auto-assigned) ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'Admin',
  created_at timestamptz not null default now()
);

-- ---------- Boards ----------
create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null check (char_length(name) between 1 and 80),
  description text,
  is_pinned boolean not null default false,
  is_archived boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists boards_user_idx on public.boards(user_id, is_archived);

-- ---------- Columns ----------
create table if not exists public.columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null,
  order_index double precision not null default 0,
  wip_limit int check (wip_limit is null or wip_limit > 0)
);
create index if not exists columns_board_idx on public.columns(board_id, order_index);

-- ---------- Cards ----------
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  column_id uuid not null references public.columns(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  title text not null,
  description text,
  priority card_priority not null default 'medium',
  energy_level energy_level not null default 'medium',
  due_date date,
  color text,                                       -- optional card colour key; null = inherit column colour
  subtasks jsonb not null default '[]'::jsonb,     -- [{ "id": "...", "title": "...", "done": false }]
  order_index double precision not null default 0, -- fractional indexing: single-row reorders
  created_at timestamptz not null default now()
);
create index if not exists cards_column_idx on public.cards(column_id, order_index);
create index if not exists cards_board_idx on public.cards(board_id);

-- ---------- Row Level Security ----------
alter table public.profiles enable row level security;
alter table public.boards   enable row level security;
alter table public.columns  enable row level security;
alter table public.cards    enable row level security;

drop policy if exists "profiles_self" on public.profiles;
create policy "profiles_self" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "boards_owner" on public.boards;
create policy "boards_owner" on public.boards
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "columns_owner" on public.columns;
create policy "columns_owner" on public.columns
  for all
  using (exists (select 1 from public.boards b where b.id = columns.board_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.boards b where b.id = columns.board_id and b.user_id = auth.uid()));

drop policy if exists "cards_owner" on public.cards;
create policy "cards_owner" on public.cards
  for all
  using (user_id = auth.uid()
         and exists (select 1 from public.boards b where b.id = cards.board_id and b.user_id = auth.uid()))
  with check (user_id = auth.uid()
         and exists (select 1 from public.boards b where b.id = cards.board_id and b.user_id = auth.uid()));

-- ---------- Signup trigger: profile + default board + columns ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_board_id uuid;
begin
  insert into public.profiles (id, email, role) values (new.id, new.email, 'Admin');

  insert into public.boards (user_id, name, description, is_pinned)
  values (new.id, 'Main Operations', 'Your default workspace', true)
  returning id into new_board_id;

  insert into public.columns (board_id, name, order_index, wip_limit) values
    (new_board_id, 'Backlog',     1000, null),
    (new_board_id, 'Up Next',     2000, null),
    (new_board_id, 'In Progress', 3000, 3),
    (new_board_id, 'Blocked',     4000, null),
    (new_board_id, 'Done',        5000, null);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- Card attachments: private Storage bucket + metadata table. Run once in the Supabase SQL Editor.

-- 1) Private bucket, 10 MB per file
insert into storage.buckets (id, name, public, file_size_limit)
values ('card-attachments', 'card-attachments', false, 10485760)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

-- 2) Metadata table (rows disappear with their card/board; files are removed by the app's delete actions)
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  path text not null,
  mime_type text,
  size bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists attachments_card_idx on public.attachments(card_id);
create index if not exists attachments_board_idx on public.attachments(board_id);

alter table public.attachments enable row level security;
drop policy if exists "attachments_owner" on public.attachments;
create policy "attachments_owner" on public.attachments
  for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.cards c where c.id = attachments.card_id and c.user_id = auth.uid())
  );

-- 3) Storage policies: each user may only touch files under their own  <user_id>/  folder
drop policy if exists "card_att_select" on storage.objects;
create policy "card_att_select" on storage.objects for select to authenticated
  using (bucket_id = 'card-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "card_att_insert" on storage.objects;
create policy "card_att_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'card-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "card_att_delete" on storage.objects;
create policy "card_att_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'card-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

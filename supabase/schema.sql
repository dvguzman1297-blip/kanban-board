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
  first_name text,
  last_name text,
  full_name text,
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
  first_name_value text;
  last_name_value text;
  full_name_value text;
begin
  first_name_value := nullif(trim(new.raw_user_meta_data->>'first_name'), '');
  last_name_value := nullif(trim(new.raw_user_meta_data->>'last_name'), '');
  full_name_value := nullif(trim(new.raw_user_meta_data->>'full_name'), '');
  if full_name_value is null then
    full_name_value := nullif(trim(concat_ws(' ', first_name_value, last_name_value)), '');
  end if;
  insert into public.profiles (id, email, role, first_name, last_name, full_name)
  values (new.id, new.email, 'Admin', first_name_value, last_name_value, full_name_value);

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


-- Powers the "Velocity" stat: when a card entered the Done column.
alter table public.cards add column if not exists completed_at timestamptz;

-- Backfill: cards already sitting in Done count as completed when they were created
update public.cards c
   set completed_at = c.created_at
  from public.columns col
 where col.id = c.column_id
   and lower(trim(col.name)) = 'done'
   and c.completed_at is null;


-- Activity feed + "last updated" for the home dashboard. Run once in the Supabase SQL Editor.
create table if not exists public.activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  board_id uuid,                -- no FK on purpose: cleaned up by the board-delete trigger below
  card_id uuid,                 -- no FK, so history survives card deletion
  card_title text,
  kind text not null check (kind in ('card_created','card_moved','card_completed','board_created')),
  from_column text,
  to_column text,
  created_at timestamptz not null default now()
);
create index if not exists activity_user_idx  on public.activity(user_id, created_at desc);
create index if not exists activity_board_idx on public.activity(board_id, created_at desc);

alter table public.activity enable row level security;
drop policy if exists "activity_read_own" on public.activity;
create policy "activity_read_own" on public.activity for select using (user_id = auth.uid());
-- (no insert policy: rows are written only by the security-definer triggers below)

create or replace function public.log_card_activity() returns trigger
language plpgsql security definer set search_path = public as $$
declare to_name text; from_name text;
begin
  if tg_op = 'INSERT' then
    select name into to_name from public.columns where id = new.column_id;
    insert into public.activity (user_id, board_id, card_id, card_title, kind, to_column)
    values (new.user_id, new.board_id, new.id, new.title, 'card_created', to_name);
  elsif tg_op = 'UPDATE' and new.column_id is distinct from old.column_id then
    select name into from_name from public.columns where id = old.column_id;
    select name into to_name   from public.columns where id = new.column_id;
    insert into public.activity (user_id, board_id, card_id, card_title, kind, from_column, to_column)
    values (new.user_id, new.board_id, new.id, new.title,
            case when lower(trim(coalesce(to_name, ''))) = 'done' then 'card_completed' else 'card_moved' end,
            from_name, to_name);
  end if;
  return null;
end $$;

-- ---------- FlowDeck collaboration and card discussion ----------
alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists full_name text;

update public.profiles p
   set full_name = nullif(trim(coalesce(u.raw_user_meta_data->>'full_name', '')), ''),
       first_name = nullif(trim(coalesce(
         u.raw_user_meta_data->>'first_name',
         split_part(trim(coalesce(u.raw_user_meta_data->>'full_name', '')), ' ', 1)
       )), '')
  from auth.users u
 where u.id = p.id;

alter table public.cards add column if not exists start_date date;

create or replace function public.protect_card_board_identity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is distinct from old.user_id or new.board_id is distinct from old.board_id then
    raise exception 'Card ownership and board cannot be changed';
  end if;
  if not exists (select 1 from public.columns c where c.id = new.column_id and c.board_id = new.board_id) then
    raise exception 'Card column must belong to its board';
  end if;
  return new;
end;
$$;

drop trigger if exists cards_protect_board_identity on public.cards;
create trigger cards_protect_board_identity before update on public.cards
  for each row execute function public.protect_card_board_identity();

create table if not exists public.board_members (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'editor', 'viewer')),
  invited_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  unique (board_id, user_id)
);
create index if not exists board_members_user_idx on public.board_members(user_id, status);

create table if not exists public.board_invites (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'editor', 'viewer')),
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);
create index if not exists board_invites_board_idx on public.board_invites(board_id);

create table if not exists public.card_comments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(trim(content)) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists card_comments_card_idx on public.card_comments(card_id, created_at);

create or replace function public.is_board_owner(target_board_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.boards b where b.id = target_board_id and b.user_id = auth.uid());
$$;

create or replace function public.is_board_member(target_board_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_board_owner(target_board_id) or exists (
    select 1 from public.board_members m
     where m.board_id = target_board_id and m.user_id = auth.uid() and m.status = 'accepted'
  );
$$;

create or replace function public.can_edit_board(target_board_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_board_owner(target_board_id) or exists (
    select 1 from public.board_members m
     where m.board_id = target_board_id and m.user_id = auth.uid()
       and m.status = 'accepted' and m.role in ('admin', 'editor')
  );
$$;

create or replace function public.can_admin_board(target_board_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_board_owner(target_board_id) or exists (
    select 1 from public.board_members m
     where m.board_id = target_board_id and m.user_id = auth.uid()
       and m.status = 'accepted' and m.role = 'admin'
  );
$$;

create or replace function public.can_view_profile(target_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select target_user_id = auth.uid() or exists (
    select 1
      from public.boards b
     where public.is_board_member(b.id)
       and (b.user_id = target_user_id or exists (
         select 1 from public.board_members m
          where m.board_id = b.id and m.user_id = target_user_id and m.status = 'accepted'
       ))
  );
$$;

alter table public.board_members enable row level security;
alter table public.board_invites enable row level security;
alter table public.card_comments enable row level security;

drop policy if exists "boards_owner" on public.boards;
drop policy if exists "boards_member_read" on public.boards;
drop policy if exists "boards_owner_insert" on public.boards;
drop policy if exists "boards_admin_update" on public.boards;
drop policy if exists "boards_owner_delete" on public.boards;
create policy "boards_member_read" on public.boards for select using (public.is_board_member(id));
create policy "boards_owner_insert" on public.boards for insert with check (user_id = auth.uid());
create policy "boards_admin_update" on public.boards for update using (public.can_admin_board(id)) with check (public.can_admin_board(id));
create policy "boards_owner_delete" on public.boards for delete using (public.is_board_owner(id));

drop policy if exists "columns_owner" on public.columns;
drop policy if exists "columns_member_read" on public.columns;
drop policy if exists "columns_editor_write" on public.columns;
create policy "columns_member_read" on public.columns for select using (public.is_board_member(board_id));
create policy "columns_editor_write" on public.columns for all
  using (public.can_edit_board(board_id)) with check (public.can_edit_board(board_id));

drop policy if exists "cards_owner" on public.cards;
drop policy if exists "cards_member_read" on public.cards;
drop policy if exists "cards_editor_insert" on public.cards;
drop policy if exists "cards_editor_update" on public.cards;
drop policy if exists "cards_editor_delete" on public.cards;
create policy "cards_member_read" on public.cards for select using (public.is_board_member(board_id));
create policy "cards_editor_insert" on public.cards for insert
  with check (user_id = auth.uid() and public.can_edit_board(board_id));
create policy "cards_editor_update" on public.cards for update
  using (public.can_edit_board(board_id)) with check (public.can_edit_board(board_id));
create policy "cards_editor_delete" on public.cards for delete using (public.can_edit_board(board_id));

drop policy if exists "board_members_read" on public.board_members;
drop policy if exists "board_members_owner_insert" on public.board_members;
drop policy if exists "board_members_invite_accept" on public.board_members;
drop policy if exists "board_members_owner_update" on public.board_members;
drop policy if exists "board_members_owner_delete" on public.board_members;
create policy "board_members_read" on public.board_members for select
  using (user_id = auth.uid() or public.can_admin_board(board_id));
create policy "board_members_owner_insert" on public.board_members for insert
  with check (public.is_board_owner(board_id));
create policy "board_members_invite_accept" on public.board_members for insert
  with check (
    user_id = auth.uid() and status = 'accepted' and exists (
      select 1 from public.board_invites i
       where i.board_id = board_members.board_id
         and lower(i.email) = lower(auth.jwt()->>'email')
         and i.role = board_members.role and i.expires_at > now()
    )
  );
create policy "board_members_owner_update" on public.board_members for update
  using (public.is_board_owner(board_id)) with check (public.is_board_owner(board_id));
create policy "board_members_owner_delete" on public.board_members for delete
  using (public.is_board_owner(board_id));

drop policy if exists "board_invites_owner_manage" on public.board_invites;
drop policy if exists "board_invites_invitee_read" on public.board_invites;
drop policy if exists "board_invites_invitee_delete" on public.board_invites;
create policy "board_invites_owner_manage" on public.board_invites for all
  using (public.is_board_owner(board_id)) with check (public.is_board_owner(board_id));
create policy "board_invites_invitee_read" on public.board_invites for select
  using (lower(email) = lower(auth.jwt()->>'email'));
create policy "board_invites_invitee_delete" on public.board_invites for delete
  using (lower(email) = lower(auth.jwt()->>'email'));

drop policy if exists "card_comments_member_read" on public.card_comments;
drop policy if exists "card_comments_member_insert" on public.card_comments;
drop policy if exists "card_comments_author_update" on public.card_comments;
drop policy if exists "card_comments_author_delete" on public.card_comments;
create policy "card_comments_member_read" on public.card_comments for select using (
  exists (select 1 from public.cards c where c.id = card_id and public.is_board_member(c.board_id))
);
create policy "card_comments_member_insert" on public.card_comments for insert with check (
  user_id = auth.uid() and exists (
    select 1 from public.cards c where c.id = card_id and public.is_board_member(c.board_id)
  )
);
create policy "card_comments_author_update" on public.card_comments for update
  using (user_id = auth.uid() and exists (
    select 1 from public.cards c where c.id = card_id and public.is_board_member(c.board_id)
  ))
  with check (user_id = auth.uid() and exists (
    select 1 from public.cards c where c.id = card_id and public.is_board_member(c.board_id)
  ));
create policy "card_comments_author_delete" on public.card_comments for delete
  using (user_id = auth.uid());

drop policy if exists "profiles_shared_read" on public.profiles;
create policy "profiles_shared_read" on public.profiles for select using (public.can_view_profile(id));

drop policy if exists "attachments_owner" on public.attachments;
drop policy if exists "attachments_member_read" on public.attachments;
drop policy if exists "attachments_editor_insert" on public.attachments;
drop policy if exists "attachments_editor_delete" on public.attachments;
create policy "attachments_member_read" on public.attachments for select using (public.is_board_member(board_id));
create policy "attachments_editor_insert" on public.attachments for insert with check (
  user_id = auth.uid() and public.can_edit_board(board_id)
  and exists (select 1 from public.cards c where c.id = attachments.card_id and c.board_id = attachments.board_id)
);
create policy "attachments_editor_delete" on public.attachments for delete
  using (public.can_edit_board(board_id));

drop policy if exists "activity_read_own" on public.activity;
create policy "activity_read_own" on public.activity for select
  using (user_id = auth.uid() or (board_id is not null and public.is_board_member(board_id)));

drop policy if exists "card_att_select" on storage.objects;
drop policy if exists "card_att_insert" on storage.objects;
drop policy if exists "card_att_delete" on storage.objects;
create policy "card_att_select" on storage.objects for select to authenticated using (
  bucket_id = 'card-attachments' and exists (
    select 1 from public.cards c
     where c.id::text = (storage.foldername(name))[2] and public.is_board_member(c.board_id)
  )
);
create policy "card_att_insert" on storage.objects for insert to authenticated with check (
  bucket_id = 'card-attachments' and (storage.foldername(name))[1] = auth.uid()::text and exists (
    select 1 from public.cards c
     where c.id::text = (storage.foldername(name))[2] and public.can_edit_board(c.board_id)
  )
);
create policy "card_att_delete" on storage.objects for delete to authenticated using (
  bucket_id = 'card-attachments' and exists (
    select 1 from public.cards c
     where c.id::text = (storage.foldername(name))[2] and public.can_edit_board(c.board_id)
  )
);

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'card_comments'
     ) then
    alter publication supabase_realtime add table public.card_comments;
  end if;
end $$;

drop trigger if exists cards_activity on public.cards;
create trigger cards_activity after insert or update on public.cards
  for each row execute function public.log_card_activity();

create or replace function public.log_board_activity() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activity (user_id, board_id, kind) values (new.user_id, new.id, 'board_created');
  elsif tg_op = 'DELETE' then
    delete from public.activity where board_id = old.id;
  end if;
  return null;
end $$;

drop trigger if exists boards_activity on public.boards;
create trigger boards_activity after insert or delete on public.boards
  for each row execute function public.log_board_activity();

-- One-time backfill so the feed isn't empty on day one
do $$
begin
  if not exists (select 1 from public.activity) then
    insert into public.activity (user_id, board_id, card_id, card_title, kind, to_column, created_at)
    select c.user_id, c.board_id, c.id, c.title, 'card_created', col.name, c.created_at
      from public.cards c join public.columns col on col.id = c.column_id;
    insert into public.activity (user_id, board_id, card_id, card_title, kind, to_column, created_at)
    select c.user_id, c.board_id, c.id, c.title, 'card_completed', col.name, c.completed_at
      from public.cards c join public.columns col on col.id = c.column_id
     where c.completed_at is not null;
  end if;
end $$;

-- ---------- Account & profile settings (migration 008) ----------
-- Account & profile settings: extra profile columns, preferences, avatar storage.
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists job_title text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists default_board_id uuid references public.boards(id) on delete set null;
alter table public.profiles add column if not exists theme text not null default 'dark';
alter table public.profiles add column if not exists notify_invites boolean not null default true;
alter table public.profiles add column if not exists notify_mentions boolean not null default true;
alter table public.profiles add column if not exists notify_assignments boolean not null default true;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

do $$ begin
  alter table public.profiles add constraint profiles_theme_check check (theme in ('system','dark','light'));
exception when duplicate_object then null; end $$;

create or replace function public.touch_profile_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute function public.touch_profile_updated_at();

-- RLS: "profiles_self" (id = auth.uid()) already covers read/update of the user's own row.

-- Avatars: public-read bucket (so <img> works), writes limited to the user's own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

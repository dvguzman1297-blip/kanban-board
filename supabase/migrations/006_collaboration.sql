-- Collaboration, invitations, profile display names, and card discussion.

alter table public.profiles add column if not exists first_name text;
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

-- Board visibility and mutations follow accepted membership roles.
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

-- Owners administer the roster. Invitees can read their own invitation and accept it only
-- when the token's email, role, board, and expiry all match their authenticated identity.
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

-- Any board member may discuss a card; only the comment author may edit or delete it.
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

-- Names are visible only to the user and people who share an accepted board.
drop policy if exists "profiles_shared_read" on public.profiles;
create policy "profiles_shared_read" on public.profiles for select using (public.can_view_profile(id));

-- Attachments are shared with board members; writes remain limited to editors.
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

-- Activity can be read by everyone who can see the associated board.
drop policy if exists "activity_read_own" on public.activity;
create policy "activity_read_own" on public.activity for select
  using (user_id = auth.uid() or (board_id is not null and public.is_board_member(board_id)));

-- Files live under <uploader-id>/<card-id>/; sharing follows the card's board.
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

-- Realtime is used by the card discussion stream. Keep migration safe if already published.
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

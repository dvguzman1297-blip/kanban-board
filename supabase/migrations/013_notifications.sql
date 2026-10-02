-- In-app notifications, including board invitations that can be accepted or declined in the app.

do $$ begin
  create type notification_type as enum ('board_invite', 'card_assigned', 'comment_mention', 'system');
exception when duplicate_object then null; end $$;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type notification_type not null default 'system',
  title text not null,
  message text not null default '',
  -- board_invite: { board_id, board_name, invite_id, inviter_id, inviter_name, role, status? }
  -- card_assigned: { board_id, card_id, card_title, assigner_name }
  -- status (invites only): 'accepted' | 'declined' | 'cancelled'
  metadata jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications(user_id) where not is_read;
create index if not exists notifications_invite_idx on public.notifications((metadata->>'invite_id'));

alter table public.notifications enable row level security;
drop policy if exists "notifications_own_read" on public.notifications;
drop policy if exists "notifications_own_update" on public.notifications;
drop policy if exists "notifications_own_delete" on public.notifications;
create policy "notifications_own_read" on public.notifications for select using (user_id = auth.uid());
create policy "notifications_own_update" on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications_own_delete" on public.notifications for delete using (user_id = auth.uid());
-- No insert policy: rows are created only by the security-definer triggers below.

-- Same helper as migration 010 (re-declared so this file stands alone).
create or replace function public.profile_label(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(display_name), ''), nullif(trim(full_name), ''), nullif(trim(first_name), ''), email)
    from public.profiles where id = uid;
$$;

-- ---------- Invitation sent -> notify the invitee if they already have an account ----------
create or replace function public.notify_board_invite() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  invitee uuid;
  inviter uuid := auth.uid();
  board_title text;
  inviter_label text;
begin
  select id into invitee from auth.users where lower(email) = lower(new.email) limit 1;
  if invitee is null or invitee = inviter then return new; end if;

  select name into board_title from public.boards where id = new.board_id;
  inviter_label := coalesce(public.profile_label(inviter), 'Someone');

  insert into public.notifications (user_id, type, title, message, metadata)
  values (invitee, 'board_invite', 'Board invitation',
          inviter_label || ' invited you to collaborate on ' || coalesce(board_title, 'a board') || ' as ' ||
            case new.role when 'viewer' then 'Viewer' when 'admin' then 'Admin' else 'Editor' end,
          jsonb_build_object('board_id', new.board_id, 'board_name', board_title, 'invite_id', new.id,
                             'inviter_id', inviter, 'inviter_name', inviter_label, 'role', new.role));
  return new;
end $$;

drop trigger if exists board_invites_notify on public.board_invites;
create trigger board_invites_notify after insert on public.board_invites
  for each row execute function public.notify_board_invite();

-- Invitation withdrawn by the owner (deleted while still unanswered) -> show it as cancelled.
-- Accept/decline set the status first, so those are left alone.
create or replace function public.cancel_invite_notification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.notifications
     set metadata = metadata || '{"status":"cancelled"}'::jsonb, is_read = true
   where type = 'board_invite' and metadata->>'invite_id' = old.id::text and not (metadata ? 'status');
  return old;
end $$;

drop trigger if exists board_invites_cancel_notification on public.board_invites;
create trigger board_invites_cancel_notification after delete on public.board_invites
  for each row execute function public.cancel_invite_notification();

-- ---------- Card assigned to someone else -> notify them ----------
create or replace function public.notify_card_assigned() returns trigger
language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid();
begin
  if new.assignee_id is null or new.assignee_id is not distinct from old.assignee_id or new.assignee_id = actor then
    return null;
  end if;
  insert into public.notifications (user_id, type, title, message, metadata)
  values (new.assignee_id, 'card_assigned', 'Card assigned to you',
          coalesce(public.profile_label(actor), 'Someone') || ' assigned you “' || new.title || '”',
          jsonb_build_object('board_id', new.board_id, 'card_id', new.id, 'card_title', new.title,
                             'assigner_name', coalesce(public.profile_label(actor), 'Someone')));
  return null;
end $$;

drop trigger if exists cards_notify_assigned on public.cards;
create trigger cards_notify_assigned after update of assignee_id on public.cards
  for each row execute function public.notify_card_assigned();

-- ---------- Realtime ----------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

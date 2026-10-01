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

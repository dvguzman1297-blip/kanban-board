-- Module 1: custom tags, comment reactions and a per-card audit trail.

-- ---------- Tags (per board, managed by editors) ----------
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 30),
  color text not null default 'indigo',            -- palette key from lib/colors.ts
  created_at timestamptz not null default now()
);
create unique index if not exists tags_board_name_idx on public.tags(board_id, lower(trim(name)));

create table if not exists public.card_tags (
  card_id uuid not null references public.cards(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (card_id, tag_id)
);
create index if not exists card_tags_tag_idx on public.card_tags(tag_id);

alter table public.tags enable row level security;
alter table public.card_tags enable row level security;

drop policy if exists "tags_member_read" on public.tags;
drop policy if exists "tags_editor_write" on public.tags;
create policy "tags_member_read" on public.tags for select using (public.is_board_member(board_id));
create policy "tags_editor_write" on public.tags for all
  using (public.can_edit_board(board_id)) with check (public.can_edit_board(board_id));

drop policy if exists "card_tags_member_read" on public.card_tags;
drop policy if exists "card_tags_editor_insert" on public.card_tags;
drop policy if exists "card_tags_editor_delete" on public.card_tags;
create policy "card_tags_member_read" on public.card_tags for select using (
  exists (select 1 from public.cards c where c.id = card_id and public.is_board_member(c.board_id))
);
-- The card and the tag must belong to the same board.
create policy "card_tags_editor_insert" on public.card_tags for insert with check (
  exists (select 1 from public.cards c join public.tags t on t.id = tag_id
           where c.id = card_id and c.board_id = t.board_id and public.can_edit_board(c.board_id))
);
create policy "card_tags_editor_delete" on public.card_tags for delete using (
  exists (select 1 from public.cards c where c.id = card_id and public.can_edit_board(c.board_id))
);

-- ---------- Comment reactions ----------
create table if not exists public.comment_reactions (
  comment_id uuid not null references public.card_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  emoji text not null check (emoji in ('👍','🚀','🎉','❤️','👀')),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);
alter table public.comment_reactions enable row level security;

drop policy if exists "reactions_member_read" on public.comment_reactions;
drop policy if exists "reactions_member_insert" on public.comment_reactions;
drop policy if exists "reactions_own_delete" on public.comment_reactions;
create policy "reactions_member_read" on public.comment_reactions for select using (
  exists (select 1 from public.card_comments cm join public.cards c on c.id = cm.card_id
           where cm.id = comment_id and public.is_board_member(c.board_id))
);
create policy "reactions_member_insert" on public.comment_reactions for insert with check (
  user_id = auth.uid() and exists (
    select 1 from public.card_comments cm join public.cards c on c.id = cm.card_id
     where cm.id = comment_id and public.is_board_member(c.board_id))
);
create policy "reactions_own_delete" on public.comment_reactions for delete using (user_id = auth.uid());

-- ---------- Card audit trail ----------
-- Written only by the security-definer triggers below; readable by board members.
create table if not exists public.card_events (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  board_id uuid not null,
  user_id uuid,                                  -- the actor (auth.uid() at the time)
  kind text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists card_events_card_idx on public.card_events(card_id, created_at desc);

alter table public.card_events enable row level security;
drop policy if exists "card_events_member_read" on public.card_events;
create policy "card_events_member_read" on public.card_events for select using (public.is_board_member(board_id));

create or replace function public.profile_label(uid uuid) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(trim(display_name), ''), nullif(trim(full_name), ''), nullif(trim(first_name), ''), email)
    from public.profiles where id = uid;
$$;

create or replace function public.log_card_events() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
  sub jsonb;
  prev jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.card_events (card_id, board_id, user_id, kind, detail)
    values (new.id, new.board_id, actor, 'created',
            jsonb_build_object('column', (select name from public.columns where id = new.column_id)));
    return null;
  end if;

  if new.column_id is distinct from old.column_id then
    insert into public.card_events (card_id, board_id, user_id, kind, detail)
    values (new.id, new.board_id, actor, 'moved', jsonb_build_object(
      'from', (select name from public.columns where id = old.column_id),
      'to',   (select name from public.columns where id = new.column_id)));
  end if;
  if new.due_date is distinct from old.due_date then
    insert into public.card_events (card_id, board_id, user_id, kind, detail)
    values (new.id, new.board_id, actor, 'due_date', jsonb_build_object('from', old.due_date, 'to', new.due_date));
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    insert into public.card_events (card_id, board_id, user_id, kind, detail)
    values (new.id, new.board_id, actor, 'assignee', jsonb_build_object(
      'from', public.profile_label(old.assignee_id), 'to', public.profile_label(new.assignee_id)));
  end if;
  if new.priority is distinct from old.priority then
    insert into public.card_events (card_id, board_id, user_id, kind, detail)
    values (new.id, new.board_id, actor, 'priority', jsonb_build_object('from', old.priority, 'to', new.priority));
  end if;

  if new.subtasks is distinct from old.subtasks then
    for sub in select * from jsonb_array_elements(coalesce(new.subtasks, '[]'::jsonb)) loop
      prev := null;
      select value into prev from jsonb_array_elements(coalesce(old.subtasks, '[]'::jsonb)) where value->>'id' = sub->>'id' limit 1;
      if prev is not null and (prev->>'done')::boolean is distinct from (sub->>'done')::boolean then
        insert into public.card_events (card_id, board_id, user_id, kind, detail)
        values (new.id, new.board_id, actor,
                case when (sub->>'done')::boolean then 'subtask_done' else 'subtask_reopened' end,
                jsonb_build_object('title', sub->>'title'));
      end if;
    end loop;
  end if;
  return null;
end $$;

drop trigger if exists cards_log_events on public.cards;
create trigger cards_log_events after insert or update on public.cards
  for each row execute function public.log_card_events();

create or replace function public.log_card_tag_events() returns trigger
language plpgsql security definer set search_path = public as $$
declare cid uuid := coalesce(new.card_id, old.card_id);
        tid uuid := coalesce(new.tag_id, old.tag_id);
        bid uuid;
begin
  -- When a card is deleted its card_tags cascade away; there is nothing left to log against.
  select board_id into bid from public.cards where id = cid;
  if bid is null then return null; end if;
  insert into public.card_events (card_id, board_id, user_id, kind, detail)
  values (cid, bid, auth.uid(), case when tg_op = 'INSERT' then 'tag_added' else 'tag_removed' end,
          jsonb_build_object('tag', (select name from public.tags where id = tid)));
  return null;
end $$;

drop trigger if exists card_tags_log_events on public.card_tags;
create trigger card_tags_log_events after insert or delete on public.card_tags
  for each row execute function public.log_card_tag_events();

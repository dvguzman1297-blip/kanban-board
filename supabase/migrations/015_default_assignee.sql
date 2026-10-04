-- Cards default to their creator when nobody is picked, so every card has an owner
-- (solo and shared boards alike). Credit in the dashboard follows the assignee.

-- Runs before cards_validate_assignee (triggers fire alphabetically); creators are always board members.
create or replace function public.default_card_assignee() returns trigger
language plpgsql as $$
begin
  if new.assignee_id is null then new.assignee_id := new.user_id; end if;
  return new;
end $$;

drop trigger if exists cards_default_assignee on public.cards;
create trigger cards_default_assignee before insert on public.cards
  for each row execute function public.default_card_assignee();

-- Notify the assignee on insert as well as update (skipped when assigning yourself).
create or replace function public.notify_card_assigned() returns trigger
language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid();
begin
  if new.assignee_id is null or new.assignee_id = actor
     or (tg_op = 'UPDATE' and new.assignee_id is not distinct from old.assignee_id) then
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
create trigger cards_notify_assigned after insert or update of assignee_id on public.cards
  for each row execute function public.notify_card_assigned();

-- One-time backfill: existing unassigned cards go to their creator (only if still on the board).
-- Notification / activity triggers are paused so this doesn't spam anyone or write events with no actor.
alter table public.cards disable trigger cards_notify_assigned;
alter table public.cards disable trigger cards_log_events;
update public.cards c set assignee_id = c.user_id
 where c.assignee_id is null
   and (exists (select 1 from public.boards b where b.id = c.board_id and b.user_id = c.user_id)
        or exists (select 1 from public.board_members m
                    where m.board_id = c.board_id and m.user_id = c.user_id and m.status = 'accepted'));
alter table public.cards enable trigger cards_notify_assigned;
alter table public.cards enable trigger cards_log_events;

-- Card assignees (powers per-collaborator stats on the board dashboard).
alter table public.cards add column if not exists assignee_id uuid references auth.users(id) on delete set null;
create index if not exists cards_assignee_idx on public.cards(assignee_id);

-- An assignee must be the board owner or an accepted member of that board.
create or replace function public.validate_card_assignee()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_id is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    if not exists (select 1 from public.boards b where b.id = new.board_id and b.user_id = new.assignee_id)
       and not exists (select 1 from public.board_members m
                        where m.board_id = new.board_id and m.user_id = new.assignee_id and m.status = 'accepted') then
      raise exception 'Assignee must be a member of this board';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists cards_validate_assignee on public.cards;
create trigger cards_validate_assignee before insert or update on public.cards
  for each row execute function public.validate_card_assignee();

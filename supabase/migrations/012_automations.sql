-- Module 3: rule-based automations and Done-column auto-archiving.

alter table public.boards add column if not exists auto_archive_days integer
  check (auto_archive_days is null or auto_archive_days between 1 and 365);   -- null = never

-- ---------- Rules (run in the database so every client gets them) ----------
--  1. All subtasks checked  -> move the card to the board's "Done" column.
--  2. Card enters "Done"    -> record completed_at and tick any remaining subtasks.
-- A BEFORE trigger edits the row being written, so no recursion and the audit trail
-- (log_card_events, an AFTER trigger) records the resulting move.
create or replace function public.apply_card_rules() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  done_id uuid;
  last_order double precision;
  entering_done boolean := false;
begin
  select c.id into done_id from public.columns c
   where c.board_id = new.board_id and lower(trim(c.name)) = 'done'
   order by c.order_index limit 1;
  if done_id is null then return new; end if;

  -- Rule 1: subtasks just changed and every one is done (and the user did not move the card themselves).
  if new.subtasks is distinct from old.subtasks
     and new.column_id = old.column_id
     and new.column_id <> done_id
     and jsonb_typeof(new.subtasks) = 'array'
     and jsonb_array_length(new.subtasks) > 0
     and not exists (select 1 from jsonb_array_elements(new.subtasks) s where coalesce((s->>'done')::boolean, false) = false)
  then
    select coalesce(max(order_index), 0) into last_order from public.cards where column_id = done_id;
    new.column_id := done_id;
    new.order_index := last_order + 1000;
  end if;

  -- Rule 2: the card is (now) in Done.
  entering_done := new.column_id = done_id and old.column_id is distinct from done_id;
  if entering_done then
    new.completed_at := coalesce(new.completed_at, old.completed_at, now());
    if jsonb_typeof(new.subtasks) = 'array' and jsonb_array_length(new.subtasks) > 0 then
      select jsonb_agg(jsonb_set(t.s, '{done}', 'true'::jsonb) order by t.n) into new.subtasks
        from jsonb_array_elements(new.subtasks) with ordinality as t(s, n);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists cards_rules on public.cards;
create trigger cards_rules before update on public.cards
  for each row execute function public.apply_card_rules();

-- ---------- Auto-archive Done cards ----------
-- Archives cards that have sat in Done for longer than the board's setting.
-- Called when a board is opened (and by the settings action), so it needs no scheduler.
-- Optional: if pg_cron is enabled on your project you can also run it nightly:
--   select cron.schedule('flowdeck-archive', '0 3 * * *',
--     $$ select public.sweep_board_archive(id) from public.boards where auto_archive_days is not null $$);
create or replace function public.sweep_board_archive(target_board_id uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare days integer; n integer;
begin
  if not public.is_board_member(target_board_id) then return 0; end if;
  select auto_archive_days into days from public.boards where id = target_board_id;
  if days is null then return 0; end if;
  update public.cards k set archived_at = now()
   where k.board_id = target_board_id and k.archived_at is null
     and k.column_id in (select c.id from public.columns c where c.board_id = target_board_id and lower(trim(c.name)) = 'done')
     and coalesce(k.completed_at, k.created_at) < now() - make_interval(days => days);
  get diagnostics n = row_count;
  return n;
end $$;

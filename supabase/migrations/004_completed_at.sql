-- Powers the "Velocity" stat: when a card entered the Done column.
alter table public.cards add column if not exists completed_at timestamptz;

-- Backfill: cards already sitting in Done count as completed when they were created
update public.cards c
   set completed_at = c.created_at
  from public.columns col
 where col.id = c.column_id
   and lower(trim(col.name)) = 'done'
   and c.completed_at is null;

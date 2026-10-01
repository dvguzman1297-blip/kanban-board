-- Optional per-card colour key (e.g. 'sky', 'rose'). NULL = inherit the column's colour.
alter table public.cards add column if not exists color text;

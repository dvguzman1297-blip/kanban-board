-- Optional colour tag per column. null = automatic: the app derives a colour from the column's name/position,
-- so existing boards look exactly as before until someone picks a colour.
-- Existing row-level-security policies on public.columns already cover this field (editors can update columns).
alter table public.columns add column if not exists color text;

do $$ begin
  alter table public.columns add constraint columns_color_check
    check (color is null or color in ('slate','sky','teal','emerald','amber','orange','rose','pink','violet','indigo'));
exception when duplicate_object then null; end $$;

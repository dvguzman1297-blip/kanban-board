-- Timeline: optional start/end times of day, so the Day view can place and resize bars by the hour.
-- start_date / due_date stay `date` columns (the whole app compares them as ISO dates);
-- the times are separate and nullable. null = the card covers whole days.
-- '24:00:00' is a valid `time` and is stored for "ends at midnight".
alter table public.cards add column if not exists start_time time;
alter table public.cards add column if not exists due_time time;

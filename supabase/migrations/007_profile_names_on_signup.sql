-- Capture registration names in profiles for new and existing projects.
alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name text;
alter table public.profiles add column if not exists full_name text;

update public.profiles p
   set first_name = coalesce(
         nullif(trim(u.raw_user_meta_data->>'first_name'), ''),
         nullif(split_part(trim(coalesce(u.raw_user_meta_data->>'full_name', p.full_name, '')), ' ', 1), ''),
         p.first_name
       ),
       last_name = coalesce(
         nullif(trim(u.raw_user_meta_data->>'last_name'), ''),
         nullif(trim(regexp_replace(trim(coalesce(u.raw_user_meta_data->>'full_name', p.full_name, '')), '^[^[:space:]]+[[:space:]]*', '')), ''),
         p.last_name
       ),
       full_name = coalesce(
         nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
         nullif(trim(concat_ws(' ',
           nullif(trim(u.raw_user_meta_data->>'first_name'), ''),
           nullif(trim(u.raw_user_meta_data->>'last_name'), '')
         )), ''),
         p.full_name
       )
  from auth.users u
 where u.id = p.id;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_board_id uuid;
  first_name_value text;
  last_name_value text;
  full_name_value text;
begin
  first_name_value := nullif(trim(new.raw_user_meta_data->>'first_name'), '');
  last_name_value := nullif(trim(new.raw_user_meta_data->>'last_name'), '');
  full_name_value := nullif(trim(new.raw_user_meta_data->>'full_name'), '');
  if full_name_value is null then
    full_name_value := nullif(trim(concat_ws(' ', first_name_value, last_name_value)), '');
  end if;

  insert into public.profiles (id, email, role, first_name, last_name, full_name)
  values (new.id, new.email, 'Admin', first_name_value, last_name_value, full_name_value);

  insert into public.boards (user_id, name, description, is_pinned)
  values (new.id, 'Main Operations', 'Your default workspace', true)
  returning id into new_board_id;

  insert into public.columns (board_id, name, order_index, wip_limit) values
    (new_board_id, 'Backlog',     1000, null),
    (new_board_id, 'Up Next',     2000, null),
    (new_board_id, 'In Progress', 3000, 3),
    (new_board_id, 'Blocked',     4000, null),
    (new_board_id, 'Done',        5000, null);

  return new;
end;
$$;

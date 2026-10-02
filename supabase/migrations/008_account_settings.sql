-- Account & profile settings: extra profile columns, preferences, avatar storage.
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists job_title text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists default_board_id uuid references public.boards(id) on delete set null;
alter table public.profiles add column if not exists theme text not null default 'dark';
alter table public.profiles add column if not exists notify_invites boolean not null default true;
alter table public.profiles add column if not exists notify_mentions boolean not null default true;
alter table public.profiles add column if not exists notify_assignments boolean not null default true;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

do $$ begin
  alter table public.profiles add constraint profiles_theme_check check (theme in ('system','dark','light'));
exception when duplicate_object then null; end $$;

create or replace function public.touch_profile_updated_at() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
  for each row execute function public.touch_profile_updated_at();

-- RLS: "profiles_self" (id = auth.uid()) already covers read/update of the user's own row.

-- Avatars: public-read bucket (so <img> works), writes limited to the user's own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

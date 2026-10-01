-- Card attachments: private Storage bucket + metadata table. Run once in the Supabase SQL Editor.

-- 1) Private bucket, 10 MB per file
insert into storage.buckets (id, name, public, file_size_limit)
values ('card-attachments', 'card-attachments', false, 10485760)
on conflict (id) do update set file_size_limit = excluded.file_size_limit;

-- 2) Metadata table (rows disappear with their card/board; files are removed by the app's delete actions)
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  board_id uuid not null references public.boards(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  path text not null,
  mime_type text,
  size bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists attachments_card_idx on public.attachments(card_id);
create index if not exists attachments_board_idx on public.attachments(board_id);

alter table public.attachments enable row level security;
drop policy if exists "attachments_owner" on public.attachments;
create policy "attachments_owner" on public.attachments
  for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.cards c where c.id = attachments.card_id and c.user_id = auth.uid())
  );

-- 3) Storage policies: each user may only touch files under their own  <user_id>/  folder
drop policy if exists "card_att_select" on storage.objects;
create policy "card_att_select" on storage.objects for select to authenticated
  using (bucket_id = 'card-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "card_att_insert" on storage.objects;
create policy "card_att_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'card-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "card_att_delete" on storage.objects;
create policy "card_att_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'card-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

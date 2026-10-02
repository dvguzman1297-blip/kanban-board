-- Module 2: card archiving (bulk archive) and reusable card templates.

alter table public.cards add column if not exists archived_at timestamptz;
create index if not exists cards_archived_idx on public.cards(board_id) where archived_at is not null;

-- Custom templates are shared with the whole board; editors manage them.
-- The four built-in templates (Bug Report, Feature Spec, ...) live in code.
create table if not exists public.card_templates (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  title text not null default '',
  description text,
  priority card_priority not null default 'medium',
  energy_level energy_level not null default 'medium',
  subtasks jsonb not null default '[]'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists card_templates_board_idx on public.card_templates(board_id);

alter table public.card_templates enable row level security;
drop policy if exists "card_templates_member_read" on public.card_templates;
drop policy if exists "card_templates_editor_write" on public.card_templates;
create policy "card_templates_member_read" on public.card_templates for select using (public.is_board_member(board_id));
create policy "card_templates_editor_write" on public.card_templates for all
  using (public.can_edit_board(board_id)) with check (public.can_edit_board(board_id));

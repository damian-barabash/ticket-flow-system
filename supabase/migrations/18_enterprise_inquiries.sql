-- Migration 18 — enterprise_inquiries (2026-07-11)
-- Contact form for the "Enterprise" pricing plan (negotiable, custom features/integrations).
-- Anyone (anonymous landing visitor) may submit; only moderators (platform owners) can read/manage.

create table if not exists public.enterprise_inquiries (
  id         uuid primary key default gen_random_uuid(),
  company    text,
  name       text,
  email      text not null,
  phone      text,
  message    text,
  status     text not null default 'new' check (status in ('new', 'contacted', 'closed')),
  created_at timestamptz not null default now()
);

alter table public.enterprise_inquiries enable row level security;

-- Table privileges: anon may only INSERT; authenticated has full set (RLS gates the rows).
grant insert on public.enterprise_inquiries to anon;
grant select, insert, update, delete on public.enterprise_inquiries to authenticated;

-- Public submit (anonymous or logged-in) with light guardrails against abuse.
drop policy if exists enterprise_inquiries_insert_public on public.enterprise_inquiries;
create policy enterprise_inquiries_insert_public on public.enterprise_inquiries
  for insert to anon, authenticated
  with check (
    char_length(email) between 3 and 200
    and char_length(coalesce(message, '')) <= 5000
    and char_length(coalesce(company, '')) <= 300
    and char_length(coalesce(name, '')) <= 200
    and char_length(coalesce(phone, '')) <= 60
  );

-- Only moderators can read and manage submissions.
drop policy if exists enterprise_inquiries_select_moderator on public.enterprise_inquiries;
create policy enterprise_inquiries_select_moderator on public.enterprise_inquiries
  for select to authenticated using (is_moderator());

drop policy if exists enterprise_inquiries_update_moderator on public.enterprise_inquiries;
create policy enterprise_inquiries_update_moderator on public.enterprise_inquiries
  for update to authenticated using (is_moderator()) with check (is_moderator());

drop policy if exists enterprise_inquiries_delete_moderator on public.enterprise_inquiries;
create policy enterprise_inquiries_delete_moderator on public.enterprise_inquiries
  for delete to authenticated using (is_moderator());

create index if not exists enterprise_inquiries_status_created_idx
  on public.enterprise_inquiries (status, created_at desc);

-- Live updates in the moderator "Inquiries" window.
alter publication supabase_realtime add table public.enterprise_inquiries;

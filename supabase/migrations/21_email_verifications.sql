-- Migration 21 — email verification codes (2026-07-12)
-- 6-digit codes for self-registration. Written/read only by Edge Functions
-- (service role); RLS on + no policies denies all end-user access.

create table if not exists public.email_verifications (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  code       text not null,
  user_id    uuid,
  attempts   int not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists email_verifications_email_idx on public.email_verifications (email, created_at desc);

alter table public.email_verifications enable row level security;
-- No policies → only the service role (which bypasses RLS) may touch this table.

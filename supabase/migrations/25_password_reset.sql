-- Migration 25 — password reset codes share email_verifications (2026-10-26).
alter table public.email_verifications add column if not exists purpose text not null default 'register'
  check (purpose in ('register', 'reset'));
create index if not exists email_verifications_purpose_idx on public.email_verifications (email, purpose, created_at desc);

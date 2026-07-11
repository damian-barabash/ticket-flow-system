-- Migration 20 — billing / subscription state (2026-07-11)
-- Per-tenant (admin) subscription. 7-day free trial from signup, then a paid
-- monthly Paddle subscription. Clients inherit access from their owner-admin.

alter table public.profiles
  add column if not exists trial_ends_at        timestamptz default (now() + interval '7 days'),
  add column if not exists subscription_status  text not null default 'trialing',
  add column if not exists subscription_ends_at timestamptz,
  add column if not exists paddle_customer_id   text,
  add column if not exists paddle_subscription_id text;

do $$ begin
  alter table public.profiles
    add constraint profiles_subscription_status_chk
    check (subscription_status in ('trialing', 'active', 'past_due', 'canceled', 'expired'));
exception when duplicate_object then null; end $$;

-- Backfill existing profiles: trial runs 7 days from signup (may already be over).
update public.profiles set trial_ends_at = created_at + interval '7 days' where trial_ends_at is null;

-- New signups get a 7-day trial. handle_new_user doesn't set billing columns, so
-- the column defaults apply. Set trial start explicitly for clarity/robustness.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
declare want text;
begin
  want := coalesce(new.raw_user_meta_data->>'role', 'user');
  if want not in ('admin','user') then want := 'user'; end if;
  insert into public.profiles(id, email, full_name, role, trial_ends_at, subscription_status)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    want::user_role,
    now() + interval '7 days',
    'trialing'
  )
  on conflict (id) do nothing;
  return new;
end; $fn$;

-- Security: billing columns may only be changed by the backend (service role /
-- migrations, where auth.uid() is null). An end user can NEVER self-grant access.
create or replace function public.guard_profile_billing()
returns trigger language plpgsql security definer set search_path to 'public' as $fn$
begin
  if auth.uid() is not null then
    if new.subscription_status  is distinct from old.subscription_status
       or new.subscription_ends_at is distinct from old.subscription_ends_at
       or new.trial_ends_at        is distinct from old.trial_ends_at
       or new.paddle_customer_id   is distinct from old.paddle_customer_id
       or new.paddle_subscription_id is distinct from old.paddle_subscription_id then
      raise exception 'billing fields are managed by the system';
    end if;
  end if;
  return new;
end; $fn$;

drop trigger if exists guard_profile_billing on public.profiles;
create trigger guard_profile_billing before update on public.profiles
  for each row execute function public.guard_profile_billing();

-- Helper: is this admin currently entitled (paid or within trial)?
create or replace function public.is_entitled(p_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $fn$
  select coalesce(
    (select (subscription_status = 'active' and (subscription_ends_at is null or subscription_ends_at > now()))
            or (trial_ends_at is not null and trial_ends_at > now())
       from public.profiles where id = p_id),
    false);
$fn$;

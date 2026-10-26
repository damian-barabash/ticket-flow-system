-- Migration 23 — project chat, ticket assignee, calendar events + iCal feed,
-- push settings (2026-10-26).

-- ───────────────────────── A. Project chat ─────────────────────────
create table if not exists public.project_messages (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null default auth.uid(),
  body        text not null default '' check (char_length(body) <= 8000),
  -- [{path, name, content_type, size}] in the private `chat-media` bucket
  attachments jsonb not null default '[]'::jsonb,
  reply_to    uuid references public.project_messages(id) on delete set null,
  ticket_id   uuid references public.tickets(id) on delete set null,
  created_at  timestamptz not null default now(),
  edited_at   timestamptz,
  deleted_at  timestamptz
);
create index if not exists project_messages_project_idx
  on public.project_messages (project_id, created_at desc);

alter table public.project_messages enable row level security;
grant select, insert, update, delete on public.project_messages to authenticated;

drop policy if exists msg_select on public.project_messages;
create policy msg_select on public.project_messages for select to authenticated
  using (can_access_project(project_id));
drop policy if exists msg_insert on public.project_messages;
create policy msg_insert on public.project_messages for insert to authenticated
  with check (can_access_project(project_id) and author_id = auth.uid());
-- edit / soft-delete: only the author
drop policy if exists msg_update on public.project_messages;
create policy msg_update on public.project_messages for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid());
-- hard delete: author, project owner, moderator
drop policy if exists msg_delete on public.project_messages;
create policy msg_delete on public.project_messages for delete to authenticated
  using (author_id = auth.uid() or is_moderator() or owns_project(project_id));

create table if not exists public.project_chat_reads (
  project_id   uuid not null references public.projects(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
alter table public.project_chat_reads enable row level security;
grant select, insert, update, delete on public.project_chat_reads to authenticated;
drop policy if exists chat_reads_own on public.project_chat_reads;
create policy chat_reads_own on public.project_chat_reads for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and can_access_project(project_id));

-- unread chat counters for the current user (one round-trip for the project grid)
create or replace function public.chat_unread_counts()
returns table (project_id uuid, unread bigint)
language sql stable security definer set search_path = public as $$
  select m.project_id, count(*)::bigint
  from project_messages m
  left join project_chat_reads r on r.project_id = m.project_id and r.user_id = auth.uid()
  where m.deleted_at is null
    and m.author_id is distinct from auth.uid()
    and m.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz)
    and can_access_project(m.project_id)
  group by m.project_id
$$;
revoke all on function public.chat_unread_counts() from public, anon;
grant execute on function public.chat_unread_counts() to authenticated;

-- chat media bucket: <project_id>/<uuid>.<ext>
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-media', 'chat-media', false, 52428800)
on conflict (id) do nothing;

drop policy if exists chat_media_select on storage.objects;
create policy chat_media_select on storage.objects for select to authenticated
  using (bucket_id = 'chat-media' and can_access_project_path(name));
drop policy if exists chat_media_insert on storage.objects;
create policy chat_media_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media' and can_access_project_path(name));
drop policy if exists chat_media_delete on storage.objects;
create policy chat_media_delete on storage.objects for delete to authenticated
  using (bucket_id = 'chat-media' and (owner = auth.uid() or manages_project_path(name)));

-- ───────────────────────── B. Ticket assignee ─────────────────────────
-- The assignee may work the ticket (status, priority, due date …).
drop policy if exists tickets_update_assignee on public.tickets;
create policy tickets_update_assignee on public.tickets for update to authenticated
  using (assigned_to = auth.uid() and can_access_project(project_id))
  with check (can_access_project(project_id));

-- People of a project: owner-admin + members (who can be assigned / mentioned).
create or replace function public.project_people(p_project uuid)
returns table (id uuid, full_name text, email text, role text, is_owner boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not can_access_project(p_project) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select p.id, p.full_name, p.email, p.role::text, (p.id = pr.created_by)
    from projects pr
    join profiles p on p.id = pr.created_by or p.id in (
      select m.user_id from project_members m where m.project_id = pr.id)
    where pr.id = p_project
    order by (p.id = pr.created_by) desc, coalesce(p.full_name, p.email);
end; $$;
revoke all on function public.project_people(uuid) from public, anon;
grant execute on function public.project_people(uuid) to authenticated;

-- Anyone with access to a ticket may (re)assign it to a person of the project.
create or replace function public.assign_ticket(p_ticket uuid, p_user uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  select project_id into pid from tickets where id = p_ticket;
  if pid is null or not can_access_ticket(p_ticket) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_user is not null and not (owns_project(pid, p_user) or is_project_member(pid, p_user)) then
    raise exception 'not_a_project_person' using errcode = '22023';
  end if;
  update tickets set assigned_to = p_user where id = p_ticket;
end; $$;
revoke all on function public.assign_ticket(uuid, uuid) from public, anon;
grant execute on function public.assign_ticket(uuid, uuid) to authenticated;

create index if not exists tickets_assigned_idx on public.tickets (assigned_to) where assigned_to is not null;

-- ───────────────────────── C. Calendar ─────────────────────────
-- Events: meetings, calls, milestones. project_id null = personal event.
create table if not exists public.calendar_events (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid references public.projects(id) on delete cascade,
  created_by     uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  title          text not null check (char_length(title) between 1 and 300),
  notes          text check (char_length(notes) <= 5000),
  location       text check (char_length(location) <= 500),
  starts_at      timestamptz not null,
  ends_at        timestamptz,
  all_day        boolean not null default false,
  remind_minutes integer check (remind_minutes is null or remind_minutes between 0 and 10080),
  reminded_at    timestamptz,
  created_at     timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);
create index if not exists calendar_events_project_idx on public.calendar_events (project_id, starts_at);
create index if not exists calendar_events_owner_idx on public.calendar_events (created_by, starts_at);
create index if not exists calendar_events_remind_idx on public.calendar_events (starts_at)
  where reminded_at is null and remind_minutes is not null;

alter table public.calendar_events enable row level security;
grant select, insert, update, delete on public.calendar_events to authenticated;

drop policy if exists cal_select on public.calendar_events;
create policy cal_select on public.calendar_events for select to authenticated
  using ((project_id is null and created_by = auth.uid())
      or (project_id is not null and can_access_project(project_id)));
drop policy if exists cal_insert on public.calendar_events;
create policy cal_insert on public.calendar_events for insert to authenticated
  with check (created_by = auth.uid() and (project_id is null or can_access_project(project_id)));
drop policy if exists cal_update on public.calendar_events;
create policy cal_update on public.calendar_events for update to authenticated
  using (created_by = auth.uid() or (project_id is not null and (is_moderator() or owns_project(project_id))))
  with check (project_id is null and created_by = auth.uid()
      or project_id is not null and can_access_project(project_id));
drop policy if exists cal_delete on public.calendar_events;
create policy cal_delete on public.calendar_events for delete to authenticated
  using (created_by = auth.uid() or (project_id is not null and (is_moderator() or owns_project(project_id))));

-- Personal secret iCal feed token (separate table: profiles are readable by co-members).
create table if not exists public.calendar_feeds (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  token      text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz not null default now()
);
alter table public.calendar_feeds enable row level security;
grant select, delete on public.calendar_feeds to authenticated;
drop policy if exists cal_feed_own on public.calendar_feeds;
create policy cal_feed_own on public.calendar_feeds for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.calendar_feed_token(p_reset boolean default false)
returns text
language plpgsql security definer set search_path = public, extensions as $$
declare tok text;
begin
  if auth.uid() is null then raise exception 'unauthorized' using errcode = '42501'; end if;
  if p_reset then delete from calendar_feeds where user_id = auth.uid(); end if;
  insert into calendar_feeds (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select token into tok from calendar_feeds where user_id = auth.uid();
  return tok;
end; $$;
revoke all on function public.calendar_feed_token(boolean) from public, anon;
grant execute on function public.calendar_feed_token(boolean) to authenticated;

-- ───────────────────────── D. Push ─────────────────────────
alter table public.push_tokens add column if not exists app_version text;
alter table public.push_tokens drop constraint if exists push_tokens_platform_check;
alter table public.push_tokens add constraint push_tokens_platform_check
  check (platform in ('ios', 'android', 'macos', 'windows'));

-- Per-user notification preferences. Missing row = everything on.
create table if not exists public.notification_settings (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  tickets        boolean not null default true,   -- new tickets
  status         boolean not null default true,   -- status changes
  comments       boolean not null default true,   -- ticket comments
  chat           boolean not null default true,   -- project chat
  assigned       boolean not null default true,   -- assigned to me / task for me
  reminders      boolean not null default true,   -- deadlines + event reminders
  muted_projects uuid[] not null default '{}',
  updated_at     timestamptz not null default now()
);
alter table public.notification_settings enable row level security;
grant select, insert, update, delete on public.notification_settings to authenticated;
drop policy if exists notif_settings_own on public.notification_settings;
create policy notif_settings_own on public.notification_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────────────────────── Realtime ─────────────────────────
do $$
begin
  begin alter publication supabase_realtime add table public.project_messages; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.calendar_events; exception when duplicate_object then null; end;
end $$;

-- Event reminders every 5 minutes (same secret as the daily deadlines job,
-- copied from that job so it never lands in the repo).
do $$
declare secret text;
begin
  select substring(command from 'X-Cron-Secret'',''([^'']+)''') into secret
  from cron.job where jobname = 'push-deadlines-daily';
  if secret is not null then
    perform cron.unschedule(jobid) from cron.job where jobname = 'push-reminders-5min';
    perform cron.schedule('push-reminders-5min', '*/5 * * * *', format($f$
      select net.http_post(
        url := 'https://ebmroanhngmigjxljzlp.supabase.co/functions/v1/push-deadlines',
        headers := jsonb_build_object('Content-Type','application/json','X-Cron-Secret',%L),
        body := '{"mode":"events"}'::jsonb
      );
    $f$, secret));
  end if;
end $$;

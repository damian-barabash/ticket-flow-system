-- Migration 15 — three-tier role model (applied live via MCP 2026-06-16).
-- Split into two transactions: 15a adds the enum value, 15b uses it.
--
--   moderator  = platform super-admin: sees ALL projects, manages all roles/users.
--   admin      = tenant owner: sees ONLY projects they created (created_by = self) + own clients.
--   user       = client: sees only projects they are a member of.
-- The founding admin (office@barabashflow.pl) was promoted to moderator.

-- ============================================================ 15a (own transaction)
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'moderator';

-- ============================================================ 15b
-- helper functions -------------------------------------------------------------
create or replace function public.is_moderator(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists(select 1 from profiles where id = uid and role = 'moderator');
$$;

create or replace function public.is_staff(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists(select 1 from profiles where id = uid and role in ('admin','moderator'));
$$;

create or replace function public.owns_project(pid uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists(select 1 from projects where id = pid and created_by = uid);
$$;

create or replace function public.can_access_project(pid uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path to 'public' as $$
  select is_moderator(uid) or owns_project(pid, uid) or is_project_member(pid, uid);
$$;

create or replace function public.manages_ticket(tid uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists(
    select 1 from tickets t
    where t.id = tid and (is_moderator(uid) or owns_project(t.project_id, uid))
  );
$$;

create or replace function public.manages_project_path(p text)
returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare pid uuid;
begin
  begin pid := nullif(split_part(p, '/', 1), '')::uuid; exception when others then return false; end;
  if pid is null then return false; end if;
  return is_moderator() or owns_project(pid);
end; $$;

create or replace function public.manages_ticket_path(p text)
returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare tid uuid;
begin
  begin tid := nullif(split_part(p, '/', 1), '')::uuid; exception when others then return false; end;
  if tid is null then return false; end if;
  return manages_ticket(tid);
end; $$;

create or replace function public.can_access_ticket(tid uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists(
    select 1 from tickets t
    where t.id = tid
      and (is_moderator(uid) or owns_project(t.project_id, uid) or is_project_member(t.project_id, uid))
  );
$$;

create or replace function public.can_access_project_path(p text)
returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare pid uuid;
begin
  begin pid := nullif(split_part(p, '/', 1), '')::uuid; exception when others then return false; end;
  if pid is null then return false; end if;
  return can_access_project(pid);
end; $$;

-- triggers ---------------------------------------------------------------------
-- 'moderator' can NEVER be minted via signup metadata (privilege escalation guard).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare want text;
begin
  want := coalesce(new.raw_user_meta_data->>'role', 'user');
  if want not in ('admin','user') then want := 'user'; end if;
  insert into public.profiles(id, email, full_name, role)
  values (
    new.id, new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    want::user_role
  )
  on conflict (id) do nothing;
  return new;
end; $$;

-- Only a moderator (end-user) may change a profile role. Backend contexts with no
-- end-user JWT (auth.uid() is null: migrations + service-role Edge Function) bypass;
-- RLS still blocks anon end-users from touching other rows.
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not is_moderator(auth.uid()) then
    raise exception 'only moderator can change role';
  end if;
  return new;
end; $$;

-- promote founder --------------------------------------------------------------
update public.profiles set role = 'moderator'
where id = 'cc765193-6655-468f-93fc-d5b077bbfa80';

-- RLS: projects ----------------------------------------------------------------
drop policy if exists projects_select on public.projects;
create policy projects_select on public.projects for select to authenticated
  using (is_moderator() or created_by = auth.uid() or is_project_member(id));
drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert to authenticated
  with check (is_staff() and created_by = auth.uid());
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update to authenticated
  using (is_moderator() or created_by = auth.uid())
  with check (is_moderator() or created_by = auth.uid());
drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete to authenticated
  using (is_moderator() or created_by = auth.uid());

-- RLS: project_members ---------------------------------------------------------
drop policy if exists members_select on public.project_members;
create policy members_select on public.project_members for select to authenticated
  using (is_moderator() or owns_project(project_id) or user_id = auth.uid() or is_project_member(project_id));
drop policy if exists members_insert on public.project_members;
create policy members_insert on public.project_members for insert to authenticated
  with check (is_moderator() or owns_project(project_id));
drop policy if exists members_delete on public.project_members;
create policy members_delete on public.project_members for delete to authenticated
  using (is_moderator() or owns_project(project_id));

-- RLS: tickets -----------------------------------------------------------------
drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets for select to authenticated
  using (can_access_project(project_id));
drop policy if exists tickets_insert on public.tickets;
create policy tickets_insert on public.tickets for insert to authenticated
  with check (can_access_project(project_id) and created_by = auth.uid());
drop policy if exists tickets_update on public.tickets;
create policy tickets_update on public.tickets for update to authenticated
  using (is_moderator() or owns_project(project_id) or created_by = auth.uid())
  with check (is_moderator() or owns_project(project_id) or created_by = auth.uid());
-- tickets_update_task_member kept unchanged (client can close/reopen an assigned task)
drop policy if exists tickets_delete on public.tickets;
create policy tickets_delete on public.tickets for delete to authenticated
  using (is_moderator() or owns_project(project_id));

-- RLS: ticket_comments / attachments -------------------------------------------
drop policy if exists comments_delete on public.ticket_comments;
create policy comments_delete on public.ticket_comments for delete to authenticated
  using (author_id = auth.uid() or manages_ticket(ticket_id));
drop policy if exists comments_update on public.ticket_comments;
create policy comments_update on public.ticket_comments for update to authenticated
  using (author_id = auth.uid() or manages_ticket(ticket_id));
drop policy if exists attachments_delete on public.attachments;
create policy attachments_delete on public.attachments for delete to authenticated
  using (uploaded_by = auth.uid() or manages_ticket(ticket_id));

-- RLS: project_releases / release_reads ----------------------------------------
drop policy if exists releases_select on public.project_releases;
create policy releases_select on public.project_releases for select to authenticated
  using (can_access_project(project_id));
drop policy if exists releases_insert on public.project_releases;
create policy releases_insert on public.project_releases for insert to authenticated
  with check (is_moderator() or owns_project(project_id));
drop policy if exists releases_update on public.project_releases;
create policy releases_update on public.project_releases for update to authenticated
  using (is_moderator() or owns_project(project_id))
  with check (is_moderator() or owns_project(project_id));
drop policy if exists releases_delete on public.project_releases;
create policy releases_delete on public.project_releases for delete to authenticated
  using (is_moderator() or owns_project(project_id));
drop policy if exists reads_select on public.release_reads;
create policy reads_select on public.release_reads for select to authenticated
  using (
    user_id = auth.uid() or is_moderator()
    or exists (select 1 from project_releases r where r.id = release_id and owns_project(r.project_id))
  );

-- RLS: project_deadlines -------------------------------------------------------
drop policy if exists deadlines_select on public.project_deadlines;
create policy deadlines_select on public.project_deadlines for select to authenticated
  using (can_access_project(project_id));
drop policy if exists deadlines_insert on public.project_deadlines;
create policy deadlines_insert on public.project_deadlines for insert to authenticated
  with check (can_access_project(project_id) and created_by = auth.uid());
drop policy if exists deadlines_update on public.project_deadlines;
create policy deadlines_update on public.project_deadlines for update to authenticated
  using (is_moderator() or owns_project(project_id) or created_by = auth.uid())
  with check (is_moderator() or owns_project(project_id) or created_by = auth.uid());
drop policy if exists deadlines_delete on public.project_deadlines;
create policy deadlines_delete on public.project_deadlines for delete to authenticated
  using (is_moderator() or owns_project(project_id) or created_by = auth.uid());

-- RLS: profiles ----------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or is_moderator()
    or exists (
      select 1 from project_members pm1
      join project_members pm2 on pm1.project_id = pm2.project_id
      where pm1.user_id = auth.uid() and pm2.user_id = profiles.id
    )
    or exists (
      select 1 from project_members pm
      where pm.user_id = profiles.id and owns_project(pm.project_id, auth.uid())
    )
    or exists (
      select 1 from project_members pm
      where pm.user_id = auth.uid() and owns_project(pm.project_id, profiles.id)
    )
  );
drop policy if exists profiles_insert_admin on public.profiles;
create policy profiles_insert_admin on public.profiles for insert to authenticated
  with check (is_staff());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or is_moderator())
  with check (id = auth.uid() or is_moderator());

-- Storage ----------------------------------------------------------------------
drop policy if exists covers_select_admin on storage.objects;
create policy covers_select_admin on storage.objects for select to authenticated
  using (bucket_id = 'project-covers' and (is_moderator() or manages_project_path(name)));
drop policy if exists covers_insert_admin on storage.objects;
create policy covers_insert_admin on storage.objects for insert to authenticated
  with check (bucket_id = 'project-covers' and manages_project_path(name));
drop policy if exists covers_update_admin on storage.objects;
create policy covers_update_admin on storage.objects for update to authenticated
  using (bucket_id = 'project-covers' and manages_project_path(name))
  with check (bucket_id = 'project-covers' and manages_project_path(name));
drop policy if exists covers_delete_admin on storage.objects;
create policy covers_delete_admin on storage.objects for delete to authenticated
  using (bucket_id = 'project-covers' and manages_project_path(name));

drop policy if exists pfiles_insert on storage.objects;
create policy pfiles_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'project-files' and manages_project_path(name));
drop policy if exists pfiles_update on storage.objects;
create policy pfiles_update on storage.objects for update to authenticated
  using (bucket_id = 'project-files' and manages_project_path(name))
  with check (bucket_id = 'project-files' and manages_project_path(name));
drop policy if exists pfiles_delete on storage.objects;
create policy pfiles_delete on storage.objects for delete to authenticated
  using (bucket_id = 'project-files' and manages_project_path(name));

drop policy if exists tmedia_delete on storage.objects;
create policy tmedia_delete on storage.objects for delete to authenticated
  using (bucket_id = 'ticket-media' and (owner = auth.uid() or is_moderator() or manages_ticket_path(name)));

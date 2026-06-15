-- Migration 14: project_deadlines — goals + deadlines (separate from tickets).
-- Both admins AND project members can add goals with a deadline (many per project).
-- Shown in a "legendary" block above the project releases.

create table if not exists public.project_deadlines (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects(id) on delete cascade,
  title       text not null,
  deadline    date not null,
  done        boolean not null default false,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists project_deadlines_project_idx
  on public.project_deadlines (project_id, done, deadline);

alter table public.project_deadlines enable row level security;

-- visible to admins and members of the project
create policy deadlines_select on public.project_deadlines
  for select to authenticated
  using (public.is_admin() or public.is_project_member(project_id));

-- admins and members may add; author must be self
create policy deadlines_insert on public.project_deadlines
  for insert to authenticated
  with check (
    (public.is_admin() or public.is_project_member(project_id))
    and created_by = auth.uid()
  );

-- author or admin may edit (mark done / reopen / change)
create policy deadlines_update on public.project_deadlines
  for update to authenticated
  using (public.is_admin() or created_by = auth.uid())
  with check (public.is_admin() or created_by = auth.uid());

-- author or admin may delete
create policy deadlines_delete on public.project_deadlines
  for delete to authenticated
  using (public.is_admin() or created_by = auth.uid());

-- realtime for live updates in the block
alter publication supabase_realtime add table public.project_deadlines;

-- Migration 19 — workspaces (2026-07-11)
-- Personal folders that group several projects. A workspace is PRIVATE to its
-- creator (nobody else sees it, not even a moderator). Grouping is per-user via
-- the workspace_projects junction, so it never mutates the projects table or
-- affects what other users see. Deleting a workspace just drops its links →
-- the projects reappear on the owner's main screen.

create table if not exists public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  archived   boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_projects (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id   uuid not null references public.projects(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, project_id)
);

create index if not exists workspaces_owner_created_idx
  on public.workspaces (created_by, created_at);
create index if not exists workspace_projects_project_idx
  on public.workspace_projects (project_id);

alter table public.workspaces enable row level security;
alter table public.workspace_projects enable row level security;

grant select, insert, update, delete on public.workspaces to authenticated;
grant select, insert, update, delete on public.workspace_projects to authenticated;

-- workspaces: strictly the creator, for every operation.
drop policy if exists workspaces_owner_all on public.workspaces;
create policy workspaces_owner_all on public.workspaces
  for all to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- workspace_projects: a link is visible/manageable only if I own its workspace;
-- adding a project also requires that I can actually access that project.
drop policy if exists workspace_projects_select on public.workspace_projects;
create policy workspace_projects_select on public.workspace_projects
  for select to authenticated
  using (exists (select 1 from public.workspaces w
                 where w.id = workspace_id and w.created_by = auth.uid()));

drop policy if exists workspace_projects_insert on public.workspace_projects;
create policy workspace_projects_insert on public.workspace_projects
  for insert to authenticated
  with check (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.created_by = auth.uid())
    and can_access_project(project_id)
  );

drop policy if exists workspace_projects_delete on public.workspace_projects;
create policy workspace_projects_delete on public.workspace_projects
  for delete to authenticated
  using (exists (select 1 from public.workspaces w
                 where w.id = workspace_id and w.created_by = auth.uid()));

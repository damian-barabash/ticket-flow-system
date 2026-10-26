-- Migration 24 — aggregate counters (2026-10-26). Replaces client-side counting
-- over full table scans (PostgREST caps responses at 1000 rows).

-- Open / done / total tickets per visible project (+ my unread tickets).
create or replace function public.project_stats()
returns table (project_id uuid, open bigint, done bigint, total bigint, unread bigint, overdue bigint)
language sql stable security definer set search_path = public as $$
  select t.project_id,
         count(*) filter (where t.status not in ('done','rejected')),
         count(*) filter (where t.status in ('done','rejected')),
         count(*),
         count(*) filter (where t.status not in ('done','rejected')
                           and t.created_by is distinct from auth.uid()
                           and t.updated_at > coalesce(r.last_read_at, 'epoch'::timestamptz)),
         count(*) filter (where t.status not in ('done','rejected') and t.due_date < current_date)
  from tickets t
  left join ticket_reads r on r.ticket_id = t.id and r.user_id = auth.uid()
  where can_access_project(t.project_id)
  group by t.project_id
$$;
revoke all on function public.project_stats() from public, anon;
grant execute on function public.project_stats() to authenticated;

-- Comment counts per ticket of one project.
create or replace function public.ticket_comment_counts(p_project uuid)
returns table (ticket_id uuid, comments bigint)
language sql stable security definer set search_path = public as $$
  select c.ticket_id, count(*)
  from ticket_comments c join tickets t on t.id = c.ticket_id
  where t.project_id = p_project and can_access_project(p_project)
  group by c.ticket_id
$$;
revoke all on function public.ticket_comment_counts(uuid) from public, anon;
grant execute on function public.ticket_comment_counts(uuid) to authenticated;

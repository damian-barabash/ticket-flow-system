-- 17_tickets_due_date (2026-07-10)
-- Optional deadline date on tickets. Tickets with a due_date show up in the
-- project calendar. No new RLS needed: tickets_update already lets staff/author
-- update, and select is gated by can_access_project. tickets is already in the
-- realtime publication.

alter table public.tickets
  add column if not exists due_date date;

create index if not exists tickets_due_date_idx
  on public.tickets (project_id, due_date)
  where due_date is not null;

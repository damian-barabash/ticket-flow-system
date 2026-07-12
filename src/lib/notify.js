import { supabase } from './supabase'

// Fire-and-forget trigger for PUSH notifications (Edge Function `push`), so the
// mobile app gets notified about project activity. Recipients are resolved
// server-side. Project *emails* are intentionally disabled — Ticket Flow only
// sends system emails (verification, subscription, invoices).
export async function notify(event, ticketId, extra = {}) {
  try {
    await supabase.functions.invoke('push', {
      body: { event, ticket_id: ticketId, ...extra },
    })
  } catch {
    /* best-effort; never block the UI */
  }
}

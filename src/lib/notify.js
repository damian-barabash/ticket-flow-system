import { supabase } from './supabase'

// Fire-and-forget call to the `notify` Edge Function (Resend emails).
// Safe no-op if the function isn't deployed / RESEND_API_KEY not set.
export async function notify(event, ticketId, extra = {}) {
  try {
    await supabase.functions.invoke('notify', {
      body: { event, ticket_id: ticketId, ...extra },
    })
  } catch {
    /* notifications are best-effort; never block the UI */
  }
}

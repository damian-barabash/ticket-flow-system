// Project/ticket email notifications are intentionally DISABLED.
// Ticket Flow only sends system emails (email verification, subscription
// paid / payment failed, invoices) — never per-project activity emails.
// Kept as a no-op so existing call sites don't need to change.
export async function notify() {
  /* no-op — system emails only */
}

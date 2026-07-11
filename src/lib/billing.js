// Subscription entitlement for an admin (tenant) profile.
//   active  — paid subscription in good standing
//   trial   — inside the 7-day free trial (daysLeft > 0)
//   expired — trial over and not paid → access blocked
const DAY = 86400000

export function entitlement(profile) {
  if (!profile) return { state: 'expired', active: false, daysLeft: 0 }
  const now = Date.now()

  const paidUntil = profile.subscription_ends_at ? new Date(profile.subscription_ends_at).getTime() : null
  const paid = profile.subscription_status === 'active' && (paidUntil === null || paidUntil > now)
  if (paid) return { state: 'active', active: true, daysLeft: 0 }

  const trialEnd = profile.trial_ends_at ? new Date(profile.trial_ends_at).getTime() : 0
  if (trialEnd > now) return { state: 'trial', active: true, daysLeft: Math.ceil((trialEnd - now) / DAY) }

  return { state: 'expired', active: false, daysLeft: 0 }
}

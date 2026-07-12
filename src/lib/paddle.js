// Paddle Billing checkout (client side).
//
// These two values are PUBLIC (safe in the frontend). The secret API key lives
// only as a Supabase Edge Function secret — never here.
//   - PADDLE_PRICE_ID: the 1 zł / month subscription price created in Paddle.
//   - PADDLE_CLIENT_TOKEN: a client-side token from Paddle → Developer tools →
//     Authentication → Client-side tokens. Paste it here once available.
// Until the client token is set (and the domain is approved in Paddle), the
// checkout falls back to a graceful "not available yet" message.
// Live subscription prices (immutable in Paddle — to change, create a new price
// and swap the id here). Monthly $12 / yearly $120.
export const PADDLE_PRICES = {
  monthly: 'pri_01kxbb3dgkh6yq4khqf19ek88q',
  yearly: 'pri_01kxbb3dt3pdcfchzhp8kvsax2',
}
export const PRICE_LABELS = { monthly: '$12', yearly: '$120' }
export const PRICE_LABEL = PRICE_LABELS.monthly // default for compact displays
export const PADDLE_CLIENT_TOKEN = 'live_5b9187cbde834f372cdad73e9d0'
export const PADDLE_ENV = 'production' // 'sandbox' | 'production'

let paddlePromise = null

function loadPaddle() {
  if (window.Paddle) return Promise.resolve(window.Paddle)
  if (paddlePromise) return paddlePromise
  paddlePromise = new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdn.paddle.com/paddle/v2/paddle.js'
    s.async = true
    s.onload = () => resolve(window.Paddle)
    s.onerror = () => reject(new Error('paddle.js failed to load'))
    document.head.appendChild(s)
  })
  return paddlePromise
}

export function isPaddleConfigured() {
  return Boolean(PADDLE_CLIENT_TOKEN)
}

// Opens the Paddle checkout overlay. `plan` = 'monthly' | 'yearly'. customData
// carries the profile id so the webhook can map the subscription back to the user.
export async function openCheckout({ email, profileId, plan = 'monthly', onClose } = {}) {
  if (!isPaddleConfigured()) {
    return { ok: false, reason: 'not_configured' }
  }
  try {
    const priceId = PADDLE_PRICES[plan] || PADDLE_PRICES.monthly
    const Paddle = await loadPaddle()
    if (PADDLE_ENV === 'sandbox') Paddle.Environment.set('sandbox')
    Paddle.Setup({
      token: PADDLE_CLIENT_TOKEN,
      eventCallback: (e) => {
        if (e?.name === 'checkout.closed' || e?.name === 'checkout.completed') onClose?.(e)
      },
    })
    Paddle.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      customer: email ? { email } : undefined,
      customData: profileId ? { profile_id: profileId } : undefined,
      settings: { displayMode: 'overlay', theme: 'dark', locale: 'pl' },
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: e.message }
  }
}

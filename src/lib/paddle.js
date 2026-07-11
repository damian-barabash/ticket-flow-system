// Paddle Billing checkout (client side).
//
// These two values are PUBLIC (safe in the frontend). The secret API key lives
// only as a Supabase Edge Function secret — never here.
//   - PADDLE_PRICE_ID: the 1 zł / month subscription price created in Paddle.
//   - PADDLE_CLIENT_TOKEN: a client-side token from Paddle → Developer tools →
//     Authentication → Client-side tokens. Paste it here once available.
// Until the client token is set (and the domain is approved in Paddle), the
// checkout falls back to a graceful "not available yet" message.
export const PADDLE_PRICE_ID = 'pri_01kx8x8vj4fbms68n88217g7w1'
export const PADDLE_CLIENT_TOKEN = '' // TODO: paste the Paddle client-side token
export const PADDLE_ENV = 'production' // 'sandbox' | 'production'
export const PRICE_LABEL = '1 zł / mies.'

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

// Opens the Paddle checkout overlay for the monthly subscription. `customData`
// carries the profile id so the webhook can map the subscription back to the user.
export async function openCheckout({ email, profileId, onClose } = {}) {
  if (!isPaddleConfigured()) {
    return { ok: false, reason: 'not_configured' }
  }
  try {
    const Paddle = await loadPaddle()
    if (PADDLE_ENV === 'sandbox') Paddle.Environment.set('sandbox')
    Paddle.Setup({
      token: PADDLE_CLIENT_TOKEN,
      eventCallback: (e) => {
        if (e?.name === 'checkout.closed' || e?.name === 'checkout.completed') onClose?.(e)
      },
    })
    Paddle.Checkout.open({
      items: [{ priceId: PADDLE_PRICE_ID, quantity: 1 }],
      customer: email ? { email } : undefined,
      customData: profileId ? { profile_id: profileId } : undefined,
      settings: { displayMode: 'overlay', theme: 'dark', locale: 'pl' },
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: e.message }
  }
}

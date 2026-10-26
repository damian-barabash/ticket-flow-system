import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

const PROFILE_COLS =
  'id, email, full_name, role, avatar_url, language, trial_ends_at, subscription_status, subscription_ends_at, paddle_subscription_id'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [profileError, setProfileError] = useState(false)
  const [loading, setLoading] = useState(true)
  const loadedFor = useRef(null) // user id the current profile belongs to
  const retryTimer = useRef(0)
  const reqId = useRef(0)

  // Loads the profile. On failure the PREVIOUS profile is kept (a staff member
  // must never be downgraded to the client UI by a flaky network) and we retry
  // with a short backoff; the UI shows a small banner via `profileError`.
  const loadProfile = useCallback(async (userId, attempt = 0) => {
    clearTimeout(retryTimer.current)
    if (!userId) {
      loadedFor.current = null
      setProfile(null)
      setProfileError(false)
      return
    }
    const my = ++reqId.current
    const { data, error } = await supabase.from('profiles').select(PROFILE_COLS).eq('id', userId).maybeSingle()
    if (my !== reqId.current) return // a newer request won
    if (error || !data) {
      console.warn('[auth] profile load failed', error)
      setProfileError(true)
      if (attempt < 4) {
        retryTimer.current = setTimeout(() => loadProfile(userId, attempt + 1), [2000, 5000, 10000, 20000][attempt])
      }
      return
    }
    loadedFor.current = userId
    setProfile(data)
    setProfileError(false)
  }, [])

  useEffect(() => {
    let active = true
    // Safety net: never let the app hang on the splash.
    const safety = setTimeout(() => active && setLoading(false), 8000)

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return
        setSession(data.session)
        return loadProfile(data.session?.user?.id)
      })
      .catch((e) => console.warn('[auth] getSession failed', e))
      .finally(() => {
        if (active) {
          clearTimeout(safety)
          setLoading(false)
        }
      })

    const { data: sub } = supabase.auth.onAuthStateChange((event, sess) => {
      // IMPORTANT: never await Supabase calls inside this callback (auth lock).
      setSession(sess)
      const uid = sess?.user?.id ?? null
      if (event === 'SIGNED_OUT' || !uid) {
        setTimeout(() => active && loadProfile(null), 0)
        return
      }
      // TOKEN_REFRESHED (every hour, on tab focus…) must NOT refetch the profile.
      const needs = event === 'USER_UPDATED' || (event === 'SIGNED_IN' && loadedFor.current !== uid)
      if (needs) setTimeout(() => active && loadProfile(uid), 0)
    })

    return () => {
      active = false
      clearTimeout(safety)
      clearTimeout(retryTimer.current)
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signIn = useCallback(async (email, password) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      return error
    } catch (e) {
      return e
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut()
    } catch (e) {
      console.warn('[auth] signOut', e)
    }
    loadedFor.current = null
    setProfile(null)
  }, [])

  const reloadProfile = useCallback(() => loadProfile(session?.user?.id), [loadProfile, session?.user?.id])

  const role = profile?.role ?? null
  const value = {
    session,
    user: session?.user ?? null,
    profile,
    profileError,
    // signed in but the profile (role!) is not known yet → callers must wait
    profileLoading: !!session && !profile && !profileError,
    role,
    // Three-tier model: moderator (super-admin, sees all) > admin (owns projects) > user (client).
    isModerator: role === 'moderator',
    isAdmin: role === 'admin',
    // "staff" = project manager (admin or moderator); used for management UI gating.
    isStaff: role === 'admin' || role === 'moderator',
    loading,
    signIn,
    signOut,
    reloadProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

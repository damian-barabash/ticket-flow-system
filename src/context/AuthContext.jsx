import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null)
      return
    }
    const { data } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, avatar_url, language, trial_ends_at, subscription_status, subscription_ends_at')
      .eq('id', userId)
      .single()
    setProfile(data ?? null)
  }, [])

  useEffect(() => {
    let active = true

    // Safety net: never let the app hang on the loading spinner.
    const safety = setTimeout(() => active && setLoading(false), 8000)

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return
        setSession(data.session)
        return loadProfile(data.session?.user?.id)
      })
      .finally(() => {
        if (active) {
          clearTimeout(safety)
          setLoading(false)
        }
      })

    const { data: sub } = supabase.auth.onAuthStateChange((_e, sess) => {
      // IMPORTANT: do NOT await Supabase calls inside this callback — it holds the
      // auth lock and awaiting a query that triggers a token refresh deadlocks.
      // Update state synchronously and defer the DB read to a microtask.
      setSession(sess)
      setTimeout(() => {
        if (active) loadProfile(sess?.user?.id)
      }, 0)
    })

    return () => {
      active = false
      clearTimeout(safety)
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signIn = useCallback(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    return error
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const role = profile?.role ?? null
  const value = {
    session,
    user: session?.user ?? null,
    profile,
    role,
    // Three-tier model: moderator (super-admin, sees all) > admin (owns projects) > user (client).
    isModerator: role === 'moderator',
    isAdmin: role === 'admin',
    // "staff" = project manager (admin or moderator); used for management UI gating.
    isStaff: role === 'admin' || role === 'moderator',
    loading,
    signIn,
    signOut,
    reloadProfile: () => loadProfile(session?.user?.id),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

import { createClient } from '@supabase/supabase-js'

// Publishable key is meant to be public (RLS protects the data).
export const SUPABASE_URL = 'https://ebmroanhngmigjxljzlp.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_XSG1naB1xSulG-UhtCTmRw_JdHOsvV-'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

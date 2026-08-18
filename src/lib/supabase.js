import { createClient } from '@supabase/supabase-js'

// The publishable ("anon") key is meant to ship to the browser. Every table is
// protected by row level security and every write goes through a SECURITY
// DEFINER function, so this key on its own grants nothing.
export const SUPABASE_URL = 'https://ewfgjupzkdvzmbbbxvxw.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_m0YSmFGO8nIVaSWXHfWNxg_UNcm41qi'

export const EMAIL_DOMAIN = '@fuel.local'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
})

/** Turn a username into the synthetic email the auth layer stores. */
export function usernameToEmail(username) {
  const u = String(username || '').trim().toLowerCase()
  return u.includes('@') ? u : u + EMAIL_DOMAIN
}

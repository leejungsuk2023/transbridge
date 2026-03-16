/**
 * Supabase client initialization
 * - Browser client: uses ANON key, safe for client-side
 * - Service role client: uses SERVICE_ROLE key, for server-side API routes only
 */

import { createClient } from '@supabase/supabase-js';

// Browser client (safe for client-side, uses anon key with RLS)
export function getSupabaseBrowserClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Named singleton for components that import { supabase } directly
// Lazy proxy — evaluated on first property access, not at module import time,
// so Next.js build-time page data collection does not crash with missing env vars.
export const supabase = new Proxy({} as ReturnType<typeof getSupabaseBrowserClient>, {
  get(_target, prop) {
    return (getSupabaseBrowserClient() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// Server client with service role (API routes only — bypasses RLS)
export function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

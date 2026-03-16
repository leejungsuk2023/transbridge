/**
 * Supabase client initialization
 * - Browser client: singleton, uses ANON key, safe for client-side
 * - Service role client: uses SERVICE_ROLE key, for server-side API routes only
 */

import { createClient } from '@supabase/supabase-js';

// Singleton browser client — one instance per browser tab, prevents
// "Multiple GoTrueClient instances detected" warning and ensures session
// state is shared across all callers.
// NOTE: Only stored when running in a real browser (window exists).
// During SSR the singleton is never set, so each server render gets a
// fresh, non-persisting instance and never clobbers the client singleton.
let browserClient: ReturnType<typeof createClient> | null = null;

export function getSupabaseBrowserClient() {
  // Server-side (SSR/build): return a throw-away instance with no session
  // persistence so the module-level singleton is never touched server-side.
  if (typeof window === 'undefined') {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
  }

  // Client-side: reuse the singleton so session state is shared.
  if (!browserClient) {
    browserClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return browserClient;
}

// Named export for components that import { supabase } directly.
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

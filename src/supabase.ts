import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.VITE_SUPABASE_ANON_KEY
)?.trim();

/** True only after .env.local contains a Supabase URL and browser-safe key. */
export const supabaseConfigured = Boolean(url && key);

/**
 * The client is optional on purpose. Local IndexedDB remains the default until
 * Supabase is configured, so development and offline use keep working.
 */
export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, key!, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    })
  : null;

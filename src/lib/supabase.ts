import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types/database";

/**
 * Browser Supabase client.
 *
 * Constructed from environment variables so that no credentials are hard-coded
 * in source (Requirement 13.1). The ONLY Supabase credential present in the
 * client bundle is the public anon key (Requirement 13.4) - the service-role
 * key is never referenced here and lives exclusively in Edge Function secrets.
 *
 * The URL and anon key are read from `import.meta.env`, which Vite statically
 * replaces at build time. Using separate `.env` values for dev and prod keeps
 * environments isolated (Requirement 13.5).
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // In development without a .env file, fall through with placeholder values
  // so the dev server starts and the UI is browsable. Any operation that
  // actually calls Supabase (sign-in, data fetch, etc.) will fail gracefully
  // with a network error rather than crashing the whole app on startup.
  // To connect a real backend, copy .env.example to .env and fill in the values.
  console.warn(
    "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. " +
      "The app will render but all backend calls will fail. " +
      "Copy .env.example to .env and add your Supabase credentials to enable full functionality.",
  );
}

export const supabase = createClient<Database>(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseAnonKey ?? "placeholder-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

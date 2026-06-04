import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser Supabase client (anon key — safe to expose). Used only to push image
// bytes to a pre-signed Storage upload URL, so no RLS write policy is needed.
let _sb: SupabaseClient | null = null;

export function supabaseBrowser(): SupabaseClient {
  if (_sb) return _sb;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase browser env not configured.");
  _sb = createClient(url, key, { auth: { persistSession: false } });
  return _sb;
}

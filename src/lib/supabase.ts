import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Mini Project Hub. The anon key is public by design (it shipped in the original page); env vars
// override it per deployment.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ungtmfwxqawkdiflmora.supabase.co";
const KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuZ3RtZnd4cWF3a2RpZmxtb3JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxMDY4NjQsImV4cCI6MjA3NzY4Mjg2NH0.Yaq0XfbbkwxJDUoiPCS7bLVBy70Wa-NOOWIxkpRRxdc";

let client: SupabaseClient | null = null;

export function sb(): SupabaseClient {
  if (!client) client = createClient(URL, KEY);
  return client;
}

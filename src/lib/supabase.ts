import { createBrowserClient } from "@supabase/ssr";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Mini Project Hub. The anon key is public by design (it shipped in the original page); env vars
// override it per deployment.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://ungtmfwxqawkdiflmora.supabase.co";
const KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVuZ3RtZnd4cWF3a2RpZmxtb3JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIxMDY4NjQsImV4cCI6MjA3NzY4Mjg2NH0.Yaq0XfbbkwxJDUoiPCS7bLVBy70Wa-NOOWIxkpRRxdc";

// Since stage 3 of Overseer sign-in (PotatOS doc 10 §7) the tables answer only a signed-in Overseer
// person with this system switched on. In the browser the client reads Overseer's session cookie
// (same site, sb-<project>-auth-token), so the person's sign-in carries in; on the server it is
// anonymous.
let client: SupabaseClient | null = null;

export function sb(): SupabaseClient {
  if (!client) client = typeof window !== "undefined" ? createBrowserClient(URL, KEY, { cookieOptions: { path: "/", sameSite: "lax", secure: location.protocol === "https:" } }) : createClient(URL, KEY, { auth: { persistSession: false } });
  return client;
}

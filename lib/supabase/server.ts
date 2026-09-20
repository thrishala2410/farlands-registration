import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { getSupabaseEnv } from "@/lib/env";

export function createBearerClient(accessToken: string): SupabaseClient {
  const env = getSupabaseEnv();
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    // Node 20 has no native WebSocket. Supabase Realtime requires this explicit transport.
    realtime: { transport: WebSocket as never },
  });
}

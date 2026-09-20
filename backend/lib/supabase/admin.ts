import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { getSupabaseEnv } from "@/lib/env";

let adminClient: SupabaseClient | undefined;

export function getAdminClient(): SupabaseClient {
  if (!adminClient) {
    const env = getSupabaseEnv();
    adminClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      // Node 20 has no native WebSocket. Supabase Realtime requires this explicit
      // transport even though this privileged client does not subscribe to channels.
      realtime: { transport: WebSocket as never },
    });
  }
  return adminClient;
}

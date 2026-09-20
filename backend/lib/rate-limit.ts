import { createHash } from "node:crypto";
import { HttpError } from "@/lib/http";
import { getAdminClient } from "@/lib/supabase/admin";

export { checkRateLimit, RATE_LIMITS, type RateLimitConfig } from "@/lib/edge-limiter";

export function requestAddress(headers: Headers): string {
  return headers.get("cf-connecting-ip")?.trim()
    ?? headers.get("x-real-ip")?.trim()
    ?? headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()
    ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
}

/** Uses Postgres so limits are shared by all serverless instances. */
export async function enforceRateLimit(
  request: Request,
  action: string,
  userId: string | undefined,
  limit: number,
  windowSeconds: number
) {
  const rawSubject = userId ? `user:${userId}` : `ip:${requestAddress(request.headers)}`;
  const subject = createHash("sha256").update(rawSubject).digest("hex");
  const { data, error } = await getAdminClient().rpc("take_payment_rate_limit", {
    p_subject: subject,
    p_action: action,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error || data !== true) {
    if (!error) throw new HttpError(429, "Too many requests. Please wait and try again.");
    throw new HttpError(503, "Request protection is temporarily unavailable. Please try again shortly.");
  }
}

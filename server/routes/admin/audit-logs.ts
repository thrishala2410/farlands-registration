import { adminOnly, adminJson } from "@/lib/admin";
import { apiError, pagination } from "@/lib/http";
import { getAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    await adminOnly(request);
    const url = new URL(request.url);
    const { page, pageSize, from, to } = pagination(url.searchParams);
    const action = url.searchParams.get("action");
    const actorRole = url.searchParams.get("actorRole");
    const registrationId = url.searchParams.get("registrationId");

    const admin = getAdminClient();

    let query = admin
      .from("audit_logs")
      .select("id, action, actor_role, actor_id, registration_id, payment_proof_id, metadata, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (action) query = query.eq("action", action);
    if (actorRole) query = query.eq("actor_role", actorRole);
    if (registrationId) query = query.eq("registration_id", registrationId);

    const { data, count, error } = await query;
    if (error) throw error;

    return adminJson({
      auditLogs: data ?? [],
      page,
      pageSize,
      total: count ?? 0,
    });
  } catch (error) {
    return apiError(error);
  }
}
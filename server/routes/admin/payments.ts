import { adminOnly, adminJson } from "@/lib/admin";
import { apiError, pagination } from "@/lib/http";
import { getAdminClient } from "@/lib/supabase/admin";
import { sanitizePostgrestFilter } from "@/lib/auth";

const allowedStatuses = new Set(["pending_verification", "paid", "payment_failed"]);

export async function GET(request: Request) {
  try {
    await adminOnly(request);
    const url = new URL(request.url);
    const { page, pageSize, from, to } = pagination(url.searchParams);
    const status = url.searchParams.get("status");
    const search = url.searchParams.get("search")?.trim();
    let query = getAdminClient()
      .from("payment_proofs")
      .select("id, utr, amount, currency, status, rejection_reason, created_at, reviewed_at, registrations(registration_number, team_id, teams(id, team_id, team_name, status, participants(id, name, participant_id, email)))", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (status && allowedStatuses.has(status)) query = query.eq("status", status);
    if (search) {
      const sanitized = sanitizePostgrestFilter(search);
      if (sanitized) query = query.ilike("utr", `%${sanitized}%`);
    }
    const { data, count, error } = await query;
    if (error) throw error;
    const payments = (data ?? []).map((proof) => {
      const registration = Array.isArray(proof.registrations) ? proof.registrations[0] : proof.registrations;
      const team = registration && (Array.isArray(registration.teams) ? registration.teams[0] : registration.teams);
      const anyT = (team ?? {}) as Record<string, unknown>;
      const teamId = (anyT.team_id as string) || (registration?.registration_number ? registration.registration_number.replace(/^REG-\d{4}-/, "").replace(/-[A-Z0-9]{4}$/, "") : "N/A");
      return {
        id: proof.id,
        utr: proof.utr,
        amount: proof.amount,
        currency: proof.currency,
        status: proof.status,
        rejectionReason: proof.rejection_reason,
        submittedAt: proof.created_at,
        reviewedAt: proof.reviewed_at,
        registrationNumber: registration?.registration_number ?? "Unknown",
        teamId,
        teamName: team?.team_name ?? "Unknown",
        members: team?.participants ?? [],
      };
    });
    return adminJson({ payments, page, pageSize, total: count ?? 0 });
  } catch (error) { return apiError(error); }
}
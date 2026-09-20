import { adminOnly, adminJson } from "@/lib/admin";
import { apiError, pagination } from "@/lib/http";
import { getAdminClient } from "@/lib/supabase/admin";
import { sanitizePostgrestFilter } from "@/lib/auth";

const allowedStatuses = new Set(["pending_payment", "payment_processing", "confirmed"]);

export async function GET(request: Request) {
  try {
    await adminOnly(request);
    const url = new URL(request.url);
    const { page, pageSize, from, to } = pagination(url.searchParams);
    const status = url.searchParams.get("status");
    const search = url.searchParams.get("search")?.trim();

    const admin = getAdminClient();

    let query = admin
      .from("registrations")
      .select(
        "id, registration_number, status, fee_amount, currency, confirmed_at, created_at, updated_at, teams(id, team_id, team_name, status, participants(id, participant_id, name, email))",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (status && allowedStatuses.has(status)) {
      query = query.eq("status", status);
    }

    if (search) {
      const sanitized = sanitizePostgrestFilter(search);
      if (sanitized) query = query.ilike("registration_number", `%${sanitized}%`);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    const registrations = (data ?? []).map((reg) => {
      const team = Array.isArray(reg.teams) ? reg.teams[0] : reg.teams;
      const anyT = (team ?? {}) as Record<string, unknown>;
      const teamId = (anyT.team_id as string) || (reg.registration_number ? reg.registration_number.replace(/^REG-\d{4}-/, "").replace(/-[A-Z0-9]{4}$/, "") : "N/A");

      return {
        id: reg.id,
        registrationNumber: reg.registration_number,
        status: reg.status,
        feeAmount: reg.fee_amount,
        currency: reg.currency,
        confirmedAt: reg.confirmed_at,
        createdAt: reg.created_at,
        updatedAt: reg.updated_at,
        team: {
          id: team?.id ?? "Unknown",
          teamId,
          teamName: team?.team_name ?? "Unknown",
          members: team?.participants ?? [],
        },
      };
    });

    return adminJson({
      registrations,
      page,
      pageSize,
      total: count ?? 0,
    });
  } catch (error) {
    return apiError(error);
  }
}
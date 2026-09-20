import { adminOnly, adminJson } from "@/lib/admin";
import { apiError, pagination } from "@/lib/http";
import { getAdminClient } from "@/lib/supabase/admin";
import { escapeLikeWildcards } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    await adminOnly(request);
    const url = new URL(request.url);
    const { page, pageSize, from, to } = pagination(url.searchParams);
    const status = url.searchParams.get("status");
    const search = url.searchParams.get("search")?.trim();

    const admin = getAdminClient();

    let query = admin
      .from("teams")
      .select(
        "id, team_id, team_name, status, created_at, updated_at, participants(id, participant_id, name, email, phone, status), registrations(id, registration_number, status, fee_amount, currency, confirmed_at)",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (status && (status === "active" || status === "disabled")) {
      // Check if status column exists or filter safely
      query = query.eq("status", status);
    }

    if (search) {
      const sanitized = escapeLikeWildcards(search);
      query = query.ilike("team_name", `%${sanitized}%`);
    }

    const { data, count, error } = await query;
    if (error) throw error;

    const teams = (data ?? []).map((t) => {
      const reg = Array.isArray(t.registrations) ? t.registrations[0] : t.registrations;
      const members = (t.participants ?? []) as Array<{ id: string; participant_id: string; name: string; email: string; phone: string | null; status: string }>;
      
      // Extract team_id if available, otherwise derive from registration number
      const anyT = t as Record<string, unknown>;
      const teamId = (anyT.team_id as string) || (reg?.registration_number ? reg.registration_number.replace(/^REG-\d{4}-/, "").replace(/-[A-Z0-9]{4}$/, "") : "N/A");
      const teamStatus = (anyT.status as string) || "active";

      return {
        id: t.id,
        teamId,
        teamName: t.team_name,
        status: teamStatus,
        memberCount: members.length,
        members,
        registration: reg ? {
          id: reg.id,
          registrationNumber: reg.registration_number,
          status: reg.status,
          feeAmount: reg.fee_amount,
          currency: reg.currency,
          confirmedAt: reg.confirmed_at,
        } : null,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      };
    });

    return adminJson({
      teams,
      page,
      pageSize,
      total: count ?? 0,
    });
  } catch (error) {
    return apiError(error);
  }
}
import { adminOnly, adminJson } from "@/lib/admin";
import { apiError, pagination } from "@/lib/http";
import { getAdminClient } from "@/lib/supabase/admin";
import { sanitizePostgrestFilter } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    await adminOnly(request);
    const url = new URL(request.url);
    const { page, pageSize, from, to } = pagination(url.searchParams);
    const status = url.searchParams.get("status");
    const teamId = url.searchParams.get("teamId");
    const search = url.searchParams.get("search")?.trim();

    const admin = getAdminClient();

    let query = admin
      .from("participants")
      .select("id, participant_id, name, email, phone, status, is_checked_in, team_id, created_at, updated_at, teams(id, team_name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (status && (status === "active" || status === "disabled")) {
      query = query.eq("status", status);
    }

    if (teamId) {
      query = query.eq("team_id", teamId);
    }

    if (search) {
      const sanitized = sanitizePostgrestFilter(search);
      if (sanitized) {
        query = query.or(
          `participant_id.ilike.%${sanitized}%,name.ilike.%${sanitized}%,email.ilike.%${sanitized}%`
        );
      }
    }

    const { data, count, error } = await query;
    if (error) throw error;

    const participants = (data ?? []).map((p) => {
      const team = Array.isArray(p.teams) ? p.teams[0] : p.teams;
      return {
        id: p.id,
        participantId: p.participant_id,
        name: p.name,
        email: p.email,
        phone: p.phone,
        status: p.status,
        isCheckedIn: p.is_checked_in,
        teamId: p.team_id,
        teamName: team?.team_name ?? "Unknown",
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      };
    });

    return adminJson({
      participants,
      page,
      pageSize,
      total: count ?? 0,
    });
  } catch (error) {
    return apiError(error);
  }
}
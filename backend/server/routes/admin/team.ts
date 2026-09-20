import { z } from "zod";
import { adminOnly, adminJson } from "@/lib/admin";
import { apiError, HttpError, parseBody } from "@/lib/http";
import { getAdminClient } from "@/lib/supabase/admin";
import { teamUpdateSchema } from "@/lib/validation";
import { writeAudit } from "@/lib/audit";

type Context = { params: Promise<{ id: string }> };
const idSchema = z.string().uuid();

export async function GET(request: Request, { params }: Context) {
  try {
    await adminOnly(request);
    const id = idSchema.parse((await params).id);
    const admin = getAdminClient();

    const { data: team, error: teamErr } = await admin
      .from("teams")
      .select(
        "id, team_id, team_name, status, created_at, updated_at, participants(id, participant_id, name, email, phone, status, is_checked_in, created_at), registrations(id, registration_number, status, fee_amount, currency, confirmed_at, created_at)"
      )
      .eq("id", id)
      .maybeSingle();

    if (teamErr || !team) throw new HttpError(404, "Team not found");

    // Fetch payments for this team
    const { data: payments } = await admin
      .from("payment_proofs")
      .select("id, utr, amount, currency, status, rejection_reason, created_at, reviewed_at")
      .eq("team_id", id)
      .order("created_at", { ascending: false });

    const anyT = team as Record<string, unknown>;
    const reg = Array.isArray(team.registrations) ? team.registrations[0] : team.registrations;
    const teamId = (anyT.team_id as string) || (reg?.registration_number ? reg.registration_number.replace(/^REG-\d{4}-/, "").replace(/-[A-Z0-9]{4}$/, "") : "N/A");

    return adminJson({
      team: {
        id: team.id,
        teamId,
        teamName: team.team_name,
        status: (anyT.status as string) || "active",
        members: team.participants ?? [],
        registration: reg ?? null,
        payments: payments ?? [],
        createdAt: team.created_at,
        updatedAt: team.updated_at,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const actor = await adminOnly(request);
    const id = idSchema.parse((await params).id);
    const input = await parseBody(request, teamUpdateSchema);
    const admin = getAdminClient();

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (input.teamName) updatePayload.team_name = input.teamName;
    if (input.status) updatePayload.status = input.status;

    let updated: { id: string; team_name: string; team_id?: string | null; status?: string; updated_at?: string } | null = null;
    const { data: primaryResult, error: primaryError } = await admin
      .from("teams")
      .update(updatePayload)
      .eq("id", id)
      .select("id, team_id, team_name, status, updated_at")
      .single();
    let error = primaryError;

    if (error && error.message?.includes("column")) {
      delete updatePayload.status;
      const fallback = await admin
        .from("teams")
        .update(updatePayload)
        .eq("id", id)
        .select("id, team_name, updated_at")
        .single();
      updated = fallback.data ? { ...fallback.data, team_id: null, status: "active" } : null;
      error = fallback.error;
    } else {
      updated = primaryResult;
    }

    if (error || !updated) throw new HttpError(404, "Team not found or could not be updated");

    await writeAudit({
      action: "admin.team_updated",
      actorRole: "admin",
      actorId: actor.user.id,
      metadata: {
        teamId: id,
        changes: input,
      },
    });

    return adminJson({
      success: true,
      team: updated,
    });
  } catch (error) {
    return apiError(error);
  }
}
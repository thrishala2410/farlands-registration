import { z } from "zod";
import { adminOnly, adminJson } from "@/lib/admin";
import { apiError, HttpError, parseBody } from "@/lib/http";
import { getAdminClient } from "@/lib/supabase/admin";
import { participantUpdateSchema } from "@/lib/validation";
import { writeAudit } from "@/lib/audit";

type Context = { params: Promise<{ id: string }> };
const idSchema = z.string().uuid();

export async function GET(request: Request, { params }: Context) {
  try {
    await adminOnly(request);
    const id = idSchema.parse((await params).id);
    const admin = getAdminClient();

    const { data: participant, error } = await admin
      .from("participants")
      .select("id, participant_id, name, email, phone, status, is_checked_in, team_id, created_at, updated_at, teams(id, team_name)")
      .eq("id", id)
      .maybeSingle();

    if (error || !participant) throw new HttpError(404, "Participant not found");

    const team = Array.isArray(participant.teams) ? participant.teams[0] : participant.teams;

    return adminJson({
      participant: {
        id: participant.id,
        participantId: participant.participant_id,
        name: participant.name,
        email: participant.email,
        phone: participant.phone,
        status: participant.status,
        isCheckedIn: participant.is_checked_in,
        teamId: participant.team_id,
        teamName: team?.team_name ?? "Unknown",
        createdAt: participant.created_at,
        updatedAt: participant.updated_at,
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
    const input = await parseBody(request, participantUpdateSchema);
    const admin = getAdminClient();

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      ...input,
    };

    let { data: updated, error } = await admin
      .from("participants")
      .update(updatePayload)
      .eq("id", id)
      .select("id, participant_id, name, status")
      .single();

    // Fallback if optional columns don't exist on legacy test DB
    if (error && error.message?.includes("column")) {
      delete updatePayload.college;
      delete updatePayload.course;
      delete updatePayload.year;
      const fallback = await admin
        .from("participants")
        .update(updatePayload)
        .eq("id", id)
        .select("id, participant_id, name, status")
        .single();
      updated = fallback.data;
      error = fallback.error;
    }

    if (error || !updated) throw new HttpError(404, "Participant not found or could not be updated");

    await writeAudit({
      action: "admin.participant_updated",
      actorRole: "admin",
      actorId: actor.user.id,
      metadata: {
        participantId: id,
        changes: input,
      },
    });

    return adminJson({
      success: true,
      participant: updated,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const actor = await adminOnly(request);
    const id = idSchema.parse((await params).id);
    const admin = getAdminClient();

    const { data: participant, error: findErr } = await admin
      .from("participants")
      .select("id, name, email, team_id, participant_id")
      .eq("id", id)
      .maybeSingle();
    if (findErr || !participant) throw new HttpError(404, "Participant not found");

    const { error: delErr } = await admin.from("participants").delete().eq("id", id);
    if (delErr) throw delErr;

    await writeAudit({
      action: "admin.participant_deleted",
      actorRole: "admin",
      actorId: actor.user.id,
      metadata: {
        name: participant.name,
        email: participant.email,
        teamId: participant.team_id,
        participantId: participant.participant_id,
      },
    });

    return adminJson({ ok: true, deleted: id });
  } catch (error) {
    return apiError(error);
  }
}

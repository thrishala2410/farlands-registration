import { randomUUID } from "node:crypto";
import { registerParticipantAuth, signInUser } from "@/lib/auth";
import { apiError, HttpError, json, parseBody } from "@/lib/http";
import { getAdminClient } from "@/lib/supabase/admin";
import { registrationSchema } from "@/lib/validation";
import { writeAudit } from "@/lib/audit";
import { setSessionCookies } from "@/lib/session";

export const runtime = "nodejs";
const participantCode = () => `P-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
const registrationCode = () => `REG-${new Date().getUTCFullYear()}-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;

export async function POST(request: Request) {
  const createdUserIds: string[] = [];
  let teamId: string | undefined;
  try {
    const input = await parseBody(request, registrationSchema);
    const members = [input.leader, ...input.members];
    for (const member of members) {
      const user = await registerParticipantAuth(member.email, member.password);
      createdUserIds.push(user.id);
    }
    const admin = getAdminClient();
    const { data: team, error: teamError } = await admin.from("teams").insert({ team_name: input.teamName }).select("id, team_name").single();
    if (teamError || !team) throw new HttpError(teamError?.code === "23505" ? 409 : 500, teamError?.code === "23505" ? "Team name is already registered" : "Registration could not be created");
    teamId = team.id;
    const participantRows = members.map((member, index) => ({
      participant_id: participantCode(), name: member.name, email: member.email, phone: member.phone || null,
      team_id: team.id, auth_user_id: createdUserIds[index], status: "active",
    }));
    const { data: participants, error: participantError } = await admin.from("participants").insert(participantRows).select("id, participant_id, name, auth_user_id");
    if (participantError || !participants || participants.length !== members.length) throw new HttpError(500, "Registration could not be created");
    const { error: profileError } = await admin.from("auth_profiles").insert(participants.map((participant) => ({ user_id: participant.auth_user_id, role: "participant", participant_id: participant.id })));
    if (profileError) throw new HttpError(500, "Registration could not be created");
    const { data: registration, error: registrationError } = await admin.from("registrations").insert({ team_id: team.id, registration_number: registrationCode(), fee_amount: 100000, currency: "INR", status: "pending_payment" }).select("id, registration_number, fee_amount, currency, status").single();
    if (registrationError || !registration) throw new HttpError(500, "Registration could not be created");
    const session = await signInUser(input.leader.email, input.leader.password);
    await writeAudit({ action: "registration.created", actorRole: "participant", actorId: session.user.participantId ?? undefined, registrationId: registration.id, metadata: { memberCount: members.length } });
    const response = json({ team: { id: team.id, name: team.team_name }, registration, participants: participants.map(({ id, participant_id, name }) => ({ id, participantId: participant_id, name })) }, 201, true);
    setSessionCookies(response, { accessToken: session.accessToken, refreshToken: session.refreshToken });
    return response;
  } catch (error) {
    const admin = getAdminClient();
    if (teamId) {
      await admin.from("registrations").delete().eq("team_id", teamId);
      await admin.from("participants").delete().eq("team_id", teamId);
      await admin.from("teams").delete().eq("id", teamId);
    }
    await Promise.allSettled(createdUserIds.map((id) => admin.auth.admin.deleteUser(id)));
    return apiError(error);
  }
}

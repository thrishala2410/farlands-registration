import { randomUUID } from "node:crypto";
import { registerParticipantAuth, signInUser } from "@/lib/auth";
import { apiError, HttpError, json, parseBody } from "@/lib/http";
import { getAdminClient } from "@/lib/supabase/admin";
import { registrationSchema, toLegacyRegistration } from "@/lib/validation";
import { writeAudit } from "@/lib/audit";
import { setSessionCookies } from "@/lib/session";
import { generateTeamId } from "@/lib/team-id";
import { enforceRateLimit } from "@/lib/rate-limit";

const participantCode = () => `P-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;

export async function POST(request: Request) {
  const createdUserIds: string[] = [];
  let teamIdUuid: string | undefined;

  try {
    // Rate limit public registrations: 10 attempts per hour per IP
    try {
      await enforceRateLimit(request, "public-registration", undefined, 10, 60 * 60);
    } catch (rateLimitErr) {
      if (rateLimitErr instanceof HttpError && rateLimitErr.status === 429) throw rateLimitErr;
      if (process.env.NODE_ENV === "production") throw rateLimitErr;
    }

    const parsed = await parseBody(request, registrationSchema);
    const input = toLegacyRegistration(parsed);
    const members = [input.leader, ...input.members];
    const admin = getAdminClient();

    // 1. Check if team name is already taken
    const { data: existingTeam } = await admin
      .from("teams")
      .select("id")
      .ilike("team_name", input.teamName)
      .maybeSingle();

    if (existingTeam) {
      throw new HttpError(409, "A team with this name has already registered");
    }

    // 2. Check if any participant email is already in participants table
    const emails = members.map((m) => m.email.toLowerCase());
    const { data: existingParticipants } = await admin
      .from("participants")
      .select("email")
      .in("email", emails)
      .limit(1);

    if (existingParticipants && existingParticipants.length > 0) {
      throw new HttpError(409, "One or more participant emails are already registered");
    }

    // 3. Generate unique, unpredictable Team ID
    let teamIdCode = generateTeamId("FL26", 6);
    let attempts = 0;
    while (attempts < 5) {
      try {
        const { data: conflict } = await admin
          .from("teams")
          .select("id")
          .eq("team_id", teamIdCode)
          .maybeSingle();
        if (!conflict) break;
      } catch {
        break;
      }
      teamIdCode = generateTeamId("FL26", 6);
      attempts++;
    }

    // 4. Provision Supabase Auth accounts for leader and members
    for (const member of members) {
      const memberPassword = (member.password && member.password.length >= 8) ? member.password : teamIdCode;
      const user = await registerParticipantAuth(member.email, memberPassword);
      createdUserIds.push(user.id);
    }

    // 5. Create Team Record
    let teamInsertPayload: Record<string, unknown> = {
      team_name: input.teamName,
      team_id: teamIdCode,
      status: "active",
    };

    let { data: team, error: teamError } = await admin
      .from("teams")
      .insert(teamInsertPayload)
      .select("id, team_name")
      .single();

    // If database schema does not yet have team_id or status column, fallback gracefully
    if (teamError && teamError.message?.includes("column")) {
      teamInsertPayload = { team_name: input.teamName };
      const fallbackResult = await admin
        .from("teams")
        .insert(teamInsertPayload)
        .select("id, team_name")
        .single();
      team = fallbackResult.data;
      teamError = fallbackResult.error;
    }

    if (teamError || !team) {
      throw new HttpError(
        teamError?.code === "23505" ? 409 : 500,
        teamError?.code === "23505" ? "Team name is already registered" : "Registration could not be created"
      );
    }
    teamIdUuid = team.id;

    // 6. Create Participant Records
    const participantRows = members.map((member, index) => ({
      participant_id: participantCode(),
      name: member.name,
      email: member.email,
      phone: member.phone || null,
      college: member.college || null,
      course: member.course || null,
      year: member.year || null,
      team_id: team.id,
      auth_user_id: createdUserIds[index],
      status: "active",
    }));

    let { data: participants, error: participantError } = await admin
      .from("participants")
      .insert(participantRows)
      .select("id, participant_id, name, email, auth_user_id");

    // Fallback if college/course/year columns are not yet in legacy test DB
    if (participantError && participantError.message?.includes("column")) {
      const strippedRows = participantRows.map((row) => {
        const copy: Record<string, unknown> = { ...row };
        delete copy.college;
        delete copy.course;
        delete copy.year;
        return copy;
      });
      const fallbackRes = await admin
        .from("participants")
        .insert(strippedRows)
        .select("id, participant_id, name, email, auth_user_id");
      participants = fallbackRes.data;
      participantError = fallbackRes.error;
    }

    if (participantError || !participants || participants.length !== members.length) {
      throw new HttpError(500, "Registration could not be created");
    }

    // 7. Create Auth Profiles
    const { error: profileError } = await admin
      .from("auth_profiles")
      .insert(
        participants.map((participant) => ({
          user_id: participant.auth_user_id,
          role: "participant",
          participant_id: participant.id,
        }))
      );

    if (profileError) throw new HttpError(500, "Registration could not be created");

    // 8. Create Registration Record
    const registrationNumber = `REG-2026-${teamIdCode}-${randomUUID().slice(0, 4).toUpperCase()}`;
    const { data: registration, error: registrationError } = await admin
      .from("registrations")
      .insert({
        team_id: team.id,
        registration_number: registrationNumber,
        fee_amount: 120000,
        currency: "INR",
        status: "pending_payment",
      })
      .select("id, registration_number, fee_amount, currency, status")
      .single();

    if (registrationError || !registration) throw new HttpError(500, "Registration could not be created");

    // 9. Sign in team leader to obtain HttpOnly session
    const leaderPassword = (input.leader.password && input.leader.password.length >= 8) ? input.leader.password : teamIdCode;
    const session = await signInUser(input.leader.email, leaderPassword);

    // 10. Audit log
    await writeAudit({
      action: "registration.created",
      actorRole: "participant",
      actorId: session.user.participantId ?? undefined,
      registrationId: registration.id,
      metadata: {
        teamId: teamIdCode,
        teamName: team.team_name,
        memberCount: members.length,
      },
    });

    const response = json(
      {
        success: true,
        team: {
          id: team.id,
          name: team.team_name,
          teamName: team.team_name,
          teamId: teamIdCode,
        },
        registration: {
          id: registration.id,
          registrationId: registration.id,
          registrationNumber: teamIdCode,
          registration_number: teamIdCode,
          teamId: teamIdCode,
          status: registration.status,
          feeAmount: registration.fee_amount,
          currency: registration.currency,
        },
        participants: participants.map(({ id, participant_id, name, email }) => ({
          id,
          participantId: participant_id,
          name,
          email,
        })),
      },
      201,
      true
    );

    setSessionCookies(response, {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
    });

    return response;
  } catch (error) {
    if (createdUserIds.length > 0 || teamIdUuid) {
      try {
        const admin = getAdminClient();
        if (createdUserIds.length > 0) {
          try { await admin.from("auth_profiles").delete().in("user_id", createdUserIds); } catch { /* ignore */ }
        }
        if (teamIdUuid) {
          try { await admin.from("registrations").delete().eq("team_id", teamIdUuid); } catch { /* ignore */ }
          try { await admin.from("participants").delete().eq("team_id", teamIdUuid); } catch { /* ignore */ }
          try { await admin.from("teams").delete().eq("id", teamIdUuid); } catch { /* ignore */ }
        }
        await Promise.allSettled(createdUserIds.map((id) => admin.auth.admin.deleteUser(id)));
      } catch { /* cleanup is best-effort */ }
    }
    return apiError(error);
  }
}
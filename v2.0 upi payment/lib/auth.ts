import type { User } from "@supabase/supabase-js";
import { HttpError } from "@/lib/http";
import { getAdminClient } from "@/lib/supabase/admin";
import { createAnonClient } from "@/lib/supabase/client";
import { createBearerClient } from "@/lib/supabase/server";
import { getAccessSessionToken } from "@/lib/session";
import { getSupabaseEnv } from "@/lib/env";

export type Role = "participant" | "admin";
export type AuthenticatedUser = {
  user: User;
  role: Role;
  participantId: string | null;
  teamId: string | null;
};
export type AuthSessionResult = { accessToken: string; refreshToken: string; user: AuthenticatedUser };

export function getRequestAccessToken(headers: Headers): string {
  const value = headers.get("authorization");
  if (value?.startsWith("Bearer ") && value.length >= 20) return value.slice(7);
  const sessionToken = getAccessSessionToken(headers);
  if (sessionToken) return sessionToken;
  throw new HttpError(401, "Authentication required");
}

export async function verifyAccessToken(token: string): Promise<AuthenticatedUser> {
  const client = createBearerClient(token);
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user) throw new HttpError(401, "Invalid access token");

  const admin = getAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("auth_profiles").select("role, participant_id").eq("user_id", user.id).maybeSingle();
  if (profileError || !profile || (profile.role !== "participant" && profile.role !== "admin")) throw new HttpError(403, "Account is not authorized");
  if (profile.role === "admin") return { user, role: "admin", participantId: null, teamId: null };

  const { data: participant, error: participantError } = await admin
    .from("participants").select("id, team_id, status").eq("id", profile.participant_id).eq("auth_user_id", user.id).maybeSingle();
  if (participantError || !participant) throw new HttpError(403, "Account is not authorized");
  if (participant.status !== "active") throw new HttpError(403, "Account is disabled");
  return { user, role: "participant", participantId: participant.id, teamId: participant.team_id };
}

export async function requireAuth(headers: Headers): Promise<AuthenticatedUser> { return verifyAccessToken(getRequestAccessToken(headers)); }
export async function requireAdmin(headers: Headers): Promise<AuthenticatedUser> {
  const result = await requireAuth(headers);
  if (result.role !== "admin") throw new HttpError(403, "Admin access required");
  return result;
}
export async function requireParticipant(headers: Headers): Promise<AuthenticatedUser> {
  const result = await requireAuth(headers);
  if (result.role !== "participant") throw new HttpError(403, "Participant access required");
  return result;
}
export async function requireTeamMember(headers: Headers, teamId: string): Promise<AuthenticatedUser> {
  const result = await requireParticipant(headers);
  if (result.teamId !== teamId) throw new HttpError(403, "You do not belong to this team");
  return result;
}

export async function signInUser(email: string, password: string): Promise<AuthSessionResult> {
  const { data, error } = await createAnonClient().auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) throw new HttpError(401, "Invalid credentials");
  const authenticated = await verifyAccessToken(data.session.access_token);
  return { accessToken: data.session.access_token, refreshToken: data.session.refresh_token, user: authenticated };
}

/** Exchanges a server-only refresh token for a new session after the access token expires. */
export async function refreshUserSession(refreshToken: string): Promise<AuthSessionResult> {
  const { data, error } = await createAnonClient().auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session || !data.user) throw new HttpError(401, "Session has expired");
  const user = await verifyAccessToken(data.session.access_token);
  return { accessToken: data.session.access_token, refreshToken: data.session.refresh_token, user };
}

/** Revokes the current Supabase session where possible; cookie clearing still happens on any network failure. */
export async function revokeUserSession(accessToken: string | null) {
  if (!accessToken) return;
  const env = getSupabaseEnv();
  await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/logout`, {
    method: "POST",
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  }).catch(() => undefined);
}

/** Resolves full name server-side; every candidate is tried to avoid disclosing email addresses. */
export async function signInParticipant(nameEmailOrId: string, password: string): Promise<AuthSessionResult> {
  const admin = getAdminClient();
  const identifier = nameEmailOrId.trim();
  const byEmail = identifier.includes("@");
  const byParticipantId = /^P-[A-Z0-9]{6,32}$/i.test(identifier);
  const query = admin.from("participants").select("email, auth_user_id")
    .not("auth_user_id", "is", null)
    .limit(20);
  const { data: candidates, error } = byEmail
    ? await query.ilike("email", identifier)
    : byParticipantId
      ? await query.eq("participant_id", identifier.toUpperCase())
      : await query.ilike("name", identifier);
  if (error || !candidates?.length) throw new HttpError(401, "Invalid credentials");
  for (const candidate of candidates) {
    try {
      const result = await signInUser(candidate.email, password);
      if (result.user.role === "participant") return result;
    } catch { /* Deliberately continue: names can be duplicated. */ }
  }
  throw new HttpError(401, "Invalid credentials");
}

export async function registerParticipantAuth(email: string, password: string) {
  const { data, error } = await getAdminClient().auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new HttpError(409, "Unable to create participant account");
  return data.user;
}

export async function provisionAdminAccount(email: string, password: string, username: string) {
  const admin = getAdminClient();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error("Unable to create admin user");
  const { error: profileError } = await admin.from("auth_profiles").insert({ user_id: data.user.id, role: "admin", username });
  if (profileError) { await admin.auth.admin.deleteUser(data.user.id); throw new Error("Unable to create admin profile"); }
  return data.user;
}

export async function deleteTestAuthUser(userId: string) {
  if (process.env.NODE_ENV !== "test") throw new Error("Test-user deletion is restricted to NODE_ENV=test");
  const { error } = await getAdminClient().auth.admin.deleteUser(userId);
  if (error) throw new Error("Unable to delete test user");
}

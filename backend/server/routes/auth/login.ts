import { apiError, HttpError, json, parseBody } from "@/lib/http";
import { loginSchema } from "@/lib/validation";
import { signInParticipant, signInUser } from "@/lib/auth";
import { setSessionCookies } from "@/lib/session";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const input = await parseBody(request, loginSchema);

    // Rate limit login attempts: 10 attempts per 15 minutes
    const identifier = (input.teamId || input.email || input.participantId || input.name) as string;
    try {
      await enforceRateLimit(request, "auth-login", identifier, 10, 15 * 60);
    } catch (rateLimitErr) {
      if (rateLimitErr instanceof HttpError && rateLimitErr.status === 429) throw rateLimitErr;
      if (process.env.NODE_ENV === "production") throw rateLimitErr;
    }

    let sessionResult;
    if (input.teamId) {
      sessionResult = await signInParticipant(input.teamId, input.password);
    } else if (input.email) {
      // Check if it is an admin or participant
      try {
        sessionResult = await signInUser(input.email, input.password);
      } catch {
        sessionResult = await signInParticipant(input.email, input.password);
      }
    } else if (input.participantId) {
      sessionResult = await signInParticipant(input.participantId, input.password);
    } else if (input.name) {
      sessionResult = await signInParticipant(input.name, input.password);
    } else {
      throw new HttpError(400, "Provide a login identifier");
    }

    const response = json({
      success: true,
      user: {
        role: sessionResult.user.role,
        participantId: sessionResult.user.participantId,
        teamId: sessionResult.user.teamId,
      },
    }, 200, true);

    setSessionCookies(response, {
      accessToken: sessionResult.accessToken,
      refreshToken: sessionResult.refreshToken,
    });

    return response;
  } catch (error) {
    return apiError(error);
  }
}
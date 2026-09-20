import { json } from "@/lib/http";
import { getAccessSessionToken, clearSessionCookies } from "@/lib/session";
import { revokeUserSession } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const token = getAccessSessionToken(request.headers);
    if (token) {
      await revokeUserSession(token);
    }
  } catch {
    // Session revocation failure should not prevent cookie clearing
  }

  const response = json({ success: true, message: "Signed out successfully" }, 200, true);
  clearSessionCookies(response);
  return response;
}
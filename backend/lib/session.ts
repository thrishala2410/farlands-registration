const production = process.env.NODE_ENV === "production";
const ACCESS_COOKIE = production ? "__Host-farlands-access" : "farlands-access";
const REFRESH_COOKIE = production ? "__Host-farlands-refresh" : "farlands-refresh";
const refreshLifetimeSeconds = 60 * 60 * 24 * 7;

const cookieOptions = {
  httpOnly: true,
  secure: production,
  sameSite: "strict" as const,
  path: "/",
  priority: "high" as const,
};

function cookieValue(headers: Headers, name: string) {
  const cookie = headers.get("cookie") ?? "";
  const prefix = `${name}=`;
  const value = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith(prefix))?.slice(prefix.length);
  return value ? decodeURIComponent(value) : null;
}

export function getAccessSessionToken(headers: Headers) { return cookieValue(headers, ACCESS_COOKIE); }
export function getRefreshSessionToken(headers: Headers) { return cookieValue(headers, REFRESH_COOKIE); }

type SessionTokens = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt?: number;
};

function serializeCookie(name: string, value: string, maxAge: number) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    ...(cookieOptions.secure ? ["Secure"] : []),
    `SameSite=${cookieOptions.sameSite[0].toUpperCase()}${cookieOptions.sameSite.slice(1)}`,
    `Max-Age=${Math.max(0, maxAge)}`,
    `Priority=${cookieOptions.priority[0].toUpperCase()}${cookieOptions.priority.slice(1)}`,
  ];
  return parts.join("; ");
}

/**
 * The browser receives only HttpOnly cookies. It cannot inspect either Supabase
 * token from JavaScript, rendered markup, storage, or a URL.
 */
export function setSessionCookies(response: Response, session: SessionTokens) {
  const accessLifetimeSeconds = session.accessExpiresAt
    ? Math.max(60, session.accessExpiresAt - Math.floor(Date.now() / 1000))
    : 60 * 60;
  response.headers.append("Set-Cookie", serializeCookie(ACCESS_COOKIE, session.accessToken, accessLifetimeSeconds));
  response.headers.append("Set-Cookie", serializeCookie(REFRESH_COOKIE, session.refreshToken, refreshLifetimeSeconds));
  return response;
}

export function clearSessionCookies(response: Response) {
  response.headers.append("Set-Cookie", serializeCookie(ACCESS_COOKIE, "", 0));
  response.headers.append("Set-Cookie", serializeCookie(REFRESH_COOKIE, "", 0));
  return response;
}
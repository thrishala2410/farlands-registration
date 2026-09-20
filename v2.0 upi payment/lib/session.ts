import type { NextResponse } from "next/server";

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

/**
 * The browser receives only HttpOnly cookies. It cannot inspect either Supabase
 * token from JavaScript, rendered markup, storage, or a URL.
 */
export function setSessionCookies(response: NextResponse, session: SessionTokens) {
  const accessLifetimeSeconds = session.accessExpiresAt
    ? Math.max(60, session.accessExpiresAt - Math.floor(Date.now() / 1000))
    : 60 * 60;
  response.cookies.set(ACCESS_COOKIE, session.accessToken, { ...cookieOptions, maxAge: accessLifetimeSeconds });
  response.cookies.set(REFRESH_COOKIE, session.refreshToken, { ...cookieOptions, maxAge: refreshLifetimeSeconds });
}

export function clearSessionCookies(response: NextResponse) {
  response.cookies.set(ACCESS_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  response.cookies.set(REFRESH_COOKIE, "", { ...cookieOptions, maxAge: 0 });
}

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { checkRateLimit, RATE_LIMITS } from "@/lib/edge-limiter";
import { requestAddress } from "@/lib/rate-limit";
import { json } from "@/lib/http";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DIST_DIR = join(ROOT, "dist");

// ─── Env file loader (runs before any env validation) ───────────────────────
function loadEnvFile(file: string) {
  let contents: string;
  try {
    contents = readFileSync(file, "utf8");
  } catch {
    return;
  }
  for (const rawLine of contents.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvFile(join(ROOT, ".env.local"));
loadEnvFile(join(ROOT, ".env"));

// ─── Route handlers ──────────────────────────────────────────────────────────
import * as registrationRoute from "./routes/registration";
import * as loginRoute from "./routes/auth/login";
import * as logoutRoute from "./routes/auth/logout";
import * as paymentStatusRoute from "./routes/payments/status";
import * as submitProofRoute from "./routes/payments/submit-proof";
import * as proofRoute from "./routes/payments/proof";
import * as adminStatsRoute from "./routes/admin/stats";
import * as adminTeamsRoute from "./routes/admin/teams";
import * as adminTeamRoute from "./routes/admin/team";
import * as adminParticipantsRoute from "./routes/admin/participants";
import * as adminParticipantRoute from "./routes/admin/participant";
import * as adminRegistrationsRoute from "./routes/admin/registrations";
import * as adminPaymentsRoute from "./routes/admin/payments";
import * as adminPaymentRoute from "./routes/admin/payment";
import * as adminPaymentVerifyRoute from "./routes/admin/payment-verify";
import * as adminPaymentRejectRoute from "./routes/admin/payment-reject";
import * as adminAuditLogsRoute from "./routes/admin/audit-logs";

type Handler = (request: Request, context: any) => Promise<Response> | Response;

interface RouteDef {
  pattern: string[];
  handlers: Partial<Record<string, Handler>>;
  tier: keyof typeof RATE_LIMITS;
  guard?: "admin" | "payment";
}

const routes: RouteDef[] = [
  { pattern: ["api", "registration"], handlers: { POST: registrationRoute.POST }, tier: "registration" },

  { pattern: ["api", "auth", "login"], handlers: { POST: loginRoute.POST }, tier: "auth" },
  { pattern: ["api", "auth", "logout"], handlers: { POST: logoutRoute.POST }, tier: "general" },

  { pattern: ["api", "payments", "status"], handlers: { GET: paymentStatusRoute.GET }, tier: "payment", guard: "payment" },
  { pattern: ["api", "payments", "submit-proof"], handlers: { POST: submitProofRoute.POST }, tier: "payment", guard: "payment" },
  { pattern: ["api", "payments", "proof", ":id"], handlers: { GET: proofRoute.GET }, tier: "payment", guard: "payment" },

  { pattern: ["api", "admin", "stats"], handlers: { GET: adminStatsRoute.GET }, tier: "admin", guard: "admin" },
  { pattern: ["api", "admin", "teams"], handlers: { GET: adminTeamsRoute.GET }, tier: "admin", guard: "admin" },
  { pattern: ["api", "admin", "teams", ":id"], handlers: { GET: adminTeamRoute.GET, PATCH: adminTeamRoute.PATCH, DELETE: adminTeamRoute.DELETE }, tier: "admin", guard: "admin" },
  { pattern: ["api", "admin", "participants"], handlers: { GET: adminParticipantsRoute.GET }, tier: "admin", guard: "admin" },
  { pattern: ["api", "admin", "participants", ":id"], handlers: { GET: adminParticipantRoute.GET, PATCH: adminParticipantRoute.PATCH, DELETE: adminParticipantRoute.DELETE }, tier: "admin", guard: "admin" },
  { pattern: ["api", "admin", "registrations"], handlers: { GET: adminRegistrationsRoute.GET }, tier: "admin", guard: "admin" },
  { pattern: ["api", "admin", "payments"], handlers: { GET: adminPaymentsRoute.GET }, tier: "admin", guard: "admin" },
  { pattern: ["api", "admin", "payments", ":id"], handlers: { GET: adminPaymentRoute.GET }, tier: "admin", guard: "admin" },
  { pattern: ["api", "admin", "payments", ":id", "verify"], handlers: { POST: adminPaymentVerifyRoute.POST }, tier: "admin", guard: "admin" },
  { pattern: ["api", "admin", "payments", ":id", "reject"], handlers: { POST: adminPaymentRejectRoute.POST }, tier: "admin", guard: "admin" },
  { pattern: ["api", "admin", "audit-logs"], handlers: { GET: adminAuditLogsRoute.GET }, tier: "admin", guard: "admin" },
];

function matchRoute(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  for (const route of routes) {
    if (route.pattern.length !== segments.length) continue;
    const params: Record<string, string> = {};
    let matches = true;
    for (let i = 0; i < route.pattern.length; i++) {
      const expected = route.pattern[i];
      if (expected.startsWith(":")) {
        params[expected.slice(1)] = decodeURIComponent(segments[i]);
      } else if (expected !== segments[i]) {
        matches = false;
        break;
      }
    }
    if (matches) return { route, params };
  }
  return null;
}

// ─── Edge middleware guards (ported from the former Next.js middleware.ts) ───
function hasCredentials(request: Request) {
  const authHeader = request.headers.get("authorization");
  const hasBearer = Boolean(authHeader?.startsWith("Bearer ") && authHeader.length >= 20);
  const accessCookie = request.headers.get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("__Host-farlands-access=") || part.startsWith("farlands-access="));
  return hasBearer || Boolean(accessCookie);
}

function applyGuard(request: Request, route: RouteDef): Response | null {
  if (route.guard === "admin" && !hasCredentials(request)) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (route.guard === "payment" && !hasCredentials(request)) {
    return json({ error: "Unauthorized" }, 401);
  }
  const identifier = requestAddress(request.headers);
  const result = checkRateLimit(`${route.tier}:${identifier}`, RATE_LIMITS[route.tier]);
  if (!result.allowed) {
    return new Response(JSON.stringify({ error: "Too many requests. Please try again later." }), {
      status: 429,
      headers: { "Content-Type": "application/json", "Retry-After": String(result.retryAfterSeconds) },
    });
  }
  return null;
}

// ─── Request/Response adapters ───────────────────────────────────────────────
function toRequest(req: IncomingMessage, url: URL): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.append(key, value);
    }
  }
  const init: Record<string, unknown> = { method: req.method, headers };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = Readable.toWeb(req);
    init.duplex = "half";
  }
  return new Request(url.toString(), init as RequestInit);
}

function setCookiesOf(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
}

async function sendResponse(res: ServerResponse, response: Response) {
  res.statusCode = response.status;
  for (const [key, value] of response.headers) {
    if (key.toLowerCase() === "set-cookie") continue;
    res.setHeader(key, value);
  }
  const cookies = setCookiesOf(response);
  if (cookies.length) res.setHeader("Set-Cookie", cookies);
  if (response.body) {
    const stream = Readable.fromWeb(response.body as never);
    for await (const chunk of stream) res.write(chunk);
  }
  res.end();
}

// ─── Static frontend (built by `vite build` into ./dist) ─────────────────────
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".gltf": "model/gltf+json",
  ".glb": "model/gltf-binary",
  ".bin": "application/octet-stream",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

function serveStatic(res: ServerResponse, pathname: string): boolean {
  if (!existsSync(DIST_DIR)) return false;
  const clean = pathname.split("?")[0];
  const relative = clean === "/" ? "index.html" : clean.replace(/^\/+/, "");
  const filePath = resolve(join(DIST_DIR, relative));
  if (!filePath.startsWith(resolve(DIST_DIR) + sep) && filePath !== resolve(join(DIST_DIR, "index.html"))) {
    return false;
  }
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(filePath);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  const contentType = MIME_TYPES[extname(filePath)] ?? "application/octet-stream";
  res.statusCode = 200;
  res.setHeader("Content-Type", contentType);
  createReadStream(filePath).pipe(res);
  return true;
}

// ─── CORS for cross-origin development (Vite dev server on another port) ─────
// Returns true only when the request has been fully handled (OPTIONS preflight).
const DEV_ORIGINS = new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);

function applyCors(res: ServerResponse, requestHeaders: Headers, requestMethod: string): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const origin = requestHeaders.get("origin") ?? "";
  const allowed = DEV_ORIGINS.has(origin);
  if (allowed) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Cookie");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  if (requestMethod === "OPTIONS" && allowed) {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}

// ─── Server ──────────────────────────────────────────────────────────────────
const server = createServer((req, res) => {
  const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
  const pathname = requestUrl.pathname;

  try {
    if (pathname.startsWith("/api/") || pathname === "/api") {
      const request = toRequest(req, requestUrl);
      if (applyCors(res, request.headers, req.method ?? "GET")) return;
      const matched = matchRoute(pathname);
      if (!matched) {
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Not found" }));
        return;
      }
      const method = (req.method ?? "GET").toUpperCase();
      const handler = matched.route.handlers[method];
      if (!handler) {
        res.statusCode = 405;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Method not allowed" }));
        return;
      }
      const guarded = applyGuard(request, matched.route);
      if (guarded) {
        sendResponse(res, guarded).catch(() => res.end());
        return;
      }
      Promise.resolve(handler(request, { params: Promise.resolve(matched.params) }))
        .then((response) => sendResponse(res, response))
        .catch(() => sendResponse(res, json({ error: "Internal server error" }, 500)));
      return;
    }

    // Non-API: serve the built frontend when available.
    if (req.method === "GET" || req.method === "HEAD") {
      if (serveStatic(res, pathname)) return;
      if (pathname !== "/" && !extname(pathname)) {
        const indexFile = join(DIST_DIR, "index.html");
        if (existsSync(indexFile)) {
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          createReadStream(indexFile).pipe(res);
          return;
        }
      }
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end("Not found");
      return;
    }
    res.statusCode = 405;
    res.end();
  } catch (error) {
    console.error("[SERVER_ERROR]", error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Internal server error" }));
    } else {
      res.end();
    }
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, () => {
  console.log(`Farlands API server listening on http://localhost:${port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}
process.on("SIGINT", shutdown);
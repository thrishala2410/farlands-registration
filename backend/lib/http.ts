import { z } from "zod";

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export const noStore = { "Cache-Control": "no-store" };

export function json(data: unknown, status = 200, privateResponse = false): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(privateResponse ? noStore : undefined),
    },
  });
}

export function apiError(error: unknown): Response {
  if (error instanceof HttpError) return json({ error: error.message }, error.status, error.status !== 404);
  if (error instanceof z.ZodError) return json({ error: "Invalid request", details: error.flatten() }, 400);
  // Log unexpected errors for server-side monitoring while keeping client response opaque
  console.error("[API_UNEXPECTED_ERROR]", error);
  return json({ error: "Internal server error" }, 500, true);
}

export async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try { body = await request.json(); } catch { throw new HttpError(400, "Invalid JSON body"); }
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, "Invalid request");
  return result.data;
}

export function pagination(searchParams: URLSearchParams) {
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 25) || 25));
  return { page, pageSize, from: (page - 1) * pageSize, to: page * pageSize - 1 };
}
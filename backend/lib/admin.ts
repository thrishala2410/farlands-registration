import { requireAdmin, type AuthenticatedUser } from "@/lib/auth";
import { json, noStore } from "@/lib/http";

export async function adminOnly(request: Request): Promise<AuthenticatedUser> { return requireAdmin(request.headers); }
export function adminJson(data: unknown, status = 200) { return json(data, status, true); }
export { noStore };

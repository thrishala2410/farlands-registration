import { z } from "zod";
import { adminOnly, adminJson } from "@/lib/admin";
import { apiError, HttpError } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getAdminClient } from "@/lib/supabase/admin";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await adminOnly(request);
    await enforceRateLimit(request, "payment-proof-review", actor.user.id, 30, 60 * 60);
    const id = z.string().uuid().parse((await params).id);
    const { data, error } = await getAdminClient().rpc("review_manual_payment_proof", {
      p_proof_id: id,
      p_admin_user_id: actor.user.id,
      p_approve: true,
      p_reason: null,
    });
    if (error) throw error;
    const reviewed = Array.isArray(data) ? data[0] : data;
    if (!reviewed) throw new HttpError(409, "This payment proof has already been reviewed.");
    return adminJson({ success: true, payment: reviewed });
  } catch (error) { return apiError(error); }
}

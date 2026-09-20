import { z } from "zod";
import { adminOnly, adminJson } from "@/lib/admin";
import { apiError, HttpError, parseBody } from "@/lib/http";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getAdminClient } from "@/lib/supabase/admin";
import { paymentReviewSchema } from "@/lib/validation";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    const actor = await adminOnly(request);
    await enforceRateLimit(request, "payment-proof-review", actor.user.id, 30, 60 * 60);
    const id = z.string().uuid().parse((await params).id);
    const input = await parseBody(request, paymentReviewSchema);
    if (!input.reason) throw new HttpError(400, "A rejection reason is required.");
    const { data, error } = await getAdminClient().rpc("review_manual_payment_proof", {
      p_proof_id: id,
      p_admin_user_id: actor.user.id,
      p_approve: false,
      p_reason: input.reason,
    });
    if (error) throw error;
    const reviewed = Array.isArray(data) ? data[0] : data;
    if (!reviewed) throw new HttpError(409, "This payment proof has already been reviewed.");
    return adminJson({ success: true, payment: reviewed });
  } catch (error) { return apiError(error); }
}

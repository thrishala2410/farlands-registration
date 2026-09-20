import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { apiError, HttpError, json } from "@/lib/http";
import { PAYMENT_PROOF_BUCKET } from "@/lib/manual-payment";
import { getAdminClient } from "@/lib/supabase/admin";

type Context = { params: Promise<{ id: string }> };
const idSchema = z.string().uuid();

export const runtime = "nodejs";

export async function GET(request: Request, { params }: Context) {
  try {
    const viewer = await requireAuth(request.headers);
    const id = idSchema.parse((await params).id);
    const admin = getAdminClient();
    const { data: proof, error } = await admin
      .from("payment_proofs")
      .select("id, screenshot_path, registrations(team_id)")
      .eq("id", id)
      .maybeSingle();
    if (error || !proof) throw new HttpError(404, "Payment proof not found.");
    const registration = Array.isArray(proof.registrations) ? proof.registrations[0] : proof.registrations;
    if (viewer.role === "participant" && registration?.team_id !== viewer.teamId) throw new HttpError(403, "You do not have permission to view this proof.");
    const { data, error: signedUrlError } = await admin.storage.from(PAYMENT_PROOF_BUCKET).createSignedUrl(proof.screenshot_path, 60);
    if (signedUrlError || !data?.signedUrl) throw new HttpError(502, "The payment screenshot is temporarily unavailable.");
    return json({ url: data.signedUrl, expiresIn: 60 }, 200, true);
  } catch (error) { return apiError(error); }
}

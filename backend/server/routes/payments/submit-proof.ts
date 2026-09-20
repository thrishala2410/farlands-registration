import { requireParticipant } from "@/lib/auth";
import { apiError, HttpError, json } from "@/lib/http";
import { paymentProofPath, readPaymentImage, PAYMENT_PROOF_BUCKET } from "@/lib/manual-payment";
import { enforceRateLimit } from "@/lib/rate-limit";
import { getAdminClient } from "@/lib/supabase/admin";
import { utrSchema } from "@/lib/validation";

export async function POST(request: Request) {
  let storagePath: string | null = null;
  try {
    const viewer = await requireParticipant(request.headers);
    if (!viewer.participantId || !viewer.teamId) throw new HttpError(403, "A team registration is required.");
    await enforceRateLimit(request, "payment-proof-submission", viewer.user.id, 5, 60 * 60);
    const form = await request.formData();
    const parsedUtr = utrSchema.safeParse(form.get("utr"));
    if (!parsedUtr.success) throw new HttpError(400, "Enter a valid UPI transaction ID or UTR.");
    const { bytes, image } = await readPaymentImage(form.get("screenshot"));
    const admin = getAdminClient();
    const { data: registration, error: registrationError } = await admin
      .from("registrations")
      .select("id, status")
      .eq("team_id", viewer.teamId)
      .maybeSingle();
    if (registrationError || !registration) throw new HttpError(404, "Registration not found.");
    if (registration.status === "confirmed") throw new HttpError(409, "This registration has already been confirmed.");
    storagePath = paymentProofPath(viewer.teamId, image);
    const { error: uploadError } = await admin.storage.from(PAYMENT_PROOF_BUCKET).upload(storagePath, bytes, {
      contentType: image.mimeType,
      upsert: false,
      cacheControl: "private, max-age=0",
    });
    if (uploadError) throw new HttpError(502, "The screenshot could not be stored. Please try again.");
    const { data: result, error: submitError } = await admin.rpc("submit_manual_payment_proof", {
      p_registration_id: registration.id,
      p_participant_id: viewer.participantId,
      p_utr: parsedUtr.data,
      p_screenshot_path: storagePath,
    });
    if (submitError) {
      if (submitError.message.includes("already under verification")) throw new HttpError(409, "A payment proof is already under verification for this registration.");
      if (submitError.code === "23505") throw new HttpError(409, "This UTR has already been submitted.");
      throw submitError;
    }
    const proof = Array.isArray(result) ? result[0] : result;
    if (!proof) throw new Error("Payment proof submission returned no result.");
    const { data: storedProof } = await admin.from("payment_proofs").select("screenshot_path").eq("id", proof.proof_id).maybeSingle();
    if (!storedProof || storedProof.screenshot_path !== storagePath) await admin.storage.from(PAYMENT_PROOF_BUCKET).remove([storagePath]).catch(() => undefined);
    storagePath = null;
    return json({
      success: true,
      message: "Payment proof submitted successfully. It is under organizer verification.",
      data: { paymentId: proof.proof_id, status: proof.proof_status },
    }, 201, true);
  } catch (error) {
    if (storagePath) await getAdminClient().storage.from(PAYMENT_PROOF_BUCKET).remove([storagePath]).catch(() => undefined);
    return apiError(error);
  }
}
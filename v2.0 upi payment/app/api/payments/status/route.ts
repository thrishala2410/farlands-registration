import { requireParticipant } from "@/lib/auth";
import { getManualPaymentEnv } from "@/lib/env";
import { apiError, HttpError, json } from "@/lib/http";
import { lastFour, PAYMENT_QR_PUBLIC_PATH } from "@/lib/manual-payment";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const viewer = await requireParticipant(request.headers);
    if (!viewer.teamId) throw new HttpError(403, "A team registration is required.");
    const admin = getAdminClient();
    const { data: registration, error: registrationError } = await admin
      .from("registrations")
      .select("id, registration_number, status, fee_amount, currency, confirmed_at")
      .eq("team_id", viewer.teamId)
      .maybeSingle();
    if (registrationError || !registration) throw new HttpError(404, "Registration not found.");
    const { data: proof, error: proofError } = await admin
      .from("payment_proofs")
      .select("id, status, utr, created_at, reviewed_at, rejection_reason")
      .eq("registration_id", registration.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (proofError) throw proofError;
    return json({
      registration: {
        id: registration.id,
        number: registration.registration_number,
        status: registration.status,
        feeAmount: registration.fee_amount,
        currency: registration.currency,
        confirmedAt: registration.confirmed_at,
      },
      payment: proof ? {
        id: proof.id,
        status: proof.status,
        utrLastFour: lastFour(proof.utr),
        submittedAt: proof.created_at,
        reviewedAt: proof.reviewed_at,
        rejectionReason: proof.status === "payment_failed" ? proof.rejection_reason : null,
      } : null,
      paymentInstructions: {
        upiId: getManualPaymentEnv().PAYMENT_UPI_ID,
        qrPath: PAYMENT_QR_PUBLIC_PATH,
      },
    }, 200, true);
  } catch (error) { return apiError(error); }
}

import { z } from "zod";
import { adminOnly, adminJson } from "@/lib/admin";
import { apiError, HttpError } from "@/lib/http";
import { PAYMENT_PROOF_BUCKET } from "@/lib/manual-payment";
import { getAdminClient } from "@/lib/supabase/admin";

type Context = { params: Promise<{ id: string }> };
const idSchema = z.string().uuid();

export async function GET(request: Request, { params }: Context) {
  try {
    await adminOnly(request);
    const id = idSchema.parse((await params).id);
    const admin = getAdminClient();

    const { data: proof, error } = await admin
      .from("payment_proofs")
      .select(
        "id, utr, amount, currency, status, screenshot_path, rejection_reason, created_at, reviewed_at, reviewed_by, registrations(id, registration_number, fee_amount, currency, status), teams(id, team_id, team_name, status, participants(id, participant_id, name, email))"
      )
      .eq("id", id)
      .maybeSingle();

    if (error || !proof) throw new HttpError(404, "Payment proof not found");

    const registration = Array.isArray(proof.registrations) ? proof.registrations[0] : proof.registrations;
    const team = Array.isArray(proof.teams) ? proof.teams[0] : proof.teams;
    const anyT = (team ?? {}) as Record<string, unknown>;
    const teamId = (anyT.team_id as string) || (registration?.registration_number ? registration.registration_number.replace(/^REG-\d{4}-/, "").replace(/-[A-Z0-9]{4}$/, "") : "N/A");

    // Generate signed URL for the screenshot (60s lifetime)
    let screenshotUrl: string | null = null;
    if (proof.screenshot_path) {
      const { data: signedData } = await admin.storage
        .from(PAYMENT_PROOF_BUCKET)
        .createSignedUrl(proof.screenshot_path, 60);
      screenshotUrl = signedData?.signedUrl ?? null;
    }

    return adminJson({
      payment: {
        id: proof.id,
        utr: proof.utr,
        amount: proof.amount,
        currency: proof.currency,
        status: proof.status,
        rejectionReason: proof.rejection_reason,
        screenshotUrl,
        submittedAt: proof.created_at,
        reviewedAt: proof.reviewed_at,
        reviewedBy: proof.reviewed_by,
        registration: registration ? {
          id: registration.id,
          registrationNumber: registration.registration_number,
          status: registration.status,
        } : null,
        team: team ? {
          id: team.id,
          teamId,
          teamName: team.team_name,
          members: team.participants ?? [],
        } : null,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
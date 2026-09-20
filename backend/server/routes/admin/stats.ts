import { adminOnly, adminJson } from "@/lib/admin";
import { apiError } from "@/lib/http";
import { getAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  try {
    await adminOnly(request);
    const admin = getAdminClient();

    // 1. Total Teams
    const { count: totalTeams, error: teamsErr } = await admin
      .from("teams")
      .select("*", { count: "exact", head: true });
    if (teamsErr) throw teamsErr;

    // 2. Total Participants
    const { count: totalParticipants, error: partErr } = await admin
      .from("participants")
      .select("*", { count: "exact", head: true });
    if (partErr) throw partErr;

    // 3. Total Registrations
    const { count: totalRegistrations, error: regErr } = await admin
      .from("registrations")
      .select("*", { count: "exact", head: true });
    if (regErr) throw regErr;

    // 4. Payment statuses
    const { count: pendingPayments } = await admin
      .from("payment_proofs")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending_verification");

    const { count: verifiedPayments, data: paidRows } = await admin
      .from("payment_proofs")
      .select("amount")
      .eq("status", "paid");

    const { count: rejectedPayments } = await admin
      .from("payment_proofs")
      .select("*", { count: "exact", head: true })
      .eq("status", "payment_failed");

    const verifiedAmount = (paidRows ?? []).reduce((sum, row) => sum + (row.amount || 0), 0);

    // 5. Today's Registrations
    const startOfToday = new Date();
    startOfToday.setUTCHours(0, 0, 0, 0);
    const { count: todayRegistrations } = await admin
      .from("registrations")
      .select("*", { count: "exact", head: true })
      .gte("created_at", startOfToday.toISOString());

    return adminJson({
      statistics: {
        totalTeams: totalTeams ?? 0,
        totalParticipants: totalParticipants ?? 0,
        totalRegistrations: totalRegistrations ?? 0,
        pendingPayments: pendingPayments ?? 0,
        verifiedPayments: verifiedPayments ?? 0,
        rejectedPayments: rejectedPayments ?? 0,
        verifiedAmount,
        currency: "INR",
        todayRegistrations: todayRegistrations ?? 0,
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
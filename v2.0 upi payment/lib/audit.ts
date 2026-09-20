import { getAdminClient } from "@/lib/supabase/admin";
import { sanitizeAuditMetadata } from "@/lib/security";

export async function writeAudit(entry: { action: string; actorRole: "participant" | "admin" | "system"; actorId?: string; registrationId?: string; paymentOrderId?: string; metadata?: unknown }) {
  const { error } = await getAdminClient().from("audit_logs").insert({
    action: entry.action, actor_role: entry.actorRole, actor_id: entry.actorId ?? null,
    registration_id: entry.registrationId ?? null, payment_order_id: entry.paymentOrderId ?? null,
    metadata: sanitizeAuditMetadata(entry.metadata),
  });
  if (error) throw new Error("Could not write audit log");
}

import test from "node:test";
import assert from "node:assert/strict";
import { getAdminClient } from "../lib/supabase/admin";
import { getSupabaseEnv, getManualPaymentEnv } from "../lib/env";

test("Live DB: environment variables are configured and valid", () => {
  const env = getSupabaseEnv();
  assert.ok(env.NEXT_PUBLIC_SUPABASE_URL.startsWith("https://"));
  assert.ok(env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 20);
  assert.ok(env.SUPABASE_SERVICE_ROLE_KEY.length > 20);

  const paymentEnv = getManualPaymentEnv();
  assert.ok(paymentEnv.PAYMENT_UPI_ID.includes("@"));
});

test("Live DB: can query core registration tables", async () => {
  const admin = getAdminClient();

  const [teamsRes, partsRes, regsRes, proofsRes] = await Promise.all([
    admin.from("teams").select("id", { count: "exact", head: true }),
    admin.from("participants").select("id", { count: "exact", head: true }),
    admin.from("registrations").select("id", { count: "exact", head: true }),
    admin.from("payment_proofs").select("id", { count: "exact", head: true }),
  ]);

  assert.equal(teamsRes.error, null);
  assert.equal(partsRes.error, null);
  assert.equal(regsRes.error, null);
  assert.equal(proofsRes.error, null);
});

test("Live DB: distributed rate limit RPC function executes correctly", async () => {
  const admin = getAdminClient();
  const testSubject = "test-subj-" + Date.now();

  const { data, error } = await admin.rpc("take_payment_rate_limit", {
    p_subject: testSubject,
    p_action: "test-integration",
    p_limit: 2,
    p_window_seconds: 60,
  });

  assert.equal(error, null);
  assert.equal(data, true);
});

test("Live DB: private payment-proofs storage bucket exists and is private", async () => {
  const admin = getAdminClient();
  const { data, error } = await admin.storage.getBucket("payment-proofs");

  assert.equal(error, null);
  assert.equal(data?.id, "payment-proofs");
  assert.equal(data?.public, false);
});

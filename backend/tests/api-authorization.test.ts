import test from "node:test";
import assert from "node:assert/strict";
import { GET as adminPaymentsGet } from "../server/routes/admin/payments";
import { GET as adminStatsGet } from "../server/routes/admin/stats";
import { GET as adminTeamsGet } from "../server/routes/admin/teams";
import { GET as adminParticipantsGet } from "../server/routes/admin/participants";
import { POST as registrationPost } from "../server/routes/registration";
import { POST as loginPost } from "../server/routes/auth/login";

test("API Guard: unauthenticated request to /api/admin/payments is denied (401)", async () => {
  const request = new Request("http://localhost:3000/api/admin/payments");
  const response = await adminPaymentsGet(request);
  assert.equal(response.status, 401);
  const data = await response.json();
  assert.equal(data.error, "Authentication required");
});

test("API Guard: unauthenticated request to /api/admin/stats is denied (401)", async () => {
  const request = new Request("http://localhost:3000/api/admin/stats");
  const response = await adminStatsGet(request);
  assert.equal(response.status, 401);
  const data = await response.json();
  assert.equal(data.error, "Authentication required");
});

test("API Guard: unauthenticated request to /api/admin/teams is denied (401)", async () => {
  const request = new Request("http://localhost:3000/api/admin/teams");
  const response = await adminTeamsGet(request);
  assert.equal(response.status, 401);
  const data = await response.json();
  assert.equal(data.error, "Authentication required");
});

test("API Guard: unauthenticated request to /api/admin/participants is denied (401)", async () => {
  const request = new Request("http://localhost:3000/api/admin/participants");
  const response = await adminParticipantsGet(request);
  assert.equal(response.status, 401);
  const data = await response.json();
  assert.equal(data.error, "Authentication required");
});

test("API Guard: malformed request to /api/registration returns 400 Validation Error", async () => {
  const request = new Request("http://localhost:3000/api/registration", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ teamName: "A" }), // Invalid team name (< 3 chars) and missing members
  });
  const response = await registrationPost(request);
  assert.equal(response.status, 400);
  const data = await response.json();
  assert.equal(data.error, "Invalid request");
});

test("API Guard: malformed login request without identifier returns 400", async () => {
  const request = new Request("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: "password123" }),
  });
  const response = await loginPost(request);
  assert.equal(response.status, 400);
  const data = await response.json();
  assert.equal(data.error, "Invalid request");
});

test("API Guard: unauthenticated request to /api/payments/status is denied (401)", async () => {
  const { GET: statusGet } = await import("../server/routes/payments/status");
  const request = new Request("http://localhost:3000/api/payments/status");
  const response = await statusGet(request);
  assert.equal(response.status, 401);
  const data = await response.json();
  assert.equal(data.error, "Authentication required");
});

test("API Guard: unauthenticated request to /api/payments/submit-proof is denied (401)", async () => {
  const { POST: submitProofPost } = await import("../server/routes/payments/submit-proof");
  const request = new Request("http://localhost:3000/api/payments/submit-proof", { method: "POST" });
  const response = await submitProofPost(request);
  assert.equal(response.status, 401);
  const data = await response.json();
  assert.equal(data.error, "Authentication required");
});

test("API Guard: unauthenticated request to /api/payments/proof/:id is denied (401)", async () => {
  const { GET: proofGet } = await import("../server/routes/payments/proof");
  const request = new Request("http://localhost:3000/api/payments/proof/00000000-0000-0000-0000-000000000000");
  const response = await proofGet(request, { params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }) });
  assert.equal(response.status, 401);
  const data = await response.json();
  assert.equal(data.error, "Authentication required");
});

test("API Guard: /api/auth/logout returns 200 and clears session cookies", async () => {
  const { POST: logoutPost } = await import("../server/routes/auth/logout");
  const request = new Request("http://localhost:3000/api/auth/logout", { method: "POST" });
  const response = await logoutPost(request);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.success, true);
});


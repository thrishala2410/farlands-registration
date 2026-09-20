import test from "node:test";
import assert from "node:assert/strict";
import { checkRateLimit, RATE_LIMITS } from "../lib/rate-limit";

test("Rate Limit: allows requests up to max limit within window", () => {
  const testKey = `test-ip-${Date.now()}`;
  const config = { windowMs: 1000, max: 3 };

  assert.equal(checkRateLimit(testKey, config).allowed, true);
  assert.equal(checkRateLimit(testKey, config).allowed, true);
  assert.equal(checkRateLimit(testKey, config).allowed, true);

  // 4th request should be blocked
  const blocked = checkRateLimit(testKey, config);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 1);
});

test("Rate Limit: resets counter after window expiry", async () => {
  const testKey = `test-ip-expire-${Date.now()}`;
  const config = { windowMs: 100, max: 1 };

  assert.equal(checkRateLimit(testKey, config).allowed, true);
  assert.equal(checkRateLimit(testKey, config).allowed, false);

  // Wait for window to expire
  await new Promise((resolve) => setTimeout(resolve, 150));

  assert.equal(checkRateLimit(testKey, config).allowed, true);
});

test("Rate Limit: predefined tiers exist with valid configurations", () => {
  assert.ok(RATE_LIMITS.auth.max > 0);
  assert.ok(RATE_LIMITS.registration.max > 0);
  assert.ok(RATE_LIMITS.payment.max > 0);
  assert.ok(RATE_LIMITS.admin.max > 0);
  assert.ok(RATE_LIMITS.general.max > 0);
});

test("Rate Limit: requestAddress prioritizes cf-connecting-ip and x-real-ip over spoofed headers", async () => {
  const { requestAddress } = await import("../lib/rate-limit");
  
  // cf-connecting-ip prioritized
  const headers1 = new Headers({
    "cf-connecting-ip": "203.0.113.195",
    "x-real-ip": "198.51.100.1",
    "x-forwarded-for": "10.0.0.1, 10.0.0.2",
  });
  assert.equal(requestAddress(headers1), "203.0.113.195");

  // x-real-ip prioritized over x-forwarded-for
  const headers2 = new Headers({
    "x-real-ip": "198.51.100.1",
    "x-forwarded-for": "10.0.0.1, 10.0.0.2",
  });
  assert.equal(requestAddress(headers2), "198.51.100.1");

  // fallback to x-vercel-forwarded-for / x-forwarded-for
  const headers3 = new Headers({
    "x-forwarded-for": "192.0.2.1, 10.0.0.2",
  });
  assert.equal(requestAddress(headers3), "192.0.2.1");

  // unknown when no headers provided
  const headers4 = new Headers({});
  assert.equal(requestAddress(headers4), "unknown");
});

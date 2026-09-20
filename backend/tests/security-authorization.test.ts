import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeAuditMetadata, safeEqualHex } from "../lib/security";
import { escapeLikeWildcards } from "../lib/auth";

test("Security: sanitizeAuditMetadata strips sensitive keys (password, token, secret, key)", () => {
  const payload = {
    teamName: "Super Team",
    password: "ClearTextPassword123!",
    adminSecret: "super-secret-key",
    userToken: "jwt-token-value",
    nested: {
      safeField: "safe value",
      apiKey: "secret-api-key",
      deep: {
        password_hash: "hash_value",
        allowedCount: 4,
      },
    },
  };

  const sanitized = sanitizeAuditMetadata(payload) as Record<string, unknown>;
  assert.equal(sanitized.teamName, "Super Team");
  assert.equal("password" in sanitized, false);
  assert.equal("adminSecret" in sanitized, false);
  assert.equal("userToken" in sanitized, false);

  const nested = sanitized.nested as Record<string, unknown>;
  assert.equal(nested.safeField, "safe value");
  assert.equal("apiKey" in nested, false);

  const deep = nested.deep as Record<string, unknown>;
  assert.equal(deep.allowedCount, 4);
  assert.equal("password_hash" in deep, false);
});

test("Security: safeEqualHex performs constant-time comparison and rejects malformed hex", () => {
  const hash1 = "a1b2c3d4e5f6";
  const hash2 = "a1b2c3d4e5f6";
  const hash3 = "f6e5d4c3b2a1";

  assert.equal(safeEqualHex(hash1, hash2), true);
  assert.equal(safeEqualHex(hash1, hash3), false);

  // Rejects invalid hex strings
  assert.equal(safeEqualHex("not-hex!", hash1), false);
  assert.equal(safeEqualHex(hash1, "xyz123"), false);
});

test("Security: escapeLikeWildcards escapes SQL/PostgREST wildcards % and _", () => {
  assert.equal(escapeLikeWildcards("100%_bonus"), "100\\%\\_bonus");
  assert.equal(escapeLikeWildcards("normal_search"), "normal\\_search");
  assert.equal(escapeLikeWildcards("%admin%"), "\\%admin\\%");
  assert.equal(escapeLikeWildcards("clean"), "clean");
});

test("Security: sanitizePostgrestFilter strips comma/parenthesis injection vectors", async () => {
  const { sanitizePostgrestFilter } = await import("../lib/auth");
  // Commas, parens, quotes, and backslashes must be stripped
  assert.equal(sanitizePostgrestFilter("attacker,name.eq.hacked)"), "attackername.eq.hacked");
  assert.equal(sanitizePostgrestFilter('"(test)"'), "test");
  assert.equal(sanitizePostgrestFilter("100%_legit"), "100\\%\\_legit");
  assert.equal(sanitizePostgrestFilter("normal search term"), "normal search term");
});

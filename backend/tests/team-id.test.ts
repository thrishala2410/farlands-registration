import test from "node:test";
import assert from "node:assert/strict";
import { generateTeamId, isValidTeamId } from "../lib/team-id";

test("Team ID: generates valid format with default prefix FL26", () => {
  const id = generateTeamId();
  assert.match(id, /^FL26-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{6}$/);
  assert.equal(isValidTeamId(id), true);
});

test("Team ID: generates unique IDs across 1,000 iterations (collision-free CSPRNG)", () => {
  const set = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    const id = generateTeamId("HW26", 6);
    assert.equal(set.has(id), false, `Duplicate ID generated: ${id}`);
    set.add(id);
  }
  assert.equal(set.size, 1000);
});

test("Team ID: excludes ambiguous characters 0, O, 1, I, L", () => {
  for (let i = 0; i < 200; i++) {
    const id = generateTeamId("TEST", 8);
    const code = id.replace("TEST-", "");
    assert.doesNotMatch(code, /[0O1IL]/, `Found ambiguous char in ${id}`);
  }
});

test("Team ID: isValidTeamId validates correct and rejects invalid inputs", () => {
  assert.equal(isValidTeamId("FL26-7K4P9X"), true);
  assert.equal(isValidTeamId("HW26-AB12CD"), true);
  assert.equal(isValidTeamId("TEAM-123456"), true);

  // Invalid cases
  assert.equal(isValidTeamId(""), false);
  assert.equal(isValidTeamId("FL26"), false);
  assert.equal(isValidTeamId("FL26-"), false);
  assert.equal(isValidTeamId("123456"), false);
  assert.equal(isValidTeamId("FL26-TOO-MANY-DASHES"), false);
  assert.equal(isValidTeamId(null), false);
  assert.equal(isValidTeamId(12345), false);
});

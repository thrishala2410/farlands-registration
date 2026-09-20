import test from "node:test";
import assert from "node:assert/strict";
import {
  registrationSchema,
  participantInputSchema,
  loginSchema,
  utrSchema,
  paymentReviewSchema,
  teamUpdateSchema,
  participantUpdateSchema,
} from "../lib/validation";

test("Validation: valid participant passes schema", () => {
  const valid = {
    name: "Aarav Sharma",
    email: "aarav@example.com",
    phone: "+919876543210",
    college: "IIT Bombay",
    course: "Computer Science",
    year: "3rd",
    password: "SecurePassword123!",
  };
  const parsed = participantInputSchema.parse(valid);
  assert.equal(parsed.name, "Aarav Sharma");
  assert.equal(parsed.email, "aarav@example.com");
  assert.equal(parsed.college, "IIT Bombay");
});

test("Validation: rejects password shorter than 8 characters", () => {
  const invalid = {
    name: "Aarav",
    email: "aarav@example.com",
    password: "short",
  };
  const result = participantInputSchema.safeParse(invalid);
  assert.equal(result.success, false);
});

test("Validation: allows participant without password (frontend form submission)", () => {
  const noPassword = {
    name: "Steve Hacker",
    email: "steve@example.com",
    phone: "+919876543210",
  };
  const result = participantInputSchema.safeParse(noPassword);
  assert.equal(result.success, true);
  assert.equal(result.data?.name, "Steve Hacker");
});

test("Validation: rejects invalid phone number", () => {
  const invalid = {
    name: "Aarav",
    email: "aarav@example.com",
    phone: "not-a-phone-number",
    password: "ValidPassword123!",
  };
  const result = participantInputSchema.safeParse(invalid);
  assert.equal(result.success, false);
});

test("Validation: valid team registration (leader + 0-3 members, 1-4 hackers total)", () => {
  const teamPayload = {
    teamName: "Code Ninjas",
    leader: {
      name: "Leader Person",
      email: "leader@example.com",
      password: "StrongLeaderPassword123!",
    },
    members: [
      {
        name: "Member One",
        email: "member1@example.com",
        password: "StrongMemberPassword123!",
      },
      {
        name: "Member Two",
        email: "member2@example.com",
        password: "StrongMemberPassword123!",
      },
    ],
  };
  const result = registrationSchema.safeParse(teamPayload);
  assert.equal(result.success, true);
});

test("Validation: valid solo team registration (leader only, 0 extra members)", () => {
  const soloPayload = {
    teamName: "Solo Coder",
    leader: {
      name: "Solo Leader",
      email: "sololeader@example.com",
    },
    members: [],
  };
  const result = registrationSchema.safeParse(soloPayload);
  assert.equal(result.success, true);
});

test("Validation: rejects duplicate emails across team members", () => {
  const duplicateEmails = {
    teamName: "Duplicate Team",
    leader: {
      name: "Leader",
      email: "same@example.com",
      password: "StrongPassword123!",
    },
    members: [
      {
        name: "Member",
        email: "same@example.com",
        password: "StrongPassword123!",
      },
    ],
  };
  const result = registrationSchema.safeParse(duplicateEmails);
  assert.equal(result.success, false);
});

test("Validation: rejects team with more than 3 extra members (exceeds max 4 hackers)", () => {
  const fourMembers = {
    teamName: "Too Big Team",
    leader: { name: "Leader", email: "l@example.com" },
    members: [
      { name: "M1", email: "m1@example.com" },
      { name: "M2", email: "m2@example.com" },
      { name: "M3", email: "m3@example.com" },
      { name: "M4", email: "m4@example.com" },
    ],
  };
  assert.equal(registrationSchema.safeParse(fourMembers).success, false);
});

test("Validation: login schema accepts Team ID, email, or participant ID", () => {
  assert.equal(loginSchema.safeParse({ teamId: "FL26-7K4P9X", password: "pwd" }).success, true);
  assert.equal(loginSchema.safeParse({ email: "user@example.com", password: "pwd" }).success, true);
  assert.equal(loginSchema.safeParse({ participantId: "P-4A9CCF26199A", password: "pwd" }).success, true);

  // Rejects multiple identifiers
  assert.equal(
    loginSchema.safeParse({ teamId: "FL26-7K4P9X", email: "user@example.com", password: "pwd" }).success,
    false
  );
  // Rejects no identifier
  assert.equal(loginSchema.safeParse({ password: "pwd" }).success, false);
});

test("Validation: UTR schema accepts valid UPI transaction IDs and rejects malformed", () => {
  assert.equal(utrSchema.safeParse("426019876543").success, true);
  assert.equal(utrSchema.safeParse("UPI-REF-998877").success, true);
  assert.equal(utrSchema.safeParse("ABC123XYZ").success, true);

  // Rejects too short or with special characters
  assert.equal(utrSchema.safeParse("12345").success, false);
  assert.equal(utrSchema.safeParse("INVALID@UTR!").success, false);
});

test("Validation: payment review schema checks rejection reason constraints", () => {
  assert.equal(paymentReviewSchema.safeParse({ reason: "Screenshot unreadable" }).success, true);
  assert.equal(paymentReviewSchema.safeParse({}).success, true); // Reason is optional for approval
  assert.equal(paymentReviewSchema.safeParse({ reason: "ab" }).success, false); // Min 3 chars
});

test("Validation: teamUpdateSchema validates partial updates", () => {
  assert.equal(teamUpdateSchema.safeParse({ teamName: "Updated Team" }).success, true);
  assert.equal(teamUpdateSchema.safeParse({ status: "disabled" }).success, true);
  assert.equal(teamUpdateSchema.safeParse({}).success, false);
});

test("Validation: participantUpdateSchema validates partial updates", () => {
  assert.equal(participantUpdateSchema.safeParse({ name: "Updated Name" }).success, true);
  assert.equal(participantUpdateSchema.safeParse({ status: "active" }).success, true);
  assert.equal(participantUpdateSchema.safeParse({}).success, false);
});

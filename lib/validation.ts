import { z } from "zod";

const normalizedEmail = z.string().trim().toLowerCase().email().max(254);

export const participantInputSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: normalizedEmail,
  phone: z.string().trim().regex(/^\+?[0-9]{10,15}$/, "Enter a valid phone number (10–15 digits)."),
  college: z.string().trim().min(2).max(150).optional().or(z.literal("")),
  course: z.string().trim().min(2).max(100).optional().or(z.literal("")),
  year: z.string().trim().min(1).max(20).optional().or(z.literal("")),
  password: z.string().min(8).max(128).optional().or(z.literal("")),
});

const teamNameSchema = z.string().trim().min(3).max(50);

// Legacy / portal payload: explicit leader object plus up to 3 extra members.
const legacyRegistrationShape = z.object({
  teamName: teamNameSchema,
  leader: participantInputSchema,
  members: z.array(participantInputSchema).min(0).max(3),
});

// New static frontend payload: 1 to 4 teammates, the first listed is the team leader.
export const frontendRegistrationSchema = z.object({
  teamName: teamNameSchema,
  teammates: z.array(participantInputSchema).min(1).max(4),
  submittedAt: z.string().optional().or(z.literal("")),
});

export type RegistrationInput =
  | z.infer<typeof legacyRegistrationShape>
  | z.infer<typeof frontendRegistrationSchema>;

export type LegacyRegistration = z.infer<typeof legacyRegistrationShape>;

/** Normalizes either accepted shape into the canonical legacy { leader + members } form. */
export function toLegacyRegistration(input: RegistrationInput): LegacyRegistration {
  if ("leader" in input) return input;
  const [leader, ...members] = input.teammates;
  return { teamName: input.teamName, leader, members };
}

export const registrationSchema = z.union([legacyRegistrationShape, frontendRegistrationSchema])
  .superRefine((value, context) => {
    const members = "leader" in value ? [value.leader, ...value.members] : value.teammates;
    const emails = members.map((member) => member.email);
    if (new Set(emails).size !== emails.length) {
      context.addIssue({
        code: "custom",
        message: "Team member emails must be distinct",
        path: ["members"],
      });
    }
  });

export const loginSchema = z.object({
  teamId: z.string().trim().regex(/^[A-Z0-9]{2,6}-[A-Z0-9]{6,12}$/i, "Invalid Team ID format").optional(),
  name: z.string().trim().min(2).max(254).optional(),
  email: normalizedEmail.optional(),
  participantId: z.string().trim().regex(/^P-[A-Z0-9]{6,32}$/i, "Invalid Participant ID format").optional(),
  password: z.string().min(1).max(128),
}).superRefine((value, ctx) => {
  const identifiers = [value.teamId, value.name, value.email, value.participantId].filter(Boolean);
  if (identifiers.length !== 1) {
    ctx.addIssue({ code: "custom", message: "Provide exactly one login identifier (Team ID, Email, or Participant ID)" });
  }
});

export const utrSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{6,64}$/, "Enter a valid UPI transaction ID or UTR.");

export const paymentReviewSchema = z.object({
  reason: z.string().trim().min(3).max(500).optional(),
});

export const teamUpdateSchema = z.object({
  teamName: z.string().trim().min(3).max(50).optional(),
  status: z.enum(["active", "disabled"]).optional(),
}).refine((data) => data.teamName !== undefined || data.status !== undefined, {
  message: "At least one field (teamName or status) must be provided",
});

export const participantUpdateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  phone: z.string().trim().regex(/^\+?[0-9]{10,15}$/, "Enter a valid phone number (10–15 digits)."),
  college: z.string().trim().min(2).max(150).optional().or(z.literal("")),
  course: z.string().trim().min(2).max(100).optional().or(z.literal("")),
  year: z.string().trim().min(1).max(20).optional().or(z.literal("")),
  status: z.enum(["active", "disabled"]).optional(),
}).refine((data) => Object.keys(data).length > 0, {
  message: "At least one field must be provided for update",
});
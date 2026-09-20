import { z } from "zod";

const normalizedEmail = z.string().trim().toLowerCase().email().max(254);
export const participantInputSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: normalizedEmail,
  phone: z.string().trim().regex(/^\+?[0-9]{10,15}$/).optional().or(z.literal("")),
  password: z.string().min(12).max(128),
});
export const registrationSchema = z.object({
  teamName: z.string().trim().min(3).max(50),
  leader: participantInputSchema,
  members: z.array(participantInputSchema).min(1).max(3),
}).superRefine((value, context) => {
  const emails = [value.leader, ...value.members].map((member) => member.email);
  if (new Set(emails).size !== emails.length) context.addIssue({ code: "custom", message: "Team member emails must be distinct", path: ["members"] });
});

export const loginSchema = z.object({
  name: z.string().trim().min(2).max(254).optional(),
  email: normalizedEmail.optional(),
  participantId: z.string().trim().regex(/^P-[A-Z0-9]{6,32}$/i).optional(),
  password: z.string().min(1).max(128),
}).superRefine((value, ctx) => {
  const identifiers = [value.name, value.email, value.participantId].filter(Boolean);
  if (identifiers.length !== 1) ctx.addIssue({ code: "custom", message: "Provide one login identifier" });
});

export const utrSchema = z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{6,64}$/, "Enter a valid UPI transaction ID or UTR.");
export const paymentReviewSchema = z.object({
  reason: z.string().trim().min(3).max(500).optional(),
});

export const problemSchema = z.object({
  title: z.string().trim().min(3).max(200),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  category: z.string().trim().min(2).max(80).optional(),
  content: z.string().trim().min(1),
});
export const announcementSchema = z.object({
  title: z.string().trim().min(3).max(200), body: z.string().trim().min(1), isPinned: z.boolean().optional(), isPublic: z.boolean().optional(),
});

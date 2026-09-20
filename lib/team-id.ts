import { randomBytes } from "node:crypto";

/**
 * Unambiguous uppercase alphanumeric alphabet:
 * excludes 0/O and 1/I/L to avoid participant transcription mistakes.
 */
const CHARSET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * Generates a cryptographically secure, unpredictable Team ID.
 * Example: FL26-7K4P9X
 */
export function generateTeamId(prefix = "FL26", length = 6): string {
  const bytes = randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CHARSET[bytes[i] % CHARSET.length];
  }
  return `${prefix}-${code}`;
}

/**
 * Validates Team ID format: 2-6 uppercase alphanumeric chars prefix,
 * hyphen, and 6-12 uppercase alphanumeric characters.
 */
export function isValidTeamId(id: unknown): boolean {
  if (typeof id !== "string") return false;
  return /^[A-Z0-9]{2,6}-[A-Z0-9]{6,12}$/.test(id.trim().toUpperCase());
}

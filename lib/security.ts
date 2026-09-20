import { createHmac, timingSafeEqual } from "node:crypto";

const sensitiveKey = /password|secret|token|card|cvv|key|auth|login_secret_hash/i;

export function safeEqualHex(expected: string, supplied: string): boolean {
  if (!/^[a-f0-9]+$/i.test(supplied)) return false;
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(supplied, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyHmac(body: string, secret: string, signature: string) {
  return safeEqualHex(createHmac("sha256", secret).update(body).digest("hex"), signature);
}

export function sanitizeAuditMetadata(value: unknown): unknown {
  if (value === null || value === undefined) return {};
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeAuditMetadata(item));
  }
  if (typeof value !== "object") {
    return typeof value === "string" ? value.slice(0, 500) : value;
  }
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => {
    if (sensitiveKey.test(key)) return [];
    if (item && typeof item === "object") return [[key, sanitizeAuditMetadata(item)]];
    return [[key, typeof item === "string" ? item.slice(0, 500) : item]];
  }));
}

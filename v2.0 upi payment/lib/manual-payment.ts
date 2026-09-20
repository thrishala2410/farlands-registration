import { randomUUID } from "node:crypto";
import { HttpError } from "@/lib/http";

export const PAYMENT_PROOF_BUCKET = "payment-proofs";
export const PAYMENT_QR_PUBLIC_PATH = "/payment/upi-qr.jpeg";
export const MAX_PAYMENT_PROOF_BYTES = 5 * 1024 * 1024;

export type PaymentImage = { extension: "png" | "jpg" | "webp"; mimeType: "image/png" | "image/jpeg" | "image/webp" };

function bytesStartWith(bytes: Uint8Array, expected: number[]) {
  return expected.every((value, index) => bytes[index] === value);
}

/** Verify bytes rather than trusting the browser-controlled file name or MIME type. */
export function detectPaymentImage(bytes: Uint8Array): PaymentImage | null {
  if (bytesStartWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { extension: "png", mimeType: "image/png" };
  if (bytesStartWith(bytes, [0xff, 0xd8, 0xff])) return { extension: "jpg", mimeType: "image/jpeg" };
  if (bytes.length >= 12 && bytesStartWith(bytes, [0x52, 0x49, 0x46, 0x46]) && bytesStartWith(bytes.slice(8), [0x57, 0x45, 0x42, 0x50])) return { extension: "webp", mimeType: "image/webp" };
  return null;
}

export async function readPaymentImage(value: FormDataEntryValue | null) {
  if (!value || typeof value === "string") throw new HttpError(400, "A payment screenshot is required.");
  if (value.size < 1 || value.size > MAX_PAYMENT_PROOF_BYTES) throw new HttpError(400, "Payment screenshots must be PNG, JPEG, or WebP files up to 5 MB.");
  const bytes = new Uint8Array(await value.arrayBuffer());
  const image = detectPaymentImage(bytes);
  if (!image || (value.type && value.type !== image.mimeType)) throw new HttpError(400, "The uploaded file is not a valid PNG, JPEG, or WebP image.");
  return { bytes, image };
}

export function paymentProofPath(teamId: string, image: PaymentImage) {
  return `${teamId}/${randomUUID()}.${image.extension}`;
}

export function lastFour(value: string) {
  return value.length <= 4 ? value : value.slice(-4);
}

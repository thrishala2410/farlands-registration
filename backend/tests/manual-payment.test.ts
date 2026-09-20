import test from "node:test";
import assert from "node:assert/strict";
import { detectPaymentImage, lastFour, paymentProofPath } from "../lib/manual-payment";

test("Magic Bytes: correctly identifies PNG header", () => {
  const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
  const detected = detectPaymentImage(pngHeader);
  assert.notEqual(detected, null);
  assert.equal(detected?.extension, "png");
  assert.equal(detected?.mimeType, "image/png");
});

test("Magic Bytes: correctly identifies JPEG header", () => {
  const jpegHeader = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
  const detected = detectPaymentImage(jpegHeader);
  assert.notEqual(detected, null);
  assert.equal(detected?.extension, "jpg");
  assert.equal(detected?.mimeType, "image/jpeg");
});

test("Magic Bytes: correctly identifies WebP header", () => {
  const webpHeader = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, // "RIFF"
    0x00, 0x00, 0x00, 0x00, // file length
    0x57, 0x45, 0x42, 0x50, // "WEBP"
    0x56, 0x50, 0x38, 0x20  // chunk header
  ]);
  const detected = detectPaymentImage(webpHeader);
  assert.notEqual(detected, null);
  assert.equal(detected?.extension, "webp");
  assert.equal(detected?.mimeType, "image/webp");
});

test("Magic Bytes: rejects HTML or disguised executables", () => {
  const htmlBytes = new TextEncoder().encode("<html><script>alert(1)</script></html>");
  assert.equal(detectPaymentImage(htmlBytes), null);

  const exeBytes = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]); // MZ header
  assert.equal(detectPaymentImage(exeBytes), null);
});

test("Payment: lastFour safely masks sensitive UTR numbers", () => {
  assert.equal(lastFour("1234567890"), "7890");
  assert.equal(lastFour("ABC123"), "C123");
  assert.equal(lastFour("12"), "12");
});

test("Payment: paymentProofPath formats paths strictly as {teamId}/{uuid}.{ext}", () => {
  const teamId = "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d";
  const path = paymentProofPath(teamId, { extension: "png", mimeType: "image/png" });
  assert.match(path, /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.png$/);
  assert.ok(path.startsWith(teamId));
});

test("MIME Normalization: normalizes image/jpg and image/pjpeg to image/jpeg", async () => {
  const { normalizeImageMimeType } = await import("../lib/manual-payment");
  assert.equal(normalizeImageMimeType("image/jpg"), "image/jpeg");
  assert.equal(normalizeImageMimeType("IMAGE/JPG "), "image/jpeg");
  assert.equal(normalizeImageMimeType("image/pjpeg"), "image/jpeg");
  assert.equal(normalizeImageMimeType("image/png"), "image/png");
  assert.equal(normalizeImageMimeType("image/webp"), "image/webp");
  assert.equal(normalizeImageMimeType(undefined), undefined);
  assert.equal(normalizeImageMimeType(null), undefined);
});


"use client";

import Link from "next/link";
import Image from "next/image";
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import "./payment.css";

type PaymentStatus = "pending_verification" | "paid" | "payment_failed";
type PaymentData = {
  registration: { id: string; number: string; status: string; feeAmount: number; currency: string; confirmedAt: string | null };
  payment: { id: string; status: PaymentStatus; utrLastFour: string; submittedAt: string; reviewedAt: string | null; rejectionReason: string | null } | null;
  paymentInstructions: { upiId: string; qrPath: string };
};

function messageFrom(payload: unknown, fallback: string) {
  return typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string" ? payload.error : fallback;
}

function displayTime(value: string | null) {
  return value ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
}

export default function PaymentPage() {
  const router = useRouter();
  const [data, setData] = useState<PaymentData | null>(null);
  const [utr, setUtr] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [qrMissing, setQrMissing] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/payments/status", { cache: "no-store" });
    if (response.status === 401) { router.replace("/login"); return; }
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw new Error(messageFrom(payload, "Your payment information could not be loaded."));
    setData(payload as PaymentData);
  }, [router]);

  useEffect(() => {
    let active = true;
    const initialLoad = window.setTimeout(() => {
      void load().catch((error) => { if (active) setMessage(error instanceof Error ? error.message : "Your payment information could not be loaded."); }).finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => { active = false; window.clearTimeout(initialLoad); };
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => { void load().catch(() => undefined); }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const amount = useMemo(() => data ? new Intl.NumberFormat("en-IN", { style: "currency", currency: data.registration.currency, maximumFractionDigits: 0 }).format(data.registration.feeAmount / 100) : "₹1,000", [data]);
  const canSubmit = !data?.payment || data.payment.status === "payment_failed";

  function selectScreenshot(event: ChangeEvent<HTMLInputElement>) { setScreenshot(event.target.files?.[0] ?? null); }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!screenshot) { setMessage("Select your payment screenshot first."); return; }
    setSubmitting(true); setMessage(null);
    try {
      const form = new FormData(); form.set("utr", utr); form.set("screenshot", screenshot);
      const response = await fetch("/api/payments/submit-proof", { method: "POST", body: form, cache: "no-store" });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(messageFrom(payload, "Your proof could not be submitted."));
      setUtr(""); setScreenshot(null); setMessage("Payment proof submitted. The organizer will verify it shortly."); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Your proof could not be submitted."); }
    finally { setSubmitting(false); }
  }

  function openUpiApp() {
    if (!data) return;
    const uri = new URL("upi://pay");
    uri.searchParams.set("pa", data.paymentInstructions.upiId); uri.searchParams.set("pn", "Farlands Hackathon");
    uri.searchParams.set("am", (data.registration.feeAmount / 100).toFixed(2)); uri.searchParams.set("cu", data.registration.currency); uri.searchParams.set("tn", data.registration.number);
    window.location.assign(uri.toString());
  }

  async function viewProof() {
    if (!data?.payment) return;
    const response = await fetch(`/api/payments/proof/${data.payment.id}`, { cache: "no-store" });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok || typeof payload !== "object" || payload === null || !("url" in payload) || typeof payload.url !== "string") { setMessage(messageFrom(payload, "The uploaded screenshot is temporarily unavailable.")); return; }
    window.open(payload.url, "_blank", "noopener,noreferrer");
  }

  if (loading) return <main className="payment-page"><p className="payment-loading">LOADING PAYMENT PORTAL…</p></main>;
  if (!data) return <main className="payment-page"><section className="payment-card payment-error"><h1>Payment portal unavailable</h1><p>{message ?? "Unable to load your payment information."}</p><Link href="/login">Return to sign in</Link></section></main>;
  const payment = data.payment; const paid = payment?.status === "paid" && data.registration.status === "confirmed"; const pending = payment?.status === "pending_verification";

  return <main className="payment-page"><section className="payment-card">
    <header className="payment-heading"><div><span>FARLANDS // REGISTRATION PAYMENT</span><h1>{paid ? "Payment verified." : pending ? "Under verification." : "Complete your payment."}</h1><p>{paid ? "Your registration is confirmed and your team can enter the participant portal." : "Pay the exact amount using UPI, then submit the transaction ID and an unedited screenshot for organizer review."}</p></div><Link href="/">← Back to Farlands</Link></header>
    {message && <p className="payment-message" role="status">{message}</p>}
    <section className="payment-summary"><article><span>TEAM REGISTRATION</span><strong>{data.registration.number}</strong></article><article><span>OFFICIAL FEE</span><strong>{amount}</strong></article><article><span>STATUS</span><strong>{paid ? "CONFIRMED" : pending ? "UNDER VERIFICATION" : payment?.status === "payment_failed" ? "RESUBMISSION REQUIRED" : "PAYMENT PENDING"}</strong></article></section>
    {paid ? <section className="payment-result success"><h2>✓ Registration confirmed</h2><p>Verified {displayTime(payment?.reviewedAt ?? data.registration.confirmedAt)}. Your payment reference ends in <b>{payment?.utrLastFour}</b>.</p><Link href="/participant/dashboard">Enter participant dashboard</Link></section> : pending ? <section className="payment-result pending"><h2>Payment proof submitted</h2><p>Your proof was submitted {displayTime(payment?.submittedAt ?? null)} and is waiting for organizer verification. Do not make another payment unless the organizer asks you to.</p><button type="button" className="payment-secondary" onClick={() => void viewProof()}>View my submitted screenshot</button></section> : <>
      {payment?.status === "payment_failed" && <section className="payment-result rejected"><h2>Payment could not be verified</h2><p>{payment.rejectionReason ?? "Please check the transaction details and submit a new proof."}</p><button type="button" className="payment-secondary" onClick={() => void viewProof()}>View previous screenshot</button></section>}
      <section className="payment-method"><div className="payment-qr-wrap">{!qrMissing ? <Image src={data.paymentInstructions.qrPath} alt={`UPI QR code for ${data.paymentInstructions.upiId}`} className="payment-qr" width={270} height={270} unoptimized onError={() => setQrMissing(true)} /> : <div className="payment-qr-fallback">QR temporarily unavailable.<br />Use the UPI ID below.</div>}</div><div><span>SCAN TO PAY</span><h2>{amount}</h2><p>UPI ID</p><code>{data.paymentInstructions.upiId}</code><button type="button" className="payment-secondary" onClick={openUpiApp}>Pay using a UPI app</button><small>Pay exactly {amount}. This button opens your UPI app; it does not automatically verify payment.</small></div></section>
      {canSubmit && <form className="payment-form" onSubmit={submit}><h2>{payment?.status === "payment_failed" ? "Submit a replacement proof" : "Submit payment proof"}</h2><label>UPI transaction ID / UTR<input required value={utr} onChange={(event) => setUtr(event.target.value.toUpperCase())} minLength={6} maxLength={64} pattern="[A-Za-z0-9-]{6,64}" placeholder="Enter the UTR from your UPI app" /></label><label>Payment screenshot <small>PNG, JPEG, or WebP · up to 5 MB</small><input required type="file" accept="image/png,image/jpeg,image/webp" onChange={selectScreenshot} /></label><button disabled={submitting}>{submitting ? "Submitting proof…" : "Submit payment proof"}</button></form>}
    </>}
  </section></main>;
}

"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import "./register.css";

type MemberDraft = { name: string; email: string; phone: string; password: string; confirmPassword: string };

const blankMember = (): MemberDraft => ({ name: "", email: "", phone: "", password: "", confirmPassword: "" });

function responseMessage(payload: unknown, fallback: string) {
  return typeof payload === "object" && payload !== null && "error" in payload && typeof payload.error === "string" ? payload.error : fallback;
}

export default function RegisterPage() {
  const router = useRouter();
  const [teamName, setTeamName] = useState("");
  const [leader, setLeader] = useState<MemberDraft>(blankMember);
  const [members, setMembers] = useState<MemberDraft[]>([blankMember()]);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const memberCount = members.length + 1;

  const changeMember = (index: number, field: keyof MemberDraft, value: string) => setMembers((current) => current.map((member, position) => position === index ? { ...member, [field]: value } : member));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if ([leader, ...members].some((member) => member.password !== member.confirmPassword)) {
      setMessage("Each password confirmation must match.");
      return;
    }
    setCreating(true);
    try {
      const response = await fetch("/api/registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamName,
          leader: { name: leader.name, email: leader.email, phone: leader.phone || undefined, password: leader.password },
          members: members.map((member) => ({ name: member.name, email: member.email, phone: member.phone || undefined, password: member.password })),
        }),
        cache: "no-store",
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseMessage(payload, "Could not create your registration."));
      router.replace("/payment");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not create your registration.");
      setCreating(false);
    }
  }

  return (
    <main className="register-page">
      <section className="register-card">
        <div className="register-heading"><div><span className="register-kicker">FARLANDS // TEAM REGISTRATION</span><h1>Enter the server.</h1><p>Register a team of 2–4. The team leader then completes the secure ₹1,000 UPI payment and submits the proof for organizer verification.</p></div><button type="button" className="register-back" onClick={() => router.push("/")}>← Back</button></div>
        {message && <p className="register-message" role="alert">{message}</p>}
        <form onSubmit={submit}>
          <label>Team name<input required minLength={3} maxLength={50} value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Your team name" /></label>
          <MemberFields title="Team leader" member={leader} onChange={(field, value) => setLeader((current) => ({ ...current, [field]: value }))} />
          {members.map((member, index) => <div className="register-member" key={index}><MemberFields title={`Member ${index + 2}`} member={member} onChange={(field, value) => changeMember(index, field, value)} />{members.length > 1 && <button type="button" className="register-remove" onClick={() => setMembers((current) => current.filter((_, position) => position !== index))}>Remove member</button>}</div>)}
          <div className="register-actions">
            {memberCount < 4 && <button type="button" className="register-secondary" onClick={() => setMembers((current) => [...current, blankMember()])}>+ Add member</button>}
            <span>{memberCount} of 4 teammates</span>
          </div>
          <button className="register-pay" disabled={creating}>{creating ? "Creating team…" : "Continue to secure UPI payment · ₹1,000"}</button>
        </form>
      </section>
    </main>
  );
}

function MemberFields({ title, member, onChange }: { title: string; member: MemberDraft; onChange: (field: keyof MemberDraft, value: string) => void }) {
  return <fieldset className="register-fields"><legend>{title}</legend><div className="register-grid"><label>Full name<input required minLength={2} maxLength={100} autoComplete="name" value={member.name} onChange={(event) => onChange("name", event.target.value)} /></label><label>Email<input required type="email" autoComplete="email" value={member.email} onChange={(event) => onChange("email", event.target.value)} /></label><label>Phone <small>(optional)</small><input type="tel" inputMode="tel" pattern="\+?[0-9]{10,15}" value={member.phone} onChange={(event) => onChange("phone", event.target.value)} placeholder="+919876543210" /></label><label>Password<input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={member.password} onChange={(event) => onChange("password", event.target.value)} /></label><label>Password again<input required type="password" minLength={12} maxLength={128} autoComplete="new-password" value={member.confirmPassword} onChange={(event) => onChange("confirmPassword", event.target.value)} /></label></div></fieldset>;
}

import React, { useState } from "react";
import logo from "./logo.png";
import { requestOtp, verifyOtp } from "./api.js";

export function Login({ notice }) {
  const [contact, setContact] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState(1);
  const [err, setErr] = useState(notice || "");
  const [busy, setBusy] = useState(false);
  const [remember, setRemember] = useState(true);
  const run = (fn) => async (e) => {
    e.preventDefault(); setErr(""); setBusy(true);
    try { await fn(); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <form className="card" style={{ width: "min(100%,380px)", display: "grid", gap: 14 }}
        onSubmit={run(async () => { if (step === 1) { await requestOtp(contact); setStep(2); } else await verifyOtp(contact, code, remember); })}>
        <div className="brand" style={{ padding: 0 }}><img src={logo} alt="" /><div><b>رع شات</b><span>لوحة الإدارة</span></div></div>
        {step === 1 ? (
          <label className="f">رقم الموبايل أو الإيميل
            <input className="inp" dir="ltr" autoFocus required value={contact} onChange={(e) => setContact(e.target.value)} placeholder="01xxxxxxxxx أو name@example.com" />
          </label>
        ) : (
          <label className="f">كود التحقق اللي وصلك
            <input className="inp" dir="ltr" inputMode="numeric" autoComplete="one-time-code" autoFocus required maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} placeholder="••••••" />
          </label>
        )}
        <label className="row" style={{ gap: 8, cursor: "pointer" }}><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> تذكرني على الجهاز ده</label>
        {err && <div role="alert" style={{ color: "var(--bad)", fontSize: 13 }}>{err}</div>}
        <button className="btn pri" type="submit" disabled={busy}>{busy ? "..." : step === 1 ? "إرسال الكود" : "دخول"}</button>
        {step === 2 && <button type="button" className="btn" onClick={() => { setStep(1); setCode(""); setErr(""); }}>تغيير الرقم</button>}
        <div style={{ color: "var(--muted)", fontSize: 12 }}>الدخول لأعضاء الفريق فقط. لو مش مضاف، اطلبي من المالك يضيفك.</div>
      </form>
    </div>
  );
}

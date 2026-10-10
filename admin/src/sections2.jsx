import React, { useState } from "react";
import { Card, Kpi, Table, Pill, Switch, n, egp, useAdmin } from "./ui.jsx";
import { PROVIDERS, OFFERS, BROADCASTS, ADMINS, ROLES, PERMS } from "./data.js";

export function Payments({ tx, setTx }) {
  const { act } = useAdmin();
  const [prov, setProv] = useState(PROVIDERS);
  const [f, setF] = useState("all");
  const done = tx.filter((t) => t.status === "done");
  const vol = done.reduce((a, t) => a + t.amount, 0), fee = done.reduce((a, t) => a + t.fee, 0);
  const shown = tx.filter((t) => f === "all" || t.status === f);
  return (
    <>
      <div className="grid kpis">
        <Kpi l="حجم العمليات الناجحة (العينة)" v={egp(vol)} />
        <Kpi l="عمولات المنصة" v={egp(fee)} up d="١٪ في المتوسط" />
        <Kpi l="عمليات فاشلة / معلّقة" v={n(tx.filter((t) => t.status === "failed" || t.status === "pending").length)} />
        <Kpi l="مستردّة" v={n(tx.filter((t) => t.status === "refunded").length)} />
      </div>
      <div style={{ marginTop: 14 }}>
        <Card title="آخر العمليات" right={
          <select id="txf" className="inp" value={f} onChange={(e) => setF(e.target.value)}>
            <option value="all">كل الحالات</option><option value="done">ناجحة</option><option value="failed">فاشلة</option><option value="pending">قيد المراجعة</option><option value="refunded">مستردة</option>
          </select>}>
          <Table head={["رقم العملية", "المستخدم", "الخدمة", "المبلغ", "العمولة", "الوقت", "الحالة", ""]}>
            {shown.map((t) => (
              <tr key={t.id}><td dir="ltr" style={{ textAlign: "right" }}>{t.id}</td><td>{t.user}</td><td>{t.service}</td><td>{egp(t.amount)}</td><td>{egp(t.fee)}</td><td>{t.time}</td><td><Pill s={t.status} /></td>
                <td>{t.status === "done" && <button className="btn sm" onClick={() => { setTx(tx.map((x) => x.id === t.id ? { ...x, status: "refunded" } : x)); act(`استرد العملية ${t.id} بقيمة ${egp(t.amount)}`); }}>استرداد</button>}
                  {t.status === "pending" && <button className="btn sm" onClick={() => { setTx(tx.map((x) => x.id === t.id ? { ...x, status: "failed" } : x)); act(`ألغى العملية المعلّقة ${t.id}`); }}>إلغاء</button>}</td></tr>
            ))}
          </Table>
        </Card>
      </div>
      <div style={{ marginTop: 14 }}>
        <Card title="مزودو الخدمات والعمولات">
          <Table head={["الخدمة", "المزود", "حجم ٣٠ يوم", "العمولة ٪", "مفعّلة"]}>
            {prov.map((p) => (
              <tr key={p.key}><td><b>{p.name}</b></td><td>{p.biller}</td><td>{egp(p.vol)}</td>
                <td><input aria-label={`عمولة ${p.name}`} className="inp" type="number" step="0.1" min="0" max="10" value={p.fee} style={{ width: 80 }}
                  onChange={(e) => setProv(prov.map((x) => x.key === p.key ? { ...x, fee: e.target.value } : x))}
                  onBlur={() => act(`عدّل عمولة ${p.name} إلى ${n(p.fee, 1)}٪`)} /></td>
                <td><Switch on={p.on} label={`تفعيل ${p.name}`} onChange={(v) => { setProv(prov.map((x) => x.key === p.key ? { ...x, on: v } : x)); act(`${v ? "فعّل" : "عطّل"} خدمة ${p.name}`); }} /></td></tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}

export function Offers() {
  const { act } = useAdmin();
  const [rows, setRows] = useState(OFFERS);
  const [f, setF] = useState({ code: "", percent: 10, max: 30, applies: "كهرباء", expires: "" });
  const add = (e) => {
    e.preventDefault();
    const code = f.code.trim().toUpperCase();
    if (!code || rows.some((r) => r.code === code)) return act("تعذّر إنشاء الكود", "اكتب كودًا غير مكرر");
    setRows([{ code, percent: +f.percent, max: +f.max, applies: f.applies, expires: f.expires || "بدون انتهاء", used: 0, on: true }, ...rows]);
    act(`أنشأ كود الخصم ${code}`);
    setF({ ...f, code: "" });
  };
  return (
    <>
      <Card title="كود خصم جديد">
        <form className="form" onSubmit={add}>
          <label className="f">الكود<input id="oc" className="inp" dir="ltr" value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="SAVE20" /></label>
          <label className="f">نسبة الخصم ٪<input id="op" className="inp" type="number" min="1" max="100" value={f.percent} onChange={(e) => setF({ ...f, percent: e.target.value })} /></label>
          <label className="f">أقصى خصم (ج.م)<input id="om" className="inp" type="number" min="1" value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} /></label>
          <label className="f">ينطبق على<input id="oa" className="inp" value={f.applies} onChange={(e) => setF({ ...f, applies: e.target.value })} /></label>
          <label className="f">ينتهي في<input id="oe" className="inp" value={f.expires} onChange={(e) => setF({ ...f, expires: e.target.value })} placeholder="٢٠٢٦/١٢/٣١" /></label>
          <button className="btn pri" type="submit">إنشاء الكود</button>
        </form>
      </Card>
      <div style={{ marginTop: 14 }}>
        <Card title="أكواد الخصم والعروض">
          <Table head={["الكود", "الخصم", "ينطبق على", "ينتهي", "مرات الاستخدام", "مفعّل", ""]}>
            {rows.map((o) => (
              <tr key={o.code}><td dir="ltr" style={{ textAlign: "right" }}><b>{o.code}</b></td><td>{n(o.percent)}٪ (حتى {n(o.max)} ج.م)</td><td>{o.applies}</td><td>{o.expires}</td><td>{n(o.used)}</td>
                <td><Switch on={o.on} label={`تفعيل ${o.code}`} onChange={(v) => { setRows(rows.map((x) => x.code === o.code ? { ...x, on: v } : x)); act(`${v ? "فعّل" : "أوقف"} الكود ${o.code}`); }} /></td>
                <td><button className="btn sm dng" onClick={() => { setRows(rows.filter((x) => x.code !== o.code)); act(`حذف الكود ${o.code}`); }}>حذف</button></td></tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}

export function Notifications() {
  const { act } = useAdmin();
  const [hist, setHist] = useState(BROADCASTS);
  const [f, setF] = useState({ title: "", body: "", audience: "كل المستخدمين" });
  const send = (e) => {
    e.preventDefault();
    if (!f.title.trim()) return act("العنوان فارغ", "اكتب عنوان الإشعار أولًا");
    setHist([{ id: "N-" + (hist.length + 6), title: f.title, audience: f.audience, sent: "الآن", reach: f.audience === "كل المستخدمين" ? 6410 : 3411, opened: "—" }, ...hist]);
    act(`أرسل إشعارًا: «${f.title}» إلى ${f.audience}`, "تم إرسال الإشعار (تجريبي)");
    setF({ ...f, title: "", body: "" });
  };
  return (
    <div className="grid two">
      <Card title="إشعار جماعي جديد">
        <form className="grid" style={{ gap: 10 }} onSubmit={send}>
          <label className="f">العنوان<input id="nt" className="inp" maxLength={60} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="f">النص<textarea id="nb" className="inp" rows="3" maxLength={160} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></label>
          <label className="f">الجمهور<select id="na" className="inp" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>
            <option>كل المستخدمين</option><option>مستخدمو المحفظة</option><option>مستخدمو الغرف الصوتية</option><option>مستخدمون غير نشطين ٣٠ يوم</option></select></label>
          <button className="btn pri" type="submit">إرسال الآن</button>
        </form>
      </Card>
      <Card title="سجل الإشعارات">
        <div className="list">
          {hist.map((h) => (
            <div className="li" key={h.id}><div><div className="t">{h.title}</div><div className="s">{h.audience} · {h.sent}</div></div><div style={{ textAlign: "left" }}><b>{n(h.reach)}</b><div className="s">فُتح: {h.opened}</div></div></div>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function Team() {
  const { act, audit } = useAdmin();
  const [admins, setAdmins] = useState(ADMINS);
  const [em, setEm] = useState("");
  const [role, setRole] = useState("moderator");
  const invite = (e) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(em)) return act("إيميل غير صالح", "اكتب إيميلًا صحيحًا");
    setAdmins([...admins, { id: "A-" + (admins.length + 1), name: em.split("@")[0], email: em, role, last: "دعوة مُرسلة" }]);
    act(`دعا ${em} بدور ${ROLES[role]}`); setEm("");
  };
  return (
    <>
      <div className="grid two">
        <Card title="أعضاء الفريق">
          <Table head={["الاسم", "الدور", "آخر نشاط", ""]}>
            {admins.map((a) => (
              <tr key={a.id}><td><b>{a.name}</b><div dir="ltr" style={{ color: "var(--muted)", fontSize: 12, textAlign: "right" }}>{a.email}</div></td>
                <td>{a.role === "owner" ? <span className="pill p-warn">مالك</span> :
                  <select aria-label={`دور ${a.name}`} className="inp" value={a.role} onChange={(e) => { setAdmins(admins.map((x) => x.id === a.id ? { ...x, role: e.target.value } : x)); act(`غيّر دور ${a.name} إلى ${ROLES[e.target.value]}`); }}>
                    {Object.entries(ROLES).filter(([k]) => k !== "owner").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}</td>
                <td>{a.last}</td>
                <td>{a.role !== "owner" && <button className="btn sm dng" onClick={() => { setAdmins(admins.filter((x) => x.id !== a.id)); act(`أزال ${a.name} من الفريق`); }}>إزالة</button>}</td></tr>
            ))}
          </Table>
          <form className="form" style={{ marginTop: 12 }} onSubmit={invite}>
            <label className="f">دعوة عضو<input id="ie" className="inp" dir="ltr" value={em} onChange={(e) => setEm(e.target.value)} placeholder="name@example.com" /></label>
            <label className="f">الدور<select id="ir" className="inp" value={role} onChange={(e) => setRole(e.target.value)}>
              {Object.entries(ROLES).filter(([k]) => k !== "owner").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <button className="btn pri" type="submit">إرسال الدعوة</button>
          </form>
        </Card>
        <Card title="مصفوفة الصلاحيات">
          <Table head={["القسم", ...Object.values(ROLES)]}>
            {PERMS.map(([name, p]) => (
              <tr key={name}><td><b>{name}</b></td>{Object.keys(ROLES).map((k) => <td key={k} style={{ textAlign: "center", color: p[k] ? "var(--good)" : "var(--muted)" }}>{p[k] ? "✓" : "—"}</td>)}</tr>
            ))}
          </Table>
        </Card>
      </div>
      <div style={{ marginTop: 14 }}>
        <Card title="سجل المراجعة (كل إجراء إداري يُسجَّل هنا)">
          <div className="list">
            {audit.slice(0, 14).map((a, i) => <div className="li" key={i}><div><span className="t">{a.who}</span> <span>{a.what}</span></div><span className="s">{a.when}</span></div>)}
          </div>
        </Card>
      </div>
    </>
  );
}

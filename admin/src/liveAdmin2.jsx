import React, { useState } from "react";
import { Card, Kpi, Table, Pill, Switch, LineChart, n, egp } from "./ui.jsx";
import { api } from "./api.js";
import { useMe, useLoad, useDo, Err, Confirm } from "./live.jsx";

const fmt = (iso) => new Date(iso).toLocaleString("ar-EG-u-nu-latn", { dateStyle: "medium", timeStyle: "short" });
/** يملأ آخر 30 يوم بأصفار */
function series(rows) {
  const m = new Map((rows || []).map((r) => [r.day, r.count]));
  const out = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000);
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(d);
    out.push(m.get(key) || 0);
  }
  return out;
}
const stepOf = (a) => { const mx = Math.max(...a, 1); return mx <= 10 ? 2 : mx <= 100 ? 10 : mx <= 1000 ? 100 : 500; };

/* ---------- الصفحة الرئيسية ---------- */
export function LiveOverview({ go }) {
  const { data: o, err } = useLoad("/admin/overview");
  if (err) return <Err msg={err} />;
  if (!o) return <div className="empty">جاري التحميل…</div>;
  const att = [];
  if (o.openReports !== undefined) att.push({ t: `${n(o.openReports)} بلاغات مفتوحة`, s: "تحتاج مراجعة المشرفين", to: "reports", warn: o.openReports > 0 });
  if (o.pendingAds !== undefined) att.push({ t: `${n(o.pendingAds)} إعلانات تنتظر الموافقة`, s: "حملات جديدة من المعلنين", to: "ads", warn: o.pendingAds > 0 });
  const sg = o.signups ? series(o.signups) : null, ms = o.messagesDaily ? series(o.messagesDaily) : null;
  return (
    <>
      <div className="grid k3">
        {o.activeToday !== undefined && <Kpi l="نشطون اليوم" v={n(o.activeToday)} d={`من ${n(o.totalUsers)} مستخدم`} up />}
        {o.newUsers30 !== undefined && <Kpi l="مستخدمون جدد (30 يوم)" v={n(o.newUsers30)} />}
        {o.messagesToday !== undefined && <Kpi l="رسائل اليوم" v={n(o.messagesToday)} />}
        {o.liveRooms !== undefined && <Kpi l="غرف مباشرة الآن" v={n(o.liveRooms)} d={`${n(o.listeners)} مشارك`} up />}
        {o.billsVolume30 !== undefined && <Kpi l="فواتير مدفوعة (30 يوم)" v={`${egp(o.billsVolume30)}`} d={`${n(o.billsCount30)} عملية`} up />}
        {o.adRevenue30 !== undefined && <Kpi l="حجوزات الإعلانات (30 يوم)" v={`${egp(o.adRevenue30)}`} />}
      </div>
      <div className="grid two" style={{ marginTop: 14 }}>
        {ms && <Card title="الرسائل يوميًا · آخر 30 يوم"><LineChart data={ms} step={stepOf(ms)} label="الرسائل يوميًا خلال 30 يوم" /></Card>}
        {att.length > 0 && <Card title="يحتاج انتباهك">
          <div className="list">
            {att.map((a) => (
              <div className="li" key={a.to}>
                <div><div className="t">{a.t}</div><div className="s">{a.s}</div></div>
                <button className={`btn ${a.warn ? "pri" : ""}`} onClick={() => go(a.to)}>{a.warn ? "افتح" : "لا شيء معلّق"}</button>
              </div>
            ))}
          </div>
        </Card>}
      </div>
      {sg && <div style={{ marginTop: 14 }}><Card title="تسجيلات جديدة يوميًا · آخر 30 يوم"><LineChart data={sg} step={stepOf(sg)} label="التسجيلات الجديدة يوميًا" /></Card></div>}
    </>
  );
}

/* ---------- الجروبات والغرف ---------- */
export function LiveSpaces() {
  const { can } = useMe();
  const run = useDo();
  const [tab, setTab] = useState("groups");
  const g = useLoad("/admin/spaces/groups");
  const r = useLoad("/admin/spaces/rooms");
  const mod = can("content.moderate");
  return (
    <>
      <div className="tabs">
        <button className="tab" aria-pressed={tab === "groups"} onClick={() => setTab("groups")}>الجروبات</button>
        <button className="tab" aria-pressed={tab === "rooms"} onClick={() => setTab("rooms")}>الغرف الصوتية</button>
      </div>
      {tab === "groups" ? (
        <Card title="الجروبات">
          <Err msg={g.err} />
          <Table head={["الجروب", "المنشئ", "الأعضاء", "بلاغات", "الحالة", "إجراءات"]}>
            {(g.data || []).map((x) => (
              <tr key={x.id}>
                <td><b>{x.name}</b><div style={{ color: "var(--muted)", fontSize: 12 }}>{fmt(x.createdAt)}</div></td><td>{x.owner}</td><td>{n(x.members)}</td>
                <td>{x.reports ? <span className="pill p-warn">{n(x.reports)}</span> : "—"}</td><td><Pill s={x.status} /></td>
                <td>{mod && <div className="row">
                  <Confirm onYes={() => run(() => api(`/admin/spaces/groups/${x.id}`, { method: "PATCH", body: { restricted: x.status !== "restricted" } }), `${x.status === "restricted" ? "رفع التقييد عن" : "قيّد"} جروب ${x.name}`).then((ok) => ok && g.reload())}>{x.status === "restricted" ? "رفع التقييد" : "تقييد"}</Confirm>
                  <Confirm danger onYes={() => run(() => api(`/admin/spaces/groups/${x.id}`, { method: "DELETE" }), `حذف جروب ${x.name}`).then((ok) => ok && g.reload())}>حذف</Confirm>
                </div>}</td>
              </tr>
            ))}
          </Table>
          {g.data && !g.data.length && <div className="empty">لا توجد جروبات</div>}
        </Card>
      ) : (
        <Card title="الغرف الصوتية (المباشرة وآخر 7 أيام)">
          <Err msg={r.err} />
          <Table head={["الغرفة", "المضيف", "المشاركون الآن", "بهوية مؤقتة", "الحالة", "إجراءات"]}>
            {(r.data || []).map((x) => (
              <tr key={x.id}>
                <td><b>{x.name}</b></td><td>{x.host}</td><td>{n(x.live)}</td><td>{n(x.temp)}</td><td><Pill s={x.status} /></td>
                <td>{mod && x.status === "live" ? <Confirm danger onYes={() => run(() => api(`/admin/spaces/rooms/${x.id}/close`, { method: "POST" }), `أغلق غرفة ${x.name}`).then((ok) => ok && r.reload())}>إغلاق الغرفة</Confirm> : "—"}</td>
              </tr>
            ))}
          </Table>
          {r.data && !r.data.length && <div className="empty">لا توجد غرف</div>}
        </Card>
      )}
    </>
  );
}

/* ---------- الإشعارات الجماعية ---------- */
export function LiveNotifications() {
  const run = useDo();
  const { data, err, reload } = useLoad("/admin/notifications");
  const [f, setF] = useState({ title: "", body: "", audience: "all" });
  const [busy, setBusy] = useState(false);
  const send = async (e) => {
    e.preventDefault();
    if (f.title.trim().length < 2) return run(async () => { throw new Error("اكتب عنوان الإشعار أولًا"); });
    setBusy(true);
    const r = await run(() => api("/admin/notifications", { method: "POST", body: f }), `أرسل إشعارًا: «${f.title}»`);
    setBusy(false);
    if (r) { setF({ ...f, title: "", body: "" }); reload(); }
  };
  return (
    <div className="grid two">
      <Card title="إشعار جماعي جديد">
        <form className="grid" style={{ gap: 10 }} onSubmit={send}>
          <label className="f">العنوان<input className="inp" maxLength={60} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>
          <label className="f">النص<textarea className="inp" rows="3" maxLength={160} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></label>
          <label className="f">الجمهور<select className="inp" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>
            {Object.entries(data?.audiences || { all: "كل المستخدمين" }).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
          <div className="tag">بيوصل لحاملي التطبيق المفتوح فورًا، ولأجهزة اللي فعّلوا الإشعارات. مسموح إشعار جماعي واحد كل دقيقة.</div>
          <button className="btn pri" type="submit" disabled={busy}>{busy ? "جاري الإرسال…" : "إرسال الآن"}</button>
        </form>
      </Card>
      <Card title="سجل الإشعارات">
        <Err msg={err} />
        <div className="list">
          {(data?.history || []).map((h) => (
            <div className="li" key={h.id}><div><div className="t">{h.title}</div><div className="s">{h.audienceLabel} · {fmt(h.at)} · {h.by}</div></div>
              <div style={{ textAlign: "left" }}><b>{n(h.reach)}</b><div className="s">{n(h.devices)} جهاز</div></div></div>
          ))}
        </div>
        {data && !data.history.length && <div className="empty">لسه ما اتبعتش إشعارات</div>}
      </Card>
    </div>
  );
}

/* ---------- الإعدادات ---------- */
export function LiveSettings() {
  const run = useDo();
  const { data, err, reload } = useLoad("/admin/settings");
  const [msg, setMsg] = useState(null);
  if (err) return <Err msg={err} />;
  if (!data) return <div className="empty">جاري التحميل…</div>;
  const message = msg ?? data.maintenanceMessage;
  const put = (body, ok) => run(() => api("/admin/settings", { method: "PUT", body }), ok).then((r) => { if (r) { setMsg(null); reload(); } });
  return (
    <div className="grid two">
      <Card title="التسجيل">
        <div className="li"><div><div className="t">فتح التسجيل للمستخدمين الجدد</div><div className="s">لو اتقفل، اللي عندهم حسابات يدخلوا عادي والجدد يتمنعوا برسالة</div></div>
          <Switch on={data.registrationOpen} label="فتح التسجيل" onChange={(v) => put({ registrationOpen: v }, `${v ? "فتح" : "قفل"} التسجيل الجديد`)} /></div>
      </Card>
      <Card title="وضع الصيانة">
        <div className="li"><div><div className="t">تفعيل وضع الصيانة</div><div className="s">يوقف التطبيق لكل المستخدمين ويعرض الرسالة. فريق الإدارة بيكمّل شغل عادي.</div></div>
          <Switch on={data.maintenance} label="وضع الصيانة" onChange={(v) => put({ maintenance: v }, `${v ? "فعّل" : "أوقف"} وضع الصيانة`)} /></div>
        <label className="f" style={{ marginTop: 12 }}>رسالة الصيانة
          <textarea className="inp" rows="2" maxLength={200} value={message} onChange={(e) => setMsg(e.target.value)} /></label>
        <button className="btn pri" style={{ marginTop: 10 }} disabled={msg === null || msg.trim().length < 3} onClick={() => put({ maintenanceMessage: msg.trim() }, "حفظ رسالة الصيانة")}>حفظ الرسالة</button>
      </Card>
    </div>
  );
}

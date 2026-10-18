import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Card, Kpi, Table, Pill, Switch, n, egp, useAdmin } from "./ui.jsx";
import { api } from "./api.js";
import { holdUpdate, reloadNow } from "./update.js";

/* ---------- سياق المستخدم الحالي وصلاحياته ---------- */
const MeCtx = createContext(null);
export const useMe = () => useContext(MeCtx);
export function MeProvider({ me, children }) {
  const value = useMemo(() => ({ ...me, can: (p) => me.isOwner || me.permissions.includes(p) }), [me]);
  return <MeCtx.Provider value={value}>{children}</MeCtx.Provider>;
}

const fmt = (iso) => (iso ? new Date(iso).toLocaleString("ar-EG-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }) : "—");
const SERVICES = { elec: "كهرباء", water: "مياه", gas: "غاز", net: "إنترنت", topup: "شحن رصيد", mobile: "فاتورة موبايل", landline: "تليفون أرضي", insurance: "تأمين", tv: "تلفزيون", other: "أخرى" };
const svc = (k) => SERVICES[k] || k || "—";

/**
 * فواصل إعادة المحاولة التلقائية للأخطاء **العابرة** بس.
 * النشرة بتوقف الـ api ثواني (بصمتها في `docker compose ps`: الـ api والـ caddy
 * بيعيدوا التشغيل والقاعدة لأ)، وفي النافذة دي أي طلب بيروح بلا رد فتظهر
 * «تعذّر الاتصال بالسيرفر». التلات فواصل دي بتعدّي النافذة من غير ما المستخدم
 * يعمل أي حاجة. والرد الحقيقي (401/403/404) إعادة المحاولة فيه بلا معنى.
 */
export const RETRY_MS = [3000, 8000, 20_000];
export const transient = (e) => e.code === "network" || e.status >= 500;

/** تحميل بيانات + إعادة تحميل. الأخطاء بتظهر كرسالة واضحة ومعاها «حاول تاني». */
export function useLoad(path, deps = []) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    let timer;
    setErr("");
    const attempt = (i) => {
      api(path).then((d) => { if (live) { setErr(""); setData(d); } }).catch((e) => {
        if (!live) return;
        setErr(e.message);
        if (transient(e) && i < RETRY_MS.length) timer = setTimeout(() => attempt(i + 1), RETRY_MS[i]);
      });
    };
    attempt(0);
    return () => { live = false; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps]);
  return { data, err, reload: useCallback(() => setTick((t) => t + 1), []) };
}

/**
 * رسالة خطأ **ومعاها مخرج دايمًا**. قبل كده كانت نصًّا وخلاص: أي فشل عابر
 * (نشرة شغّالة، نت قطع) يسيب الصفحة واقفة على الرسالة والمستخدم مالوش طريق
 * غير إنه يعمل تحديث بإيده — وده اللي اتبلّغ فعلًا على صفحة الصلاحيات.
 * الافتراضي إعادة تحميل الصفحة، و`onRetry` بتعيد الطلب لوحده بدل الصفحة كلها.
 */
export const Err = ({ msg, onRetry }) => (msg ? (
  <div role="alert" className="empty" style={{ color: "var(--bad)", display: "grid", gap: 8, justifyItems: "center" }}>
    <span>{msg}</span>
    <button className="btn sm" onClick={onRetry || reloadNow}>حاول تاني</button>
  </div>
) : null);

/** زرار بخطوتين (ضغطة ثم تأكيد) للإجراءات الحساسة بدل نافذة confirm */
export function Confirm({ children, onYes, danger, label = "تأكيد؟", disabled }) {
  const [ask, setAsk] = useState(false);
  useEffect(() => { if (!ask) return; const t = setTimeout(() => setAsk(false), 3500); return () => clearTimeout(t); }, [ask]);
  return ask
    ? <button className={`btn sm ${danger ? "dng" : "pri"}`} onClick={() => { setAsk(false); onYes(); }}>{label}</button>
    : <button className={`btn sm ${danger ? "dng" : ""}`} disabled={disabled} onClick={() => setAsk(true)}>{children}</button>;
}

/** ينفّذ طلب ويعرض النجاح/الخطأ كـ toast */
export function useDo() {
  const { act } = useAdmin();
  return useCallback(async (fn, okMsg) => {
    const release = holdUpdate(); // مايحصلش reload للنسخة الجديدة ونحن في وسط حفظ
    try { const r = await fn(); if (okMsg) act(okMsg); return r ?? true; }
    catch (e) { act("تعذّر الإجراء", e.message); return false; }
    finally { release(); }
  }, [act]);
}

/* ---------- المستخدمون ---------- */
export function LiveUsers() {
  const { can } = useMe();
  const run = useDo();
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  const [f, setF] = useState("");
  useEffect(() => { const t = setTimeout(() => setDq(q), 300); return () => clearTimeout(t); }, [q]);
  const { data, err, reload } = useLoad(`/admin/users?q=${encodeURIComponent(dq)}${f ? `&status=${f}` : ""}`);
  const set = (u, status, label) => run(() => api(`/admin/users/${u.id}/status`, { method: "PATCH", body: { status } }), `${label} حساب ${u.name}`).then((ok) => ok && reload());
  return (
    <Card title={`المستخدمون${data ? ` · ${n(data.length)}` : ""}`} right={
      <div className="row">
        <input className="inp" aria-label="بحث" placeholder="بحث بالاسم أو الرقم أو الإيميل" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="inp" aria-label="الحالة" value={f} onChange={(e) => setF(e.target.value)}>
          <option value="">كل الحالات</option><option value="active">نشط</option><option value="suspended">موقوف</option><option value="banned">محظور</option>
        </select>
      </div>}>
      <Err msg={err} />
      <Table head={["المستخدم", "التواصل", "انضم", "المحفظة", "الحالة", can("users.manage") ? "إجراءات" : ""]}>
        {(data || []).map((u) => (
          <tr key={u.id}>
            <td><b>{u.name}</b><div style={{ color: "var(--muted)", fontSize: 12 }} dir="ltr">{u.id}</div></td>
            <td dir="ltr" style={{ textAlign: "right" }}>{u.contact}</td>
            <td>{fmt(u.joined)}</td><td>{egp(u.wallet)}</td><td><Pill s={u.status} /></td>
            <td>{can("users.manage") && <div className="row">
              {u.status === "active" && <>
                <Confirm onYes={() => set(u, "suspended", "أوقف")}>إيقاف</Confirm>
                <Confirm danger onYes={() => set(u, "banned", "حظر")}>حظر</Confirm></>}
              {u.status !== "active" && <Confirm onYes={() => set(u, "active", "فعّل")}>إعادة تفعيل</Confirm>}
            </div>}</td>
          </tr>
        ))}
      </Table>
      {data && !data.length && <div className="empty">لا يوجد مستخدمون بهذه المواصفات</div>}
    </Card>
  );
}

/* ---------- المدفوعات ---------- */
const KIND = { bill: "فاتورة", topup: "شحن", refund: "استرداد" };
export function LivePayments() {
  const { can } = useMe();
  const run = useDo();
  const [kind, setKind] = useState("");
  const [q, setQ] = useState("");
  const [dq, setDq] = useState("");
  useEffect(() => { const t = setTimeout(() => setDq(q), 300); return () => clearTimeout(t); }, [q]);
  const sum = useLoad("/admin/finance/summary");
  const tx = useLoad(`/admin/finance/tx?q=${encodeURIComponent(dq)}${kind ? `&kind=${kind}` : ""}`);
  const s = sum.data;
  const refund = (t) => run(() => api(`/admin/finance/tx/${t.id}/refund`, { method: "POST", body: {} }), `استرد العملية ${t.ref} بقيمة ${egp(t.paid)}`).then((ok) => { if (ok) { tx.reload(); sum.reload(); } });
  return (
    <>
      <div className="grid kpis">
        <Kpi l="حجم الفواتير (30 يوم)" v={egp(s?.bills.amount ?? 0)} d={`${n(s?.bills.count ?? 0)} عملية`} up />
        <Kpi l="خصومات العروض (30 يوم)" v={egp(s?.bills.discount ?? 0)} />
        <Kpi l="الشحن (30 يوم)" v={egp(s?.topups.amount ?? 0)} d={`${n(s?.topups.count ?? 0)} عملية`} />
        <Kpi l="المستردّ (30 يوم)" v={egp(s?.refunds.amount ?? 0)} d={`${n(s?.refunds.count ?? 0)} عملية`} />
      </div>
      <div style={{ marginTop: 14 }}>
        <Card title="آخر العمليات" right={
          <div className="row">
            <input className="inp" aria-label="بحث" placeholder="رقم العملية أو اسم العميل" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="inp" aria-label="النوع" value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">كل الأنواع</option><option value="bill">فواتير</option><option value="topup">شحن</option><option value="refund">استرداد</option>
            </select>
          </div>}>
          <Err msg={sum.err || tx.err} />
          <Table head={["رقم العملية", "العميل", "النوع", "الخدمة", "المبلغ", "الخصم", "الوقت", "الحالة", ""]}>
            {(tx.data || []).map((t) => (
              <tr key={t.id}>
                <td dir="ltr" style={{ textAlign: "right" }}>{t.ref}</td><td>{t.user}</td><td>{KIND[t.kind]}</td><td>{svc(t.service)}</td>
                <td>{egp(t.amount)}</td><td>{t.discount ? egp(t.discount) : "—"}</td><td>{fmt(t.at)}</td>
                <td><Pill s={t.kind === "refund" ? "refunded" : t.status} /></td>
                <td>{can("finance.refund") && t.kind === "bill" && t.status === "done" && <Confirm danger onYes={() => refund(t)}>استرداد</Confirm>}</td>
              </tr>
            ))}
          </Table>
          {tx.data && !tx.data.length && <div className="empty">لا توجد عمليات</div>}
        </Card>
      </div>
    </>
  );
}

/* ---------- العروض ---------- */
export function LiveOffers() {
  const { can } = useMe();
  const run = useDo();
  const { data, err, reload } = useLoad("/admin/offers");
  const [f, setF] = useState({ code: "", percent: 10, max: 30, service: "" });
  const save = (o) => run(() => api(`/admin/offers/${encodeURIComponent(o.code)}`, { method: "PUT", body: { service: o.service || null, percent: +o.percent, max: +o.max, active: o.active ?? true } }), `حفظ الكود ${o.code}`).then((ok) => ok && reload());
  const add = (e) => { e.preventDefault(); save({ ...f, code: f.code.trim().toUpperCase() }).then(() => setF({ ...f, code: "" })); };
  return (
    <>
      {can("finance.offers") && (
        <Card title="كود خصم جديد">
          <form className="form" onSubmit={add}>
            <label className="f">الكود<input className="inp" dir="ltr" required value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="SAVE20" /></label>
            <label className="f">نسبة الخصم ٪<input className="inp" type="number" min="1" max="100" required value={f.percent} onChange={(e) => setF({ ...f, percent: e.target.value })} /></label>
            <label className="f">أقصى خصم (ج.م)<input className="inp" type="number" min="0" required value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} /></label>
            <label className="f">ينطبق على
              <select className="inp" value={f.service} onChange={(e) => setF({ ...f, service: e.target.value })}>
                <option value="">كل الخدمات</option>{Object.entries(SERVICES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></label>
            <button className="btn pri" type="submit">إنشاء الكود</button>
          </form>
        </Card>
      )}
      <div style={{ marginTop: 14 }}>
        <Card title="أكواد الخصم والعروض">
          <Err msg={err} />
          <Table head={["الكود", "الخصم", "ينطبق على", "مفعّل", ""]}>
            {(data || []).map((o) => (
              <tr key={o.code}>
                <td dir="ltr" style={{ textAlign: "right" }}><b>{o.code}</b></td>
                <td>{n(o.percent)}٪ (حتى {n(o.max)} ج.م)</td>
                <td>{o.service ? o.service.split(",").map(svc).join("، ") : "كل الخدمات"}</td>
                <td><Switch on={o.active} label={`تفعيل ${o.code}`} onChange={can("finance.offers") ? (v) => save({ ...o, active: v }) : () => {}} /></td>
                <td>{can("finance.offers") && <Confirm danger onYes={() => run(() => api(`/admin/offers/${encodeURIComponent(o.code)}`, { method: "DELETE" }), `حذف الكود ${o.code}`).then(reload)}>حذف</Confirm>}</td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}

/* ---------- الفريق والصلاحيات ---------- */
function PermEditor({ catalog, role, staff, onSave, me }) {
  // الحالة الفعلية للصلاحيات؛ عند الحفظ نحوّلها لـ grant/revoke نسبةً لصلاحيات الدور
  const [on, setOn] = useState(() => new Set(staff.permissions));
  const rolePerms = new Set(role?.permissions || []);
  const toggle = (k) => setOn((s) => { const x = new Set(s); x.has(k) ? x.delete(k) : x.add(k); return x; });
  const grant = catalog.map((c) => c.key).filter((k) => on.has(k) && !rolePerms.has(k));
  const revoke = catalog.map((c) => c.key).filter((k) => !on.has(k) && rolePerms.has(k));
  const groups = [...new Set(catalog.map((c) => c.group))];
  return (
    <div style={{ padding: 12, background: "var(--panel2)", borderRadius: 10, display: "grid", gap: 10 }}>
      <div style={{ color: "var(--muted)", fontSize: 12 }}>صلاحيات الدور <b>{role?.name}</b> هي الأساس. علّمي أو شيلي أي صلاحية لهذا الشخص بس.</div>
      {groups.map((g) => (
        <div key={g}>
          <b style={{ fontSize: 12 }}>{g}</b>
          <div className="row" style={{ marginTop: 6 }}>
            {catalog.filter((c) => c.group === g).map((c) => {
              const checked = on.has(c.key);
              const locked = !checked && !me.can(c.key); // مينفعش تدّي حاجة مالكش
              return (
                <label key={c.key} className="row" style={{ gap: 6, opacity: locked ? 0.45 : 1 }}>
                  <input type="checkbox" checked={checked} disabled={locked} onChange={() => toggle(c.key)} />
                  <span>{c.label}</span>
                  {rolePerms.has(c.key) ? <span className="tag">من الدور</span> : checked ? <span className="tag" style={{ color: "var(--good)" }}>إضافة</span> : null}
                </label>
              );
            })}
          </div>
        </div>
      ))}
      <div className="row"><button className="btn pri" onClick={() => onSave({ grant, revoke })}>حفظ الصلاحيات</button>
        <span style={{ color: "var(--muted)", fontSize: 12 }}>{grant.length ? `+${n(grant.length)} إضافية ` : ""}{revoke.length ? `−${n(revoke.length)} مسحوبة` : ""}</span></div>
    </div>
  );
}

export function LiveTeam() {
  const me = useMe();
  const run = useDo();
  const mgr = me.can("team.manage");
  const staff = useLoad("/admin/staff");
  const roles = useLoad("/admin/roles");
  const [open, setOpen] = useState(null);
  const [add, setAdd] = useState({ contact: "", name: "", roleId: "" });
  const [newRole, setNewRole] = useState("");
  const rl = roles.data || [];
  const catalog = me.catalog;
  const reloadAll = () => { staff.reload(); roles.reload(); };
  const patch = (s, body, msg) => run(() => api(`/admin/staff/${s.userId}`, { method: "PATCH", body }), msg).then((ok) => { if (ok) { reloadAll(); setOpen(null); } });
  const submitAdd = (e) => {
    e.preventDefault();
    run(() => api("/admin/staff", { method: "POST", body: { contact: add.contact, name: add.name || undefined, roleId: add.roleId || rl[0]?.id } }), "أضاف عضو جديد للفريق")
      .then((ok) => { if (ok) { setAdd({ contact: "", name: "", roleId: "" }); reloadAll(); } });
  };
  const toggleRolePerm = (r, k) => {
    const permissions = r.permissions.includes(k) ? r.permissions.filter((x) => x !== k) : [...r.permissions, k];
    run(() => api(`/admin/roles/${r.id}`, { method: "PATCH", body: { permissions } }), `عدّل صلاحيات دور ${r.name}`).then(roles.reload).then(staff.reload);
  };
  const groups = [...new Set(catalog.map((c) => c.group))];
  return (
    <>
      <Card title="أعضاء الفريق">
        <Err msg={staff.err} onRetry={reloadAll} />
        <Table head={["العضو", "الدور", "الصلاحيات", "مفعّل", ""]}>
          {(staff.data || []).flatMap((s) => {
            const locked = !mgr || s.isOwner || s.userId === me.user.id;
            const role = rl.find((r) => r.id === s.role?.id);
            const rows = [
              <tr key={s.userId}>
                <td><b>{s.name}</b><div dir="ltr" style={{ color: "var(--muted)", fontSize: 12, textAlign: "right" }}>{s.contact}</div></td>
                <td>{s.isOwner ? <span className="pill p-warn">مالك</span> :
                  <select className="inp" aria-label={`دور ${s.name}`} disabled={locked} value={s.role?.id || ""} onChange={(e) => patch(s, { roleId: e.target.value }, `غيّر دور ${s.name}`)}>
                    {rl.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}</td>
                <td>{s.isOwner ? "كل الصلاحيات" : <>{n(s.permissions.length)} من {n(catalog.length)}{(s.grant.length || s.revoke.length) ? <span className="tag" style={{ marginInlineStart: 6 }}>مخصّصة</span> : null}
                  {!locked && <button className="btn sm" style={{ marginInlineStart: 8 }} onClick={() => setOpen(open === s.userId ? null : s.userId)}>تخصيص</button>}</>}</td>
                <td>{s.isOwner ? "—" : <Switch on={s.active} label={`تفعيل ${s.name}`} onChange={locked ? () => {} : (v) => patch(s, { active: v }, `${v ? "فعّل" : "عطّل"} ${s.name}`)} />}</td>
                <td>{!s.isOwner && mgr && s.userId !== me.user.id && <Confirm danger label="تأكيد الإزالة" onYes={() => run(() => api(`/admin/staff/${s.userId}`, { method: "DELETE" }), `أزال ${s.name} من الفريق`).then(reloadAll)}>إزالة</Confirm>}</td>
              </tr>,
            ];
            if (open === s.userId) rows.push(<tr key={s.userId + "-e"}><td colSpan={5}><PermEditor key={s.userId + s.permissions.join()} catalog={catalog} role={role} staff={s} me={me} onSave={(b) => patch(s, b, `خصّص صلاحيات ${s.name}`)} /></td></tr>);
            return rows;
          })}
        </Table>
        {mgr && (
          <form className="form" style={{ marginTop: 12 }} onSubmit={submitAdd}>
            <label className="f">رقم الموبايل أو الإيميل<input className="inp" dir="ltr" required value={add.contact} onChange={(e) => setAdd({ ...add, contact: e.target.value })} placeholder="01xxxxxxxxx" /></label>
            <label className="f">الاسم (اختياري)<input className="inp" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} /></label>
            <label className="f">الدور<select className="inp" value={add.roleId || rl[0]?.id || ""} onChange={(e) => setAdd({ ...add, roleId: e.target.value })}>
              {rl.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
            <button className="btn pri" type="submit">إضافة للفريق</button>
          </form>
        )}
        {mgr && <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 8 }}>العضو الجديد بيدخل اللوحة بنفس رقمه/إيميله وكود التحقق. مفيش كلمة سر.</div>}
      </Card>

      <div style={{ marginTop: 14 }}>
        <Card title="الأدوار والصلاحيات" right={mgr && (
          <form className="row" onSubmit={(e) => { e.preventDefault(); run(() => api("/admin/roles", { method: "POST", body: { name: newRole, permissions: [] } }), `أنشأ دور ${newRole}`).then((ok) => { if (ok) { setNewRole(""); roles.reload(); } }); }}>
            <input className="inp" aria-label="اسم الدور الجديد" placeholder="دور جديد…" value={newRole} onChange={(e) => setNewRole(e.target.value)} />
            <button className="btn" type="submit" disabled={newRole.trim().length < 2}>إضافة دور</button>
          </form>)}>
          <Err msg={roles.err} onRetry={roles.reload} />
          <Table head={["الصلاحية", ...rl.map((r) => `${r.name} (${n(r.members)})`)]}>
            {groups.flatMap((g) => [
              <tr key={g}><td colSpan={rl.length + 1} style={{ color: "var(--gold)", fontWeight: 800, fontSize: 12 }}>{g}</td></tr>,
              ...catalog.filter((c) => c.group === g).map((c) => (
                <tr key={c.key}><td>{c.label}</td>
                  {rl.map((r) => {
                    const has = r.permissions.includes(c.key);
                    const dis = !mgr || (!has && !me.can(c.key));
                    return <td key={r.id} style={{ textAlign: "center" }}><input type="checkbox" aria-label={`${c.label} — ${r.name}`} checked={has} disabled={dis} onChange={() => toggleRolePerm(r, c.key)} /></td>;
                  })}</tr>
              )),
            ])}
            {mgr && <tr><td></td>{rl.map((r) => <td key={r.id} style={{ textAlign: "center" }}>{!r.system && !r.members ? <Confirm danger label="حذف؟" onYes={() => run(() => api(`/admin/roles/${r.id}`, { method: "DELETE" }), `حذف دور ${r.name}`).then(roles.reload)}>حذف</Confirm> : null}</td>)}</tr>}
          </Table>
          <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 8 }}>تعديل المصفوفة بيتحفظ فورًا ويسري على كل أعضاء الدور. المالك عنده كل الصلاحيات دايمًا. مينفعش تدّي صلاحية مش عندك.</div>
        </Card>
      </div>
      {me.can("audit.view") && <div style={{ marginTop: 14 }}><LiveAudit watch={[staff.data, roles.data]} /></div>}
    </>
  );
}

/* ---------- سجل المراجعة ---------- */
export function LiveAudit({ watch = [] }) {
  const [rows, setRows] = useState([]);
  const [more, setMore] = useState(true);
  const [err, setErr] = useState("");
  const last = useRef(null);
  const load = useCallback(async (reset) => {
    try {
      const before = reset ? "" : last.current ? `&before=${encodeURIComponent(last.current)}` : "";
      const d = await api(`/admin/audit?limit=20${before}`);
      setRows((r) => (reset ? d : [...r, ...d]));
      setMore(d.length === 20);
      if (d.length) last.current = d[d.length - 1].at;
    } catch (e) { setErr(e.message); }
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(true); }, [load, ...watch]);
  return (
    <Card title="سجل المراجعة (كل إجراء إداري يُسجَّل هنا)" right={<button className="btn sm" onClick={() => load(true)}>تحديث</button>}>
      <Err msg={err} />
      <div className="list">
        {rows.map((a) => <div className="li" key={a.id}><div><span className="t">{a.who}</span> <span>{a.what}{a.target ? ` — ${a.target}` : ""}</span></div><span className="s">{fmt(a.at)}</span></div>)}
        {!rows.length && !err && <div className="empty">لا توجد إجراءات بعد</div>}
      </div>
      {more && rows.length >= 20 && <div style={{ textAlign: "center", marginTop: 10 }}><button className="btn" onClick={() => load(false)}>عرض المزيد</button></div>}
    </Card>
  );
}

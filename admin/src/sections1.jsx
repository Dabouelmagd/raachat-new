import React, { useState } from "react";
import { Card, Kpi, Table, Pill, Switch, LineChart, Bars, n, egp, useAdmin } from "./ui.jsx";
import { DAU, SIGNUPS, USERS, GROUPS, ROOMS, STORIES } from "./data.js";

export function Overview({ reports, campaigns, tx, go }) {
  const openReports = reports.filter((r) => r.status === "open").length;
  const pendingAds = campaigns.filter((c) => c.status === "pending").length;
  const failed = tx.filter((t) => t.status === "failed" || t.status === "pending").length;
  const attention = [
    { t: `${n(openReports)} بلاغات مفتوحة`, s: "تحتاج مراجعة المشرفين", to: "reports", tone: openReports ? "warn" : "good" },
    { t: `${n(pendingAds)} إعلانات تنتظر الموافقة`, s: "حملات جديدة من المعلنين", to: "ads", tone: pendingAds ? "warn" : "good" },
    { t: `${n(failed)} عمليات دفع فاشلة أو معلّقة`, s: "راجع المدفوعات", to: "payments", tone: failed ? "bad" : "good" },
  ];
  return (
    <>
      <div className="grid k3">
        <Kpi l="نشطون اليوم" v={n(6410)} d="▲ ٤٫٦٪ عن الأسبوع الماضي" up />
        <Kpi l="مستخدمون جدد (٣٠ يوم)" v={n(3630)} d="▲ ١١٪" up />
        <Kpi l="رسائل اليوم" v={n(184200)} d="▲ ٢٫٩٪" up />
        <Kpi l="غرف مباشرة الآن" v={n(ROOMS.filter((r) => r.status === "live").length)} d={`${n(344)} مستمع`} up />
        <Kpi l="حجم المدفوعات (٣٠ يوم)" v={`${n(851800)} ج.م`} d="▲ ٨٪" up />
        <Kpi l="إيراد الإعلانات (٣٠ يوم)" v={`${n(17300)} ج.م`} d="▼ ١٫٢٪" />
      </div>
      <div className="grid two" style={{ marginTop: 14 }}>
        <Card title="المستخدمون النشطون يوميًا · آخر ٣٠ يوم"><LineChart data={DAU} /></Card>
        <Card title="يحتاج انتباهك">
          <div className="list">
            {attention.map((a) => (
              <div className="li" key={a.to}>
                <div><div className="t">{a.t}</div><div className="s">{a.s}</div></div>
                <button className={`btn ${a.tone === "good" ? "" : "pri"}`} onClick={() => go(a.to)}>{a.tone === "good" ? "لا شيء معلّق" : "افتح"}</button>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div className="grid two" style={{ marginTop: 14 }}>
        <Card title="مصدر التسجيل (٣٠ يوم)"><Bars rows={SIGNUPS} /></Card>
        <Card title="الغرف المباشرة الآن">
          <div className="list">
            {ROOMS.filter((r) => r.status === "live").map((r) => (
              <div className="li" key={r.id}><div><div className="t">{r.name}</div><div className="s">المضيف: {r.host}</div></div><b>{n(r.live)} مستمع</b></div>
            ))}
          </div>
        </Card>
      </div>
      <p className="tag" style={{ display: "inline-block", marginTop: 14 }}>كل الأرقام تجريبية، تُربط لاحقًا بالباك إند</p>
    </>
  );
}

export function Users() {
  const { act } = useAdmin();
  const [rows, setRows] = useState(USERS);
  const [q, setQ] = useState("");
  const [f, setF] = useState("all");
  const set = (id, status, label) => {
    const u = rows.find((r) => r.id === id);
    setRows(rows.map((r) => (r.id === id ? { ...r, status } : r)));
    act(`${label} حساب ${u.name} (${id})`);
  };
  const shown = rows.filter((r) => (f === "all" || r.status === f) && (r.name + r.contact + r.id).includes(q));
  return (
    <Card title={`المستخدمون · ${n(shown.length)}`} right={
      <div className="row">
        <input id="uq" className="inp" placeholder="بحث بالاسم أو الرقم أو الإيميل" value={q} onChange={(e) => setQ(e.target.value)} />
        <select id="uf" className="inp" value={f} onChange={(e) => setF(e.target.value)}>
          <option value="all">كل الحالات</option><option value="active">نشط</option><option value="suspended">موقوف</option><option value="banned">محظور</option><option value="deleted">محذوف</option>
        </select>
      </div>}>
      <Table head={["المستخدم", "التواصل", "انضم", "المحفظة", "الحالة", "إجراءات"]}>
        {shown.map((u) => (
          <tr key={u.id}>
            <td><b>{u.name}</b><div className="s" style={{ color: "var(--muted)", fontSize: 12 }}>{u.id}{u.verified ? "" : " · غير موثّق"}</div></td>
            <td dir="ltr" style={{ textAlign: "right" }}>{u.contact}</td>
            <td>{u.joined}</td><td>{egp(u.wallet)}</td><td><Pill s={u.status} /></td>
            <td><div className="row">
              {u.status === "active" && <><button className="btn sm" onClick={() => set(u.id, "suspended", "أوقف")}>إيقاف</button><button className="btn sm dng" onClick={() => set(u.id, "banned", "حظر")}>حظر</button></>}
              {u.status !== "active" && u.status !== "deleted" && <button className="btn sm" onClick={() => set(u.id, "active", "فعّل")}>إعادة تفعيل</button>}
            </div></td>
          </tr>
        ))}
      </Table>
      {!shown.length && <div className="empty">لا يوجد مستخدمون بهذه المواصفات</div>}
    </Card>
  );
}

export function Spaces() {
  const { act } = useAdmin();
  const [tab, setTab] = useState("groups");
  const [groups, setGroups] = useState(GROUPS);
  const [rooms, setRooms] = useState(ROOMS);
  return (
    <>
      <div className="tabs">
        <button className="tab" aria-pressed={tab === "groups"} onClick={() => setTab("groups")}>الجروبات</button>
        <button className="tab" aria-pressed={tab === "rooms"} onClick={() => setTab("rooms")}>الغرف الصوتية</button>
      </div>
      {tab === "groups" ? (
        <Card title="الجروبات">
          <Table head={["الجروب", "المنشئ", "الأعضاء", "بلاغات", "الحالة", "إجراءات"]}>
            {groups.map((g) => (
              <tr key={g.id}>
                <td><b>{g.name}</b><div style={{ color: "var(--muted)", fontSize: 12 }}>{g.id}</div></td><td>{g.owner}</td><td>{n(g.members)}</td>
                <td>{g.reports ? <span className="pill p-warn">{n(g.reports)}</span> : "—"}</td><td><Pill s={g.status} /></td>
                <td><div className="row">
                  <button className="btn sm" onClick={() => { setGroups(groups.map((x) => x.id === g.id ? { ...x, status: x.status === "restricted" ? "active" : "restricted" } : x)); act(`${g.status === "restricted" ? "رفع التقييد عن" : "قيّد"} جروب ${g.name}`); }}>{g.status === "restricted" ? "رفع التقييد" : "تقييد"}</button>
                  <button className="btn sm dng" onClick={() => { setGroups(groups.filter((x) => x.id !== g.id)); act(`حذف جروب ${g.name}`); }}>حذف</button>
                </div></td>
              </tr>
            ))}
          </Table>
        </Card>
      ) : (
        <Card title="الغرف الصوتية">
          <Table head={["الغرفة", "المضيف", "المستمعون الآن", "الذروة", "بهوية مؤقتة", "الحالة", "إجراءات"]}>
            {rooms.map((r) => (
              <tr key={r.id}>
                <td><b>{r.name}</b></td><td>{r.host}</td><td>{n(r.live)}</td><td>{n(r.peak)}</td><td>{n(r.stealth)}٪</td><td><Pill s={r.status} /></td>
                <td>{r.status === "live" ? <button className="btn sm dng" onClick={() => { setRooms(rooms.map((x) => x.id === r.id ? { ...x, status: "ended", live: 0 } : x)); act(`أغلق غرفة ${r.name}`); }}>إغلاق الغرفة</button> : "—"}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
    </>
  );
}

/** المحتوى (Stories) — صفحة لوحدها، منفصلة عن البلاغات */
export function Content() {
  const { act } = useAdmin();
  const [stories, setStories] = useState(STORIES);
  return (
    <Card title="Stories النشطة">
      <Table head={["المستخدم", "النص", "المشاهدات", "بلاغات", "منذ", ""]}>
        {stories.map((s) => (
          <tr key={s.id}><td><b>{s.user}</b></td><td>{s.caption}</td><td>{n(s.views)}</td><td>{s.reports ? <span className="pill p-warn">{n(s.reports)}</span> : "—"}</td><td>{s.time}</td>
            <td><button className="btn sm dng" onClick={() => { setStories(stories.filter((x) => x.id !== s.id)); act(`حذف Story للمستخدم ${s.user}`); }}>حذف</button></td></tr>
        ))}
      </Table>
      {!stories.length && <div className="empty">لا توجد Stories نشطة</div>}
    </Card>
  );
}

export function Reports({ reports, setReports }) {
  const { act } = useAdmin();
  const [tab, setTab] = useState("open");
  const resolve = (r, what) => { setReports(reports.map((x) => x.id === r.id ? { ...x, status: "resolved" } : x)); act(`${what} (${r.id}) — ${r.target}`); };
  const list = reports.filter((r) => r.status === tab);
  return (
    <>
      <div className="tabs">
        <button className="tab" aria-pressed={tab === "open"} onClick={() => setTab("open")}>مفتوحة ({n(reports.filter((r) => r.status === "open").length)})</button>
        <button className="tab" aria-pressed={tab === "resolved"} onClick={() => setTab("resolved")}>تمت معالجتها ({n(reports.filter((r) => r.status === "resolved").length)})</button>
      </div>
      <div className="grid two">
        {list.map((r) => (
          <div className="rep" key={r.id}>
            <div className="row" style={{ justifyContent: "space-between" }}><b>{r.reason}</b><span className="tag">{r.type} · {r.time}</span></div>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>المبلَّغ عنه: <b style={{ color: "var(--fg)" }}>{r.target}</b> · بواسطة {r.reporter} · {r.where}</div>
            <q>{r.text}</q>
            {r.status === "open" ? (
              <div className="row">
                <button className="btn sm dng" onClick={() => resolve(r, "حذف المحتوى وحظر")}>حذف + حظر</button>
                <button className="btn sm" onClick={() => resolve(r, "حذف المحتوى")}>حذف المحتوى</button>
                <button className="btn sm" onClick={() => resolve(r, "أرسل تحذيرًا")}>تحذير</button>
                <button className="btn sm" onClick={() => resolve(r, "تجاهل البلاغ")}>تجاهل</button>
              </div>) : <Pill s="resolved" />}
          </div>
        ))}
      </div>
      {!list.length && <div className="empty">لا توجد بلاغات هنا</div>}
    </>
  );
}

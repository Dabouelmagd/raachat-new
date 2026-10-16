import React, { useState, useEffect } from "react";
import { LayoutDashboard, Users as UsersI, MessagesSquare, Flag, Images, Wallet, Tag, Megaphone, Bell, ShieldCheck, Settings as SetI, Sun, Moon } from "lucide-react";
import logo from "./logo.png";
import { Provider } from "./ui.jsx";
import { LiveOverview, LiveSpaces, LiveNotifications, LiveSettings } from "./liveAdmin2.jsx";
import { LiveReports, LiveContent } from "./liveReports.jsx";
import { Overview, Users, Spaces, Reports, Content } from "./sections1.jsx";
import { Payments, Offers, Notifications, Team } from "./sections2.jsx";
import { Settings } from "./sections3.jsx";
import { Ads } from "./ads.jsx";
import { REPORTS, TX, CAMPAIGNS, AUDIT_SEED } from "./data.js";
import { API_ON, api, logout, useSession, hasHandoff, consumeHandoff } from "./api.js";
import { LiveAds } from "./liveAds.jsx";
import { Login } from "./Login.jsx";
import { MeProvider, LiveUsers, LivePayments, LiveOffers, LiveTeam, RETRY_MS, transient } from "./live.jsx";
import { onUpdateFound, reloadNow } from "./update.js";

// الصلاحية المطلوبة لكل قسم (وضع الباك إند). overview مفتوح لأي عضو.
const NEED = { users: "users.view", spaces: "content.view", reports: "content.view", content: "content.view", payments: "finance.view", offers: "finance.view", ads: "ads.view", notifications: "notifications.send", team: "team.view", settings: "settings.manage" };
// أقسام لسه ببيانات تجريبية (هتتوصّل بعدين)
const DEMO_SECTIONS = new Set([]);

const NAV = [
  ["overview", "نظرة عامة", LayoutDashboard], ["users", "المستخدمون", UsersI], ["spaces", "الجروبات والغرف", MessagesSquare],
  ["reports", "البلاغات", Flag], ["content", "المحتوى", Images], ["payments", "المدفوعات والخدمات", Wallet], ["offers", "العروض والخصومات", Tag],
  ["ads", "الإعلانات", Megaphone], ["notifications", "الإشعارات", Bell], ["team", "الفريق والصلاحيات", ShieldCheck], ["settings", "الإعدادات", SetI],
];
const TITLES = Object.fromEntries(NAV.map((x) => [x[0], x[1]]));

export default function App() {
  const session = useSession();
  const [handoff, setHandoff] = useState(() => API_ON && hasHandoff());
  const [hErr, setHErr] = useState("");
  useEffect(() => { if (handoff) consumeHandoff().then((m) => { setHErr(m); setHandoff(false); }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!API_ON) return <Dashboard demo />;
  if (handoff) return <div className="empty" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>جاري الدخول…</div>;
  return session ? <Gate /> : <Login notice={hErr} />;
}

/**
 * وضع الباك إند: يجيب هوية الموظف وصلاحياته قبل ما يعرض أي حاجة.
 *
 * ولو الطلب ده فشل، دي كانت **مصيدة**: الشاشة كانت بتعرض الخطأ ومعاه زرار
 * «تسجيل الخروج» وبس — فلو الـ api بيعيد التشغيل (نشرة) المخرج الوحيد إنك
 * تخرجي من حسابك أو تعملي تحديث بإيدك. دلوقتي بتعيد المحاولة لوحدها للأخطاء
 * العابرة، ومعاها زرار «حاول تاني».
 */
function Gate() {
  const [me, setMe] = useState(null);
  const [err, setErr] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    let timer;
    setErr("");
    const attempt = (i) => {
      api("/admin/me").then((m) => { if (live) setMe(m); }).catch((e) => {
        if (!live || e.status === 401) return; // 401 بيرجّعها لشاشة الدخول لوحده
        setErr(e.status === 403 ? "الحساب ده مش من فريق الإدارة. اطلبي من المالك يضيفك." : e.message);
        if (transient(e) && i < RETRY_MS.length) timer = setTimeout(() => attempt(i + 1), RETRY_MS[i]);
      });
    };
    attempt(0);
    return () => { live = false; clearTimeout(timer); };
  }, [tick]);
  if (err) return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}><div className="card" style={{ maxWidth: 380, display: "grid", gap: 12 }}><div role="alert" style={{ color: "var(--bad)" }}>{err}</div><div className="row"><button className="btn pri" onClick={() => setTick((t) => t + 1)}>حاول تاني</button><button className="btn" onClick={logout}>تسجيل الخروج</button></div></div></div>;
  if (!me) return <div className="empty" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>جاري التحميل…</div>;
  return <MeProvider me={me}><Dashboard me={me} /></MeProvider>;
}

function Dashboard({ demo, me }) {
  const [page, setPage] = useState(() => { const h = (location.hash || "").slice(1); return TITLES[h] ? h : "overview"; });
  const [reports, setReports] = useState(REPORTS);
  const [tx, setTx] = useState(TX);
  const [campaigns, setCampaigns] = useState(CAMPAIGNS);
  const [theme, setTheme] = useState("");
  // نشرة جديدة واللوحة قدام المستخدم: شريط وهو يقرر. ولو التاب مخفي بتتحدّث لوحدها.
  const [fresh, setFresh] = useState(false);
  useEffect(() => onUpdateFound(() => setFresh(true)), []);
  useEffect(() => { try { history.replaceState(null, "", "#" + page); } catch {} window.scrollTo(0, 0); }, [page]);
  useEffect(() => { if (theme) document.documentElement.setAttribute("data-theme", theme); }, [theme]);

  const allowed = (k) => demo || !NEED[k] || me.isOwner || me.permissions.includes(NEED[k]);
  const nav = NAV.filter(([k]) => allowed(k));
  const badge = !demo ? {} : { reports: reports.filter((r) => r.status === "open").length, ads: campaigns.filter((c) => c.status === "pending").length, payments: tx.filter((t) => t.status === "failed" || t.status === "pending").length };
  return (
    <Provider seed={AUDIT_SEED}>
      <div className="app">
        <nav className="side" aria-label="أقسام لوحة التحكم">
          <div className="brand"><img src={logo} alt="" /><div><b>رع شات</b><span>لوحة تحكم المالك</span></div></div>
          {nav.map(([k, label, Icon]) => (
            <button key={k} className="nav" aria-current={page === k ? "page" : undefined} onClick={() => setPage(k)}>
              <Icon size={17} /> {label}{badge[k] ? <span className="dot">{badge[k].toLocaleString("ar-EG")}</span> : null}
            </button>
          ))}
          <div className="foot">{demo ? "نسخة تجريبية · بيانات وهمية" : <><div>{me.user.name} · {me.isOwner ? "المالك" : me.role?.name}</div><button className="btn sm" style={{ marginTop: 8 }} onClick={logout}>تسجيل الخروج</button></>}</div>
        </nav>
        <main className="main">
          <div className="top">
            <div><h1>{TITLES[page]}</h1><div className="sub">{demo ? "لوحة المالك" : me.isOwner ? "لوحة المالك" : `لوحة الإدارة · ${me.role?.name || ""}`} · كل الإجراءات تُسجَّل في سجل المراجعة</div></div>
            <div className="row">
              <button className="btn" aria-label="تبديل المظهر" onClick={() => setTheme((t) => (t === "light" || (!t && matchMedia("(prefers-color-scheme: light)").matches) ? "dark" : "light"))}><Sun size={15} /> / <Moon size={15} /></button>
            </div>
          </div>
          {fresh && <div role="status" className="card" style={{ marginBottom: 14, borderColor: "var(--gold)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span>فيه نسخة جديدة من اللوحة.</span>
            <button className="btn sm pri" onClick={reloadNow}>حدّثي الآن</button>
            <span style={{ color: "var(--muted)", fontSize: 12 }}>أو هتتحدّث لوحدها أول ما تسيبي التبويب.</span>
          </div>}
          {!demo && DEMO_SECTIONS.has(page) &&<div role="note" className="card" style={{ marginBottom: 14, borderColor: "var(--warn)", color: "var(--warn)" }}>القسم ده لسه ببيانات تجريبية، ومش متوصّل بالسيرفر بعد.</div>}
          {!allowed(page) ? <div className="empty">مالكش صلاحية للقسم ده</div> : <>
          {page === "overview" && (!demo ? <LiveOverview go={setPage} /> : <Overview reports={reports} campaigns={campaigns} tx={tx} go={setPage} />)}
          {page === "users" && (demo ? <Users /> : <LiveUsers />)}
          {page === "spaces" && (demo ? <Spaces /> : <LiveSpaces />)}
          {page === "reports" && (demo ? <Reports reports={reports} setReports={setReports} /> : <LiveReports />)}
          {page === "content" && (demo ? <Content /> : <LiveContent />)}
          {page === "payments" && (demo ? <Payments tx={tx} setTx={setTx} /> : <LivePayments />)}
          {page === "offers" && (demo ? <Offers /> : <LiveOffers />)}
          {page === "ads" && (demo ? <Ads campaigns={campaigns} setCampaigns={setCampaigns} /> : <LiveAds />)}
          {page === "notifications" && (demo ? <Notifications /> : <LiveNotifications />)}
          {page === "team" && (demo ? <Team /> : <LiveTeam />)}
          {page === "settings" && (demo ? <Settings /> : <LiveSettings />)}
          </>}
        </main>
      </div>
    </Provider>
  );
}

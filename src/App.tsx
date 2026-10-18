import { useEffect, useState } from "react";
import { Routes, Route, useLocation, NavLink } from "react-router-dom";
import { Ankh, Cartouche, Lotus, Pyramids, Scarab } from "./components/PharaohIcons";
import { NotificationToast } from "./components/NotificationToast";
import logo from "./assets/logo.png";
import { AppProvider } from "./store/AppContext";
import { BottomNav } from "./components/BottomNav";
import ChatsScreen from "./screens/ChatsScreen";
import ChatScreen from "./screens/ChatScreen";
import NewGroupScreen from "./screens/NewGroupScreen";
import RoomsScreen from "./screens/RoomsScreen";
import ServicesScreen from "./screens/ServicesScreen";
import AccountScreen from "./screens/AccountScreen";
import { AdHost } from "./ads/AdHost";
import GroupsScreen from "./screens/GroupsScreen";
import ChannelsScreen from "./screens/ChannelsScreen";
import PayScreen from "./screens/PayScreen";
import AuthScreen from "./screens/AuthScreen";
import { SideList } from "./components/Header";
import { ContactsPrompt } from "./components/ContactsPrompt";
import FriendsScreen from "./screens/FriendsScreen";
import CallsScreen from "./screens/CallsScreen";
import CallScreen from "./screens/CallScreen";
import { useTheme } from "./theme/useTheme";
import ProfileScreen from "./screens/ProfileScreen";
import NotificationsScreen from "./screens/NotificationsScreen";
import SessionsScreen from "./screens/SessionsScreen";
import StarredScreen from "./screens/StarredScreen";
import AdsScreen from "./screens/AdsScreen";
import { Megaphone, ShieldCheck } from "lucide-react";
import { openAdmin, useIsStaff } from "./admin/adminLink";
import SearchScreen from "./screens/SearchScreen";
import { LogoutContext } from "./auth";
import { IncomingCall } from "./rtc/IncomingCall";
import { PushBridge } from "./push/PushBridge";
import { AppBadge } from "./push/AppBadge";
import { API_ON, clearMaintenance, logoutApi, useMaintenance, useSession } from "./api/client";
import { useLang, useT } from "./i18n";

const RAIL = [
  { to: "/", label: ["الدردشات", "Chats"], icon: Cartouche, end: true },
  { to: "/groups", label: ["الجروبات", "Groups"], icon: Pyramids, end: false },
  { to: "/rooms", label: ["الغرف", "Rooms"], icon: Lotus, end: false },
  { to: "/services", label: ["الخدمات", "Services"], icon: Scarab, end: false },
  { to: "/ads", label: ["الإعلانات", "Ads"], icon: Megaphone, end: false },
  { to: "/account", label: ["الحساب", "Account"], icon: Ankh, end: false },
];

function useWide() {
  const q = "(min-width: 900px)";
  const [wide, setWide] = useState(() => typeof matchMedia !== "undefined" && matchMedia(q).matches);
  useEffect(() => {
    const m = matchMedia(q);
    const f = () => setWide(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return wide;
}

/** نسخة الويب (شاشة عريضة): شريط تنقل جانبي + قائمة + لوحة تفاصيل جنب بعض */
function WideShell() {
  const { pathname } = useLocation();
  const t = useT();
  const isStaff = useIsStaff();
  const [adminErr, setAdminErr] = useState(false);
  const listFor = pathname.startsWith("/pay/") ? <ServicesScreen /> :
    pathname.startsWith("/groups") ? <GroupsScreen /> :
    pathname.startsWith("/channels") ? <ChannelsScreen /> :
    pathname.startsWith("/rooms") ? <RoomsScreen /> :
    pathname.startsWith("/ads") ? <AdsScreen /> :
    pathname.startsWith("/services") ? <ServicesScreen /> :
    (pathname.startsWith("/account") || pathname.startsWith("/profile") || pathname.startsWith("/notifications") || pathname.startsWith("/sessions")) ? <AccountScreen /> : <ChatsScreen />;
  return (
    <div className="mx-auto flex h-full w-full max-w-[1180px] bg-rachat-black font-arabic lg:border-x lg:border-rachat-maroon/30">
      <nav className="flex w-[84px] shrink-0 flex-col items-center gap-1 border-e border-rachat-maroon/40 bg-rachat-black py-4">
        <img src={logo} alt={t("رع شات", "Raa Chat")} className="mb-4 h-11 w-11 rounded-xl" />
        {RAIL.map((it) => (
          <NavLink key={it.to} to={it.to} end={it.end}
            className={({ isActive }) => `flex w-[68px] flex-col items-center gap-1 rounded-xl py-2.5 text-[10.5px] font-bold ${isActive ? "bg-rachat-maroon/60 text-rachat-red" : "text-neutral-500 hover:text-rachat-papyrus"}`}>
            <it.icon size={21} /> {t(it.label[0], it.label[1])}
          </NavLink>
        ))}
        {isStaff && (
          <button onClick={async () => { setAdminErr(false); if (!(await openAdmin())) setAdminErr(true); }}
            title={t("فتح لوحة التحكم (دخول مباشر)", "Open the dashboard (direct sign-in)")}
            className="mt-auto flex w-[68px] flex-col items-center gap-1 rounded-xl border border-rachat-gold/40 py-2.5 text-[10.5px] font-bold text-rachat-gold hover:bg-rachat-gold/10">
            <ShieldCheck size={21} /> {adminErr ? t("تعذّر الفتح", "Failed") : t("لوحة التحكم", "Dashboard")}
          </button>
        )}
      </nav>
      <section className="relative w-[390px] shrink-0 overflow-hidden border-e border-rachat-maroon/40"><SideList>{listFor}</SideList></section>
      <section className="relative min-w-0 flex-1 overflow-hidden bg-gradient-to-b from-rachat-card/50 to-rachat-black">
        <Routes>
          <Route path="/chat/:id" element={<ChatScreen />} />
          <Route path="/call/:id" element={<CallScreen />} />
          <Route path="/pay/:key" element={<PayScreen />} />
          <Route path="/new-group" element={<NewGroupScreen />} />
          <Route path="/profile" element={<ProfileScreen />} />
          <Route path="/notifications" element={<NotificationsScreen />} />
          <Route path="/sessions" element={<SessionsScreen />} />
          <Route path="/starred" element={<StarredScreen />} />
          <Route path="/search" element={<SearchScreen />} />
          <Route path="/calls" element={<CallsScreen />} />
          <Route path="/friends" element={<FriendsScreen />} />
          <Route path="*" element={
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <img src={logo} alt="" className="h-24 w-24 rounded-3xl opacity-90 shadow-[0_0_50px_rgba(225,82,62,0.25)]" />
              <h2 className="text-xl font-extrabold">{t("رع شات للويب", "Raa Chat Web")}</h2>
              <p className="max-w-xs text-sm text-neutral-500">{t("اختار محادثة من القايمة عشان تبدأ، أو افتح الخدمات لدفع الفواتير.", "Pick a chat from the list to start, or open Services to pay bills.")}</p>
            </div>} />
        </Routes>
      </section>
    </div>
  );
}

function Shell() {
  const wide = useWide();
  return <>{wide ? <WideShell /> : <MobileShell />}<ContactsPrompt /></>;
}

function MobileShell() {
  const location = useLocation();
  const hideNav = location.pathname.startsWith("/chat/") || location.pathname.startsWith("/call/") || location.pathname.startsWith("/pay/") || location.pathname === "/new-group" || ["/profile", "/notifications", "/sessions", "/search", "/calls", "/friends"].includes(location.pathname);

  return (
    <div className="mx-auto flex h-full w-full max-w-[420px] flex-col bg-rachat-black font-arabic">
      <div className="relative flex-1 overflow-hidden">
        <Routes>
          <Route path="/" element={<ChatsScreen />} />
          <Route path="/chat/:id" element={<ChatScreen />} />
          <Route path="/call/:id" element={<CallScreen />} />
          <Route path="/pay/:key" element={<PayScreen />} />
          <Route path="/new-group" element={<NewGroupScreen />} />
          <Route path="/groups" element={<GroupsScreen />} />
          <Route path="/channels" element={<ChannelsScreen />} />
          <Route path="/rooms" element={<RoomsScreen />} />
          <Route path="/services" element={<ServicesScreen />} />
          <Route path="/account" element={<AccountScreen />} />
          <Route path="/profile" element={<ProfileScreen />} />
          <Route path="/notifications" element={<NotificationsScreen />} />
          <Route path="/sessions" element={<SessionsScreen />} />
          <Route path="/starred" element={<StarredScreen />} />
          <Route path="/search" element={<SearchScreen />} />
          <Route path="/calls" element={<CallsScreen />} />
          <Route path="/friends" element={<FriendsScreen />} />
          <Route path="/ads" element={<AdsScreen />} />
        </Routes>
      </div>
      {!hideNav && <BottomNav />}
    </div>
  );
}

export default function App() {
  const [demoAuthed, setAuthed] = useState(false);
  const session = useSession();
  const maint = useMaintenance();
  const authed = API_ON ? !!session : demoAuthed;
  const theme = useTheme();
  const lang = useLang();
  const dir = lang === "ar" ? "rtl" : "ltr";
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    document.title = lang === "ar" ? "رع شات" : "Raa Chat";
  }, [lang, dir]);
  return (
    // key={lang}: بيعيد تحميل بيانات الديمو باللغة الجديدة (مع باك إند حقيقي مش محتاجة)
    <AppProvider key={API_ON ? "api" : lang}>
      <LogoutContext.Provider value={() => { if (API_ON) void logoutApi(); else setAuthed(false); }}>
      <div data-rc-theme={theme} dir={dir} lang={lang} className="h-full bg-rachat-black text-rachat-papyrus">
        {maint && (
          <div role="alert" className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-4 bg-rachat-black px-8 text-center">
            <img src={logo} alt="" className="h-20 w-20 rounded-2xl" />
            <h1 className="text-xl font-extrabold text-rachat-gold">{lang === "ar" ? "التطبيق في صيانة" : "Under maintenance"}</h1>
            <p className="max-w-xs text-sm text-rachat-papyrus">{maint}</p>
            <button onClick={() => { clearMaintenance(); location.reload(); }} className="rounded-full bg-rachat-red px-5 py-2 text-sm font-bold text-white">{lang === "ar" ? "إعادة المحاولة" : "Try again"}</button>
          </div>
        )}
        {authed && <AppBadge />}
        {authed && <AdHost />}
        {authed && <NotificationToast />}
        {authed && API_ON && <IncomingCall />}
        {authed && API_ON && <PushBridge />}
        {authed ? <Shell /> : (
          <div className="mx-auto h-full w-full max-w-[460px] bg-rachat-black font-arabic">
            <AuthScreen onDone={() => setAuthed(true)} />
          </div>
        )}
      </div>
      </LogoutContext.Provider>
    </AppProvider>
  );
}

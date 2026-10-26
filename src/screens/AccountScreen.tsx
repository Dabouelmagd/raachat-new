import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useIsStaff, openAdmin } from "../admin/adminLink";
import { DeleteAccountSheet } from "../components/DeleteAccountSheet";
import { WallpaperSheet } from "../components/WallpaperSheet";
import { BlockedUsersSheet } from "../components/BlockedUsersSheet";
import { PasswordSheet } from "../components/PasswordSheet";
import { LEGAL } from "../legal";
import { ShieldCheck, ChevronLeft, ChevronRight, Bell, LogOut, Trash2, Download, KeyRound, Star } from "lucide-react";
import { API_ON, api } from "../api/client";
import { LangSwitch } from "../components/LangSwitch";
import { useDir, useT } from "../i18n";
import { Ankh } from "../components/PharaohIcons";
import { useProfile } from "../store/profile";
import { useLogout } from "../auth";
import { AdSchedulePanel } from "../ads/AdSchedulePanel";
import { Header } from "../components/Header";
import { setTheme, useTheme } from "../theme/useTheme";

interface ToggleRowProps {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ label, value, onChange }: ToggleRowProps) {
  return (
    <div className="mb-2 flex items-center justify-between rounded-xl bg-rachat-card px-3.5 py-3">
      <span className="flex-1 text-xs text-rachat-papyrus">{label}</span>
      <button
        onClick={() => onChange(!value)}
        className={`relative h-6 w-11 rounded-full transition-colors ${
          value ? "bg-gradient-to-br from-rachat-red to-rachat-coral" : "bg-neutral-500/60"
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-rachat-cream transition-all ${
            value ? "right-0.5" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

export default function AccountScreen() {
  const isStaff = useIsStaff();
  const [adminErr, setAdminErr] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const downloadMyData = async () => {
    setExporting(true);
    try {
      const data = API_ON ? await api<unknown>("/me/export") : { notice: "نسخة تجريبية من بيانات الحساب المحلية", profile: p };
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a"); a.href = url; a.download = "rachat-my-data.json"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch { /* الشبكة: نسيب المستخدم يعيد المحاولة */ }
    setExporting(false);
  };
  const [wpOpen, setWpOpen] = useState(false);
  const theme = useTheme();
  const t = useT();
  const Chev = useDir() === "rtl" ? ChevronLeft : ChevronRight;
  const nav = useNavigate();
  const p = useProfile();
  const logout = useLogout();

  return (
    <div className="flex h-full flex-col">
      <Header title={t("الحساب", "Account")} />
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {isStaff && (
          <button onClick={async () => { setAdminErr(false); if (!(await openAdmin())) setAdminErr(true); }}
            className="mb-3 flex w-full items-center gap-3 rounded-2xl border border-rachat-gold/40 bg-rachat-card p-3.5 text-start">
            <ShieldCheck size={22} className="text-rachat-gold" />
            <div className="min-w-0 flex-1">
              <div className="font-extrabold text-rachat-papyrus">{t("لوحة التحكم", "Dashboard")}</div>
              <div className="text-[11px] text-neutral-500">{adminErr ? t("تعذّر الفتح، حاول مرة أخرى", "Couldn't open, try again") : t("دخول مباشر دون تسجيل مرة أخرى", "Direct sign-in, no second login")}</div>
            </div>
            <Chev size={18} className="text-neutral-500" />
          </button>
        )}
        <button onClick={() => nav("/profile")} className="mb-5 flex w-full items-center gap-3 rounded-2xl bg-rachat-card p-3.5 text-start">
          {p.photo ? (
            <img src={p.photo} alt="" className="h-[52px] w-[52px] rounded-full object-cover" />
          ) : (
            <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full text-lg font-extrabold text-white" style={{ background: p.color }}>
              {p.name.charAt(0)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="font-extrabold text-rachat-papyrus">{p.name}</div>
            <div className="truncate text-[11px] text-neutral-500">{p.status}</div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-emerald-400">
              {/* 🔴 كانت «محمي · تشفير مفعّل» — ودي بتتقرا «رسائلك مشفّرة من طرف إلى طرف»،
                  والسياسة المنشورة تقول العكس صريح: «المحادثات ليست مشفّرة من طرف إلى طرف؛
                  لذلك لا تشارك بيانات شديدة الحساسية فيها». فالنصّ بقى **بحرف السياسة**:
                  اللي مشفَّر هو الاتصال بالخادم (TLS)، والمحادثات نفسها لأ. */}
              <ShieldCheck size={13} /> {t("الاتصال بالخادم مشفّر (TLS)", "Connection to server encrypted (TLS)")}
            </div>
          </div>
          <Ankh size={19} className="text-rachat-gold" />
        </button>

        <p className="mb-2 mt-4 text-[11px] font-bold text-neutral-500">{t("اللغة", "Language")}</p>
        <div className="mb-2 flex items-center justify-between rounded-xl bg-rachat-card px-3.5 py-2.5">
          <span className="text-xs text-rachat-papyrus">{t("لغة التطبيق", "App language")}</span>
          <LangSwitch />
        </div>

        <p className="mb-2 mt-4 text-[11px] font-bold text-neutral-500">{t("الخصوصية", "Privacy")}</p>
        {/* 🔴 كان هنا ثلاثة مفاتيح **كلها `useState` محدش بيقراها** — لا الواجهة ولا الخادم،
            ومفيش حقل خصوصية واحد في `User` في المخطّط. واتنين منها كانا يوعدان بما لا يحدث:
            «حظر لقطة الشاشة في الدردشات السرية» (مفتوح افتراضيًّا — و«الدردشات السرية» نوع
            غير موجود أصلًا، وحظر لقطة الشاشة مستحيل في الويب)، و«السماح لأي شخص بإضافتي
            لمجموعات» (مقفول افتراضيًّا — والخادم يسمح لأي مشرف بإضافة أي حساب).
            والمفتاح الميت الذي يطمئن المستخدم أسوأ من غيابه. فحلّ محلّها ما هو **صحيح
            فعلًا**: الرقم لا يخرج من الخادم لأي مستخدم (`publicUser` لا يضمّه)، والمحادثات
            ليست مشفّرة من طرف إلى طرف — بحرف السياسة المنشورة. */}
        <div className="mb-2 rounded-xl bg-rachat-card px-3.5 py-3">
          <p className="text-xs text-rachat-papyrus">{t("رقم هاتفك لا يظهر لأي مستخدم آخر", "Your phone number is not shown to any other user")}</p>
          <p className="mt-1 text-[11px] leading-5 text-neutral-400">
            {t("المحادثات ليست مشفّرة من طرف إلى طرف؛ لذلك لا تشارك بيانات شديدة الحساسية فيها. والاتصال بين التطبيق والخادم مشفّر (TLS).", "Conversations are not end-to-end encrypted, so do not share highly sensitive data in them. The connection between the app and the server is encrypted (TLS).")}
          </p>
        </div>
        <ToggleRow label={t("الوضع الفاتح", "Light mode")} value={theme === "light"} onChange={(v) => setTheme(v ? "light" : "dark")} />

        <p className="mb-2 mt-4 text-[11px] font-bold text-neutral-500">{t("الأمان", "Security")}</p>
        <button onClick={() => nav("/friends")} className="mb-2 flex w-full items-center justify-between rounded-xl bg-rachat-card px-3.5 py-3 text-xs text-rachat-papyrus">
          {t("الأصدقاء ودعوة أصدقاء", "Friends & invite")}
          <Chev size={15} className="text-neutral-500" />
        </button>
        <button onClick={() => nav("/starred")} className="mb-2 flex w-full items-center justify-between rounded-xl bg-rachat-card px-3.5 py-3 text-xs text-rachat-papyrus">
          <span className="flex items-center gap-2"><Star size={15} className="text-rachat-gold" /> {t("الرسائل المميّزة", "Starred messages")}</span>
          <Chev size={15} className="text-neutral-500" />
        </button>
        <button onClick={() => setPwOpen(true)} className="mb-2 flex w-full items-center justify-between rounded-xl bg-rachat-card px-3.5 py-3 text-xs text-rachat-papyrus">
          <span className="flex items-center gap-2"><KeyRound size={15} className="text-rachat-gold" /> {t("كلمة السر", "Password")}</span>
          <Chev size={15} className="text-neutral-500" />
        </button>
        <button onClick={() => nav("/sessions")} className="mb-2 flex w-full items-center justify-between rounded-xl bg-rachat-card px-3.5 py-3 text-xs text-rachat-papyrus">
          {t("الجلسات النشطة", "Active sessions")}
          <Chev size={15} className="text-neutral-500" />
        </button>
        <button onClick={() => nav("/notifications")} className="mb-2 flex w-full items-center justify-between rounded-xl bg-rachat-card px-3.5 py-3 text-xs text-rachat-papyrus">
          <span className="flex items-center gap-2"><Bell size={15} className="text-rachat-red" /> {t("الإشعارات", "Notifications")}</span>
          <Chev size={15} className="text-neutral-500" />
        </button>

        <button onClick={() => setWpOpen(true)} className="mb-2 flex w-full items-center justify-between rounded-xl bg-rachat-card px-3.5 py-3 text-xs text-rachat-papyrus">
          {t("خلفية المحادثة", "Chat wallpaper")}
          <Chev size={15} className="text-neutral-500" />
        </button>
        <button onClick={() => setBlockedOpen(true)} className="mb-2 flex w-full items-center justify-between rounded-xl bg-rachat-card px-3.5 py-3 text-xs text-rachat-papyrus">
          {t("المحظورون", "Blocked users")}
          <Chev size={15} className="text-neutral-500" />
        </button>

        <p className="mb-2 mt-4 text-[11px] font-bold text-neutral-500">{t("الإعلانات (معاينة المراجعة)", "Ads (review preview)")}</p>
        <AdSchedulePanel />

        <button onClick={downloadMyData} disabled={exporting} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-rachat-card py-3 text-sm font-bold text-rachat-papyrus disabled:opacity-60">
          <Download size={16} /> {exporting ? t("جاري التحضير…", "Preparing…") : t("تنزيل نسخة من بياناتي", "Download my data")}
        </button>
        <button onClick={logout} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-rachat-red/60 py-3 text-sm font-bold text-rachat-red">
          <LogOut size={16} /> {t("تسجيل الخروج", "Log out")}
        </button>
        <button onClick={() => setDeleting(true)} className="mt-3 flex w-full items-center justify-center gap-2 py-2.5 text-xs text-neutral-400 underline-offset-2 hover:text-rachat-red hover:underline">
          <Trash2 size={14} /> {t("حذف الحساب نهائيًا", "Delete my account")}
        </button>
        <p className="mt-4 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-neutral-500">
          <a href={LEGAL.privacy} target="_blank" rel="noreferrer" className="underline">{t("سياسة الخصوصية", "Privacy")}</a>
          <a href={LEGAL.terms} target="_blank" rel="noreferrer" className="underline">{t("الشروط", "Terms")}</a>
          <a href={LEGAL.community} target="_blank" rel="noreferrer" className="underline">{t("معايير المجتمع", "Community")}</a>
          {/* 🔴 دي كانت الصفحة الوحيدة اللي مفيش منها أي طريق جوه التطبيق — وهي اللي
              فيها الحقوق اللي مش منفَّذة في الشاشة (الاعتراض · تقييد المعالجة · الشكوى
              لمركز حماية البيانات · مسؤول حماية البيانات)، ودي مطلوبة في ١٥١/٢٠٢٠.
              والصفحة نفسها بتقول «التطبيق ← الحساب ← …» فالرابط كان في اتجاه واحد.
              واللافتة هي **عنوان الصفحة المنشور نفسه**، فمفيش كلام جديد للعملاء. */}
          <a href={LEGAL.dataRequests} target="_blank" rel="noreferrer" className="underline">{t("طلبات البيانات", "Data requests")}</a>
        </p>
        {wpOpen && <WallpaperSheet onClose={() => setWpOpen(false)} />}
        {blockedOpen && <BlockedUsersSheet onClose={() => setBlockedOpen(false)} />}
        {pwOpen && <PasswordSheet onClose={() => setPwOpen(false)} />}
        {deleting && <DeleteAccountSheet onClose={() => setDeleting(false)} />}
      </div>
    </div>
  );
}

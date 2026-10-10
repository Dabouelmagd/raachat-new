import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useIsStaff, openAdmin } from "../admin/adminLink";
import { DeleteAccountSheet } from "../components/DeleteAccountSheet";
import { WallpaperSheet } from "../components/WallpaperSheet";
import { BlockedUsersSheet } from "../components/BlockedUsersSheet";
import { LEGAL } from "../legal";
import { ShieldCheck, ChevronLeft, ChevronRight, Bell, LogOut, Trash2, Download } from "lucide-react";
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
  const [hidePhone, setHidePhone] = useState(true);
  const [blockShots, setBlockShots] = useState(true);
  const [addByAll, setAddByAll] = useState(false);
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
              <div className="text-[11px] text-neutral-500">{adminErr ? t("تعذّر الفتح، جرّبي تاني", "Couldn't open, try again") : t("دخول مباشر بدون تسجيل تاني", "Direct sign-in, no second login")}</div>
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
              <ShieldCheck size={13} /> {t("محمي · تشفير مفعّل", "Protected · encryption on")}
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
        <ToggleRow label={t("إخفاء رقم الهاتف عن غير جهات الاتصال", "Hide my phone number from non-contacts")} value={hidePhone} onChange={setHidePhone} />
        <ToggleRow label={t("حظر لقطة الشاشة في الدردشات السرية", "Block screenshots in secret chats")} value={blockShots} onChange={setBlockShots} />
        <ToggleRow label={t("السماح لأي شخص بإضافتي لمجموعات", "Let anyone add me to groups")} value={addByAll} onChange={setAddByAll} />
        <ToggleRow label={t("الوضع الفاتح", "Light mode")} value={theme === "light"} onChange={(v) => setTheme(v ? "light" : "dark")} />

        <p className="mb-2 mt-4 text-[11px] font-bold text-neutral-500">{t("الأمان", "Security")}</p>
        <button onClick={() => nav("/friends")} className="mb-2 flex w-full items-center justify-between rounded-xl bg-rachat-card px-3.5 py-3 text-xs text-rachat-papyrus">
          {t("الأصدقاء ودعوة أصدقاء", "Friends & invite")}
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
          {t("خلفية الشات", "Chat wallpaper")}
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
        </p>
        {wpOpen && <WallpaperSheet onClose={() => setWpOpen(false)} />}
        {blockedOpen && <BlockedUsersSheet onClose={() => setBlockedOpen(false)} />}
        {deleting && <DeleteAccountSheet onClose={() => setDeleting(false)} />}
      </div>
    </div>
  );
}

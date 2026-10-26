import { useEffect, useState } from "react";
import { Check, Play, Square } from "lucide-react";
import { Header } from "../components/Header";
import { playSound, RINGTONES, setRingtone, setSoundEnabled, setVibrationEnabled, useVibrationEnabled, vibrationSupported, startRingtone, stopRingtone, useRingtone, useSoundEnabled, type RingId } from "../sound/sounds";
import { useT, useLang } from "../i18n";
import { notify } from "../sound/notify";
import { disablePush, enablePush, usePushState } from "../push/push";

function Row({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-3 rounded-xl bg-rachat-card px-3.5 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-rachat-papyrus">{label}</div>
        {hint && <div className="mt-0.5 text-[10.5px] text-neutral-500">{hint}</div>}
      </div>
      <button role="switch" aria-checked={value} aria-label={label} onClick={() => onChange(!value)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${value ? "bg-gradient-to-br from-rachat-red to-rachat-coral" : "bg-neutral-500/60"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-rachat-cream transition-all ${value ? "right-0.5" : "left-0.5"}`} />
      </button>
    </div>
  );
}

export default function NotificationsScreen() {
  const t = useT();
  const [pushState, setPushState] = usePushState();
  const lang = useLang();
  const [msgs, setMsgs] = useState(true);
  const [groups, setGroups] = useState(true);
  const [calls, setCalls] = useState(true);
  const [rooms, setRooms] = useState(false);
  const [wallet, setWallet] = useState(true);
  const [offers, setOffers] = useState(false);
  const [preview, setPreview] = useState(true);
  const sound = useSoundEnabled();
  const vib = useVibrationEnabled();
  const ring = useRingtone();
  const [playing, setPlaying] = useState<RingId | null>(null);

  useEffect(() => () => stopRingtone(), []);
  const togglePreview = (id: RingId) => {
    if (playing === id) { stopRingtone(); setPlaying(null); return; }
    startRingtone(true, id);
    setPlaying(id);
    setTimeout(() => { setPlaying((p) => { if (p === id) stopRingtone(); return p === id ? null : p; }); }, 7500);
  };

  return (
    <div className="flex h-full flex-col">
      <Header title={t("الإشعارات", "Notifications")} showBack />
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {pushState !== "unsupported" && (
          <>
            <p className="mb-2 mt-3 text-[11px] font-bold text-neutral-500">{t("إشعارات الجهاز", "Device notifications")}</p>
            <Row
              label={t("إشعارات المكالمات والرسائل وأنت خارج التطبيق", "Calls & messages when the app is closed")}
              hint={pushState === "denied" ? t("المتصفح يرفض الإشعارات — فعِّلها من إعدادات الموقع", "Notifications are blocked — enable them in site settings")
                : pushState === "unavailable" ? t("الخادم لم يُفعّل الإشعارات", "The server has notifications turned off")
                : t("يصلك إشعار حتى لو كان التطبيق مغلقًا. على iPhone: أضِف التطبيق إلى الشاشة الرئيسية أولًا", "You get alerts even when the app is closed. On iPhone: add the app to your Home Screen first")}
              value={pushState === "on"}
              onChange={(v) => { void (v ? enablePush() : disablePush()).then(setPushState); }}
            />
          </>
        )}
        <p className="mb-2 mt-3 text-[11px] font-bold text-neutral-500">{t("الأصوات الفرعونية", "Pharaonic sounds")}</p>
        <Row label={t("تشغيل أصوات التطبيق", "App sounds")} hint={t("على مقام الحجاز بآلة وترية وطبلة", "In maqam Hijaz, with a string instrument and drum")} value={sound} onChange={setSoundEnabled} />
        <Row
          label={t("الاهتزاز", "Vibration")}
          hint={vibrationSupported() ? t("اهتزاز مع الرسائل والإشعارات والمكالمات، ولكل رنّة نمط مختلف", "Vibrates for messages, notifications and calls, with a different pattern per ringtone") : t("جهازك أو متصفحك لا يدعم الاهتزاز (يعمل على أندرويد)", "Your device or browser doesn't support vibration (works on Android)")}
          value={vib}
          onChange={setVibrationEnabled}
        />
        <div className="mb-2 grid grid-cols-2 gap-2">
          <button onClick={() => playSound("message", true)} className="flex items-center justify-center gap-2 rounded-xl bg-rachat-card py-3 text-[11px] font-bold text-rachat-papyrus">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-rachat-gold text-rachat-ink"><Play size={13} fill="currentColor" /></span>
            {t("نغمة الرسالة", "Message tone")}
          </button>
          <button onClick={() => notify(t("إشعار تجريبي", "Test notification"), t("هكذا يظهر إشعار رع شات", "This is how a Raa Chat رع شات notification looks"), true)} className="flex items-center justify-center gap-2 rounded-xl bg-rachat-card py-3 text-[11px] font-bold text-rachat-papyrus">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-rachat-coral text-white"><Play size={13} fill="currentColor" /></span>
            {t("نغمة الإشعار", "Notification tone")}
          </button>
        </div>

        <p className="mb-2 mt-4 text-[11px] font-bold text-neutral-500">{t("رنّة المكالمة · اختر واحدة", "Call ringtone · pick one")}</p>
        <div role="radiogroup" aria-label={t("رنّة المكالمة", "Call ringtone")} className="mb-2">
          {RINGTONES.map((r) => {
            const on = ring === r.id;
            const rLabel = lang === "ar" ? r.label : r.labelEn;
            const rDesc = lang === "ar" ? r.desc : r.descEn;
            return (
              <div key={r.id} className={`mb-2 flex items-center gap-3 rounded-xl bg-rachat-card px-3 py-2.5 ${on ? "ring-1 ring-rachat-red" : ""}`}>
                <button
                  role="radio"
                  aria-checked={on}
                  aria-label={t(`اختيار رنة ${r.label}`, `Select ringtone ${r.labelEn}`)}
                  onClick={() => { setRingtone(r.id); }}
                  className="flex min-w-0 flex-1 items-center gap-3 text-start"
                >
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${on ? "border-rachat-red bg-rachat-red text-white" : "border-neutral-500"}`}>
                    {on && <Check size={11} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-bold text-rachat-papyrus">{rLabel}</span>
                    <span className="block truncate text-[10.5px] text-neutral-500">{rDesc}</span>
                  </span>
                </button>
                <button
                  onClick={() => togglePreview(r.id)}
                  aria-label={playing === r.id ? t(`إيقاف ${r.label}`, `Stop ${r.labelEn}`) : t(`تشغيل ${r.label}`, `Play ${r.labelEn}`)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rachat-maroon/50 text-rachat-red"
                >
                  {playing === r.id ? <Square size={13} fill="currentColor" /> : <Play size={14} fill="currentColor" />}
                </button>
              </div>
            );
          })}
        </div>

        <p className="mb-2 mt-4 text-[11px] font-bold text-neutral-500">{t("الدردشة", "Chat")}</p>
        <Row label={t("رسائل المحادثات", "Chat messages")} value={msgs} onChange={setMsgs} />
        <Row label={t("رسائل المجموعات", "Group messages")} value={groups} onChange={setGroups} />
        <Row label={t("المكالمات", "Calls")} value={calls} onChange={setCalls} />
        <Row label={t("إظهار نص الرسالة في الإشعار", "Show message text in notifications")} hint={t("إن أوقفته سيظهر «رسالة جديدة» فقط", "If off, only \"New message\" is shown")} value={preview} onChange={setPreview} />

        <p className="mb-2 mt-4 text-[11px] font-bold text-neutral-500">{t("الغرف والخدمات", "Rooms & services")}</p>
        <Row label={t("الغرف الصوتية التي تتابعها", "Voice rooms you follow")} value={rooms} onChange={setRooms} />
        <Row label={t("عمليات المحفظة والفواتير", "Wallet & billing activity")} value={wallet} onChange={setWallet} />
        <Row label={t("العروض والخصومات", "Offers & discounts")} value={offers} onChange={setOffers} />
      </div>
    </div>
  );
}

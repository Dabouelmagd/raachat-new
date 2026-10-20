import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, MessageSquareShare, Share2, UserPlus, ShieldCheck } from "lucide-react";
import { Header } from "../components/Header";
import { useT } from "../i18n";
import { API_ON } from "../api/client";
import { LEGAL, inviteUrl } from "../legal";
import { useAppActions } from "../store/AppContext";
import { canReadContacts, consentGiven, matchContacts, readDeviceContacts, setConsent, type Friend } from "../contacts/device";

export default function FriendsScreen() {
  const t = useT();
  const nav = useNavigate();
  const { createDm } = useAppActions();
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [err, setErr] = useState("");
  const [onApp, setOnApp] = useState<Friend[]>([]);
  const [notOn, setNotOn] = useState<{ phone: string; name: string }[]>([]);
  const [q, setQ] = useState("");

  const sync = async () => {
    setState("loading"); setErr("");
    try {
      const list = await readDeviceContacts();
      const r = await matchContacts(list);
      setOnApp(r.onApp.map((f) => ({ ...f, name: r.byPhone.get(f.contactPhone) ?? f.name })));
      setNotOn(r.notOnApp.map((p) => ({ phone: p, name: r.byPhone.get(p) ?? p })));
      setState("done");
    } catch (e) {
      setErr((e as Error).message === "denied" ? t("مفيش صلاحية لجهات الاتصال. فعّليها من إعدادات الجهاز.", "Contacts permission denied. Enable it in device settings.")
        : t("جهازك أو متصفحك مش بيسمح بقراءة جهات الاتصال. افتحي التطبيق على الموبايل، أو ادعي أصدقاءك بالرابط.", "This device/browser can't read contacts. Use the mobile app, or invite friends with the link."));
      setState("error");
    }
  };
  useEffect(() => { if (consentGiven()) void sync(); /* eslint-disable-next-line */ }, []);

  // 🔴 الرابط بيتبعت لناس برّه التطبيق، فلو مفيش أصل عام بنبعت الدعوة **بلا
  // رابط** بدل ما نبعت `https://localhost` اللي مستحيل يفتح عند حد.
  const url = inviteUrl();
  const msg = url
    ? t(`جرّب رع شات! دردشة ومكالمات وغرف صوتية بهوية مصرية: ${url}`, `Try Raa Chat! Chat, calls and voice rooms: ${url}`)
    : t("جرّب رع شات! دردشة ومكالمات وغرف صوتية بهوية مصرية.", "Try Raa Chat! Chat, calls and voice rooms.");
  const share = async (phone?: string) => {
    if (!phone && navigator.share) { try { await navigator.share(url ? { text: msg, url } : { text: msg }); return; } catch { return; } }
    if (phone) location.href = `sms:${phone}?&body=${encodeURIComponent(msg)}`;
    else location.href = `https://wa.me/?text=${encodeURIComponent(msg)}`;
  };
  const wa = (phone: string) => window.open(`https://wa.me/${phone.replace(/^\+/, "").replace(/^0/, "20")}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
  const chat = async (f: Friend) => { const id = await createDm(f.id); nav(API_ON ? `/chat/${id}` : "/"); };
  const match = (n: string) => !q || n.includes(q);

  return (
    <div className="flex h-full flex-col bg-rachat-black">
      <Header title={t("الأصدقاء", "Friends")} />
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {state === "idle" && !consentGiven() && (
          <div className="mt-2 rounded-2xl bg-rachat-card p-4">
            <div className="mb-2 flex items-center gap-2 text-rachat-gold"><ShieldCheck size={18} /><b className="text-sm">{t("اعرفي مين من أصدقائك على رع شات", "Find friends on Raa Chat")}</b></div>
            <p className="text-xs leading-6 text-neutral-400">{t("هنقرا الأسماء والأرقام المحفوظة على تليفونك ونطابقها بالمسجّلين عشان نوريكي مين عنده التطبيق ومين لأ. الأرقام بتتبعت مرة واحدة للمطابقة بس ومش بنخزّنها على السيرفر، وتقدري توقفي ده في أي وقت.",
              "We read the names and numbers on your phone and match them against registered users to show who has the app. Numbers are sent once for matching and are not stored on our servers. You can stop this any time.")} <a className="text-rachat-gold underline" href={LEGAL.privacy} target="_blank" rel="noreferrer">{t("سياسة الخصوصية", "Privacy policy")}</a></p>
            <button onClick={() => { setConsent(true); void sync(); }} className="mt-3 w-full rounded-xl bg-rachat-red py-2.5 text-sm font-bold text-white">{t("موافقة ومزامنة جهات الاتصال", "Allow and sync contacts")}</button>
            <button onClick={() => share()} className="mt-2 w-full rounded-xl bg-rachat-black py-2.5 text-xs text-neutral-300">{t("لا، هدعو أصدقائي بالرابط", "No thanks, invite with a link")}</button>
          </div>
        )}
        {state === "loading" && <p className="mt-8 text-center text-xs text-neutral-500">{t("بنطابق جهات الاتصال…", "Matching contacts…")}</p>}
        {state === "error" && <p className="mt-4 rounded-xl bg-rachat-card p-3 text-xs text-rachat-coral">{err}</p>}
        {state === "done" && (
          <>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("بحث في جهات الاتصال", "Search contacts")} className="mb-3 mt-2 w-full rounded-xl bg-rachat-card px-3.5 py-2.5 text-xs text-rachat-papyrus outline-none" />
            <p className="mb-2 text-[11px] font-bold text-neutral-500">{t(`على رع شات (${onApp.length})`, `On Raa Chat (${onApp.length})`)}</p>
            <div className="space-y-2">
              {onApp.filter((f) => match(f.name)).map((f) => (
                <div key={f.id} className="flex items-center gap-3 rounded-xl bg-rachat-card px-3.5 py-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rachat-gold/20 font-bold text-rachat-gold">{f.name.slice(0, 1)}</div>
                  <span className="flex-1 truncate text-sm text-rachat-papyrus">{f.name}</span>
                  <button onClick={() => chat(f)} className="flex items-center gap-1 rounded-lg bg-rachat-red px-3 py-1.5 text-[11px] font-bold text-white"><MessageCircle size={13} />{t("دردشة", "Chat")}</button>
                </div>
              ))}
              {!onApp.length && <p className="rounded-xl bg-rachat-card p-3 text-xs text-neutral-500">{t("لسه محدش من جهات اتصالك على التطبيق. ادعيهم من تحت 👇", "None of your contacts are on the app yet. Invite them below 👇")}</p>}
            </div>
            <p className="mb-2 mt-5 text-[11px] font-bold text-neutral-500">{t(`ادعي للانضمام (${notOn.length})`, `Invite (${notOn.length})`)}</p>
            <div className="space-y-2">
              {notOn.filter((f) => match(f.name)).slice(0, 200).map((f) => (
                <div key={f.phone} className="flex items-center gap-2 rounded-xl bg-rachat-card px-3.5 py-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-700 text-sm font-bold text-neutral-300">{f.name.slice(0, 1)}</div>
                  <span className="min-w-0 flex-1 truncate text-sm text-rachat-papyrus">{f.name}</span>
                  <button aria-label="SMS" onClick={() => share(f.phone)} className="p-1.5 text-rachat-coral"><MessageSquareShare size={16} /></button>
                  <button onClick={() => wa(f.phone)} className="rounded-lg bg-rachat-black px-2.5 py-1.5 text-[11px] font-bold text-rachat-gold">{t("واتساب", "WhatsApp")}</button>
                </div>
              ))}
            </div>
          </>
        )}
        <button onClick={() => share()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-rachat-gold/40 py-3 text-sm font-bold text-rachat-gold"><Share2 size={16} />{t("شاركي رابط الدعوة", "Share invite link")}</button>
        {consentGiven() && <button onClick={() => { setConsent(false); setState("idle"); setOnApp([]); setNotOn([]); }} className="mt-3 w-full text-center text-[11px] text-neutral-500 underline">{t("إيقاف مزامنة جهات الاتصال", "Stop contact sync")}</button>}
        {!canReadContacts() && API_ON && <p className="mt-3 flex items-center gap-1 text-[10.5px] text-neutral-600"><UserPlus size={12} />{t("قراءة جهات الاتصال متاحة في تطبيق الموبايل.", "Contact sync is available in the mobile app.")}</p>}
      </div>
    </div>
  );
}

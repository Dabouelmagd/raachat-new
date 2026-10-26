import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Megaphone, Plus, Users } from "lucide-react";
import { API_ON } from "../api/client";
import { Header } from "../components/Header";
import { useAppActions, useAppState } from "../store/AppContext";
import { DEMO_CHANNELS } from "../store/seed";
import type { Thread } from "../types";
import { loc, useT, num } from "../i18n";
import { threadNameClass, UnreadBadge } from "../components/unread";

/**
 * القنوات: قنواتي + اكتشاف + إنشاء.
 *
 * القناة **بث مش جروب** — المالك والمشرفين بينشروا، والمشترك بيقرا ويتفاعل،
 * و**المشتركين مابيشوفوش بعض** (العدد بس، والسيرفر مابيبعتش أسماءهم أصلًا).
 */
export default function ChannelsScreen() {
  const navigate = useNavigate();
  const t = useT();
  const { threads } = useAppState();
  const { createChannel, listChannels, subscribeChannel } = useAppActions();
  const [remote, setRemote] = useState<Thread[] | null>(null);
  const [making, setMaking] = useState(false);
  const [name, setName] = useState("");
  const [about, setAbout] = useState("");
  const [err, setErr] = useState("");

  const mine = threads.filter((x) => x.type === "channel");
  useEffect(() => { if (API_ON) void listChannels().then(setRemote).catch(() => {}); }, [threads.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const discover = API_ON
    ? (remote ?? []).filter((c) => !mine.some((m) => m.id === c.id)).map((c) => ({ id: c.id, name: c.name, about: c.about ?? "", members: c.memberCount ?? 0, initial: c.initial, colorClass: c.colorClass }))
    : DEMO_CHANNELS.filter((c) => !mine.some((m) => m.id === c.id));

  const create = async () => {
    if (!name.trim()) return;
    setErr("");
    try {
      const id = await createChannel(name.trim(), about.trim() || undefined);
      setMaking(false); setName(""); setAbout("");
      if (typeof id === "string") navigate(`/chat/${id}`);
    } catch (e) {
      setErr((e as Error).message || t("لم تُنشَأ القناة، حاول مرة أخرى", "Channel not created, try again"));
    }
  };

  return (
    <div className="flex h-full flex-col">
      <Header title={t("القنوات", "Channels")} right={<button aria-label={t("قناة جديدة", "New channel")} onClick={() => setMaking((v) => !v)}><Plus size={22} /></button>} />
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {making && (
          <div className="mb-3 mt-2 space-y-2 rounded-2xl bg-rachat-card p-3">
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} dir="auto" aria-label={t("اسم القناة", "Channel name")} placeholder={t("اسم القناة", "Channel name")} className="w-full rounded-xl bg-rachat-black px-3 py-2.5 text-rachat-papyrus outline-none placeholder:text-neutral-600" />
            <input value={about} onChange={(e) => setAbout(e.target.value)} maxLength={300} dir="auto" aria-label={t("وصف القناة", "Channel description")} placeholder={t("وصف قصير (اختياري)", "Short description (optional)")} className="w-full rounded-xl bg-rachat-black px-3 py-2.5 text-sm text-rachat-papyrus outline-none placeholder:text-neutral-600" />
            {err && <p role="alert" className="break-words text-xs text-rachat-coral">{err}</p>}
            <button onClick={() => void create()} disabled={!name.trim()} className="w-full rounded-xl bg-rachat-red py-2.5 text-sm font-extrabold text-white disabled:opacity-40">
              {t("أنشئ القناة", "Create channel")}
            </button>
            <p className="text-[10.5px] leading-4 text-neutral-500">{t("في القناة أنت مَن ينشر، والمشتركون يقرؤون ويتفاعلون فقط — ولا يرى أحدهم الآخر.", "In a channel you post; subscribers read and react only — and can't see each other.")}</p>
          </div>
        )}

        <h2 className="mb-2 mt-1 text-sm font-extrabold">{t("قنواتي", "My channels")}</h2>
        <div className="space-y-2">
          {mine.map((c) => (
            <button key={c.id} onClick={() => navigate(`/chat/${c.id}`)} className="flex w-full items-center gap-3 rounded-2xl bg-rachat-card p-3 text-start">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-extrabold text-rachat-ink ${c.colorClass}`}>{c.initial}</span>
              <div className="min-w-0 flex-1">
                <div className={threadNameClass(c.unread)} dir="auto">{c.name}</div>
                <div className="flex items-center gap-1 text-[11px] text-neutral-500">
                  <Users size={11} /> {num(c.memberCount ?? 0)} {t("مشترك", "subscribers")}
                  {c.canPost && <span className="text-rachat-gold">· {t("تنشر فيها", "you post here")}</span>}
                </div>
              </div>
              <UnreadBadge count={c.unread} />
            </button>
          ))}
          {mine.length === 0 && <p className="py-4 text-center text-xs text-neutral-500">{t("لا توجد قنوات بعد — اشترك من الأسفل أو أنشئ قناتك", "No channels yet — subscribe below or create yours")}</p>}
        </div>

        <h2 className="mb-2 mt-6 text-sm font-extrabold">{t("اكتشف قنوات", "Discover channels")}</h2>
        <div className="space-y-2">
          {discover.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-2xl bg-rachat-card p-3">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-extrabold text-rachat-ink ${c.colorClass}`}>{c.initial}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold" dir="auto">{c.name}</div>
                <div className="truncate text-[11px] text-neutral-400" dir="auto">{c.about}</div>
                <div className="text-[10.5px] text-neutral-500">{c.members.toLocaleString(loc())} {t("مشترك", "subscribers")}</div>
              </div>
              <button onClick={() => void subscribeChannel(c.id)} className="shrink-0 rounded-lg bg-rachat-red px-3.5 py-1.5 text-xs font-extrabold text-white">{t("اشترك", "Subscribe")}</button>
            </div>
          ))}
          {discover.length === 0 && (
            <p className="flex items-center justify-center gap-1.5 py-4 text-center text-xs text-neutral-500">
              <Check size={13} /> {t("أنت مشترك في كل القنوات المتاحة", "You're subscribed to every available channel")}
            </p>
          )}
        </div>

        <p className="mt-6 flex items-start gap-2 rounded-2xl bg-rachat-card p-3 text-[11px] leading-5 text-neutral-400">
          <Megaphone size={14} className="mt-0.5 shrink-0 text-rachat-gold" />
          {t("القناة للبثّ: صاحبها ينشر، والمشتركون يقرؤون ويتفاعلون — ولا يرى أحدٌ باقي المشتركين.", "A channel broadcasts: the owner posts, subscribers read and react — and nobody sees the other subscribers.")}
        </p>
      </div>
    </div>
  );
}

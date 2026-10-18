import { useState } from "react";
import { ThreadAvatar } from "../components/ThreadAvatar";
import { Settings, Plus, Users, Phone, Star, Mic, Pin, PinOff, Megaphone } from "lucide-react";
import { phaKind } from "../components/PharaohEmoji";
import { occKind } from "../components/OccasionSticker";
import { toggleFavorite, useFavorites } from "../store/favorites";
import { useNavigate } from "react-router-dom";
import { Header } from "../components/Header";
import { ContactsBanner } from "../components/ContactsBanner";
import { StoriesBar } from "../components/StoriesBar";
import { NewChatSheet } from "../components/NewChatSheet";
import { SponsoredCard } from "../ads/SponsoredCard";
import { useAppActions, useAppState } from "../store/AppContext";
import { useT, num as n } from "../i18n";

type Filter = "all" | "unread" | "dm" | "group" | "channel" | "room" | "fav";

export default function ChatsScreen() {
  const navigate = useNavigate();
  const tx = useT();
  const { threads, messages, rooms } = useAppState();
  const { setPinned } = useAppActions();
  const [pinNote, setPinNote] = useState("");
  const favs = useFavorites();
  const [filter, setFilter] = useState<Filter>("all");
  const FILTERS: [Filter, string, string][] = [["all", "الكل", "All"], ["unread", "غير المقروء", "Unread"], ["dm", "الخاصة", "Direct"], ["group", "الجروبات", "Groups"], ["channel", "القنوات", "Channels"], ["room", "الغرف", "Rooms"], ["fav", "المفضلة", "Favorites"]];
  const ordered = [...threads.filter((t) => t.pinned), ...threads.filter((t) => !t.pinned)];
  const shown = ordered.filter((x) => filter === "all" || (filter === "unread" && (x.unread ?? 0) > 0) || (filter === "dm" && x.type === "dm") || (filter === "group" && x.type === "group") || (filter === "channel" && x.type === "channel") || (filter === "fav" && favs.includes(x.id)));
  const [showNewChat, setShowNewChat] = useState(false);

  const unreadOf = (t: { unread?: number }) => t.unread ?? 0;

  /** الحد ٣ زي واتساب — والسيرفر هو الحارس الحقيقي (`too_many_pinned`) */
  const MAX_PINNED = 3;
  const togglePin = async (t: { id: string; pinned?: boolean }) => {
    if (!t.pinned && threads.filter((x) => x.pinned).length >= MAX_PINNED) {
      setPinNote(tx(`أقصى ${n(MAX_PINNED)} محادثات مثبّتة`, `You can pin up to ${MAX_PINNED} chats`));
      return;
    }
    setPinNote("");
    try {
      await setPinned(t.id, !t.pinned);
    } catch {
      setPinNote(tx("التثبيت ما نجحش — حاول تاني", "Pinning failed — try again"));
    }
  };

  const lastMessageFor = (threadId: string) => {
    const msgs = messages.filter((m) => m.threadId === threadId);
    return msgs[msgs.length - 1];
  };

  return (
    <div className="relative flex h-full flex-col">
      <Header
        title={tx("رع شات", "Raa Chat")}
        right={
          <>
            <button aria-label={tx("المكالمات", "Calls")} onClick={() => navigate("/calls")}><Phone size={20} /></button>
            <button aria-label={tx("الإعدادات", "Settings")} onClick={() => navigate("/account")}><Settings size={20} /></button>
          </>
        }
      />
      <StoriesBar />
      <ContactsBanner />
      <div className="flex-1 overflow-y-auto px-3">
        <div role="tablist" aria-label={tx("تصفية", "Filter")} className="sticky top-0 z-10 -mx-3 mb-2 flex gap-1.5 overflow-x-auto bg-rachat-black px-3 py-2">
          {FILTERS.map(([k, ar, en]) => (
            <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold ${filter === k ? "bg-rachat-red text-white" : "bg-rachat-card text-neutral-400"}`}>{tx(ar, en)}</button>
          ))}
        </div>
        {filter === "channel" && (
          <button onClick={() => navigate("/channels")} className="mb-2.5 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-rachat-gold/60 py-3 text-sm font-bold text-rachat-gold">
            <Megaphone size={16} /> {tx("اكتشف قنوات وأنشئ قناتك", "Discover channels & create yours")}
          </button>
        )}
        {pinNote && <p role="status" className="mb-2 rounded-xl bg-rachat-card px-3 py-2 text-xs text-rachat-gold">{pinNote}</p>}
        {filter === "all" && <SponsoredCard index={1} placement="banner" />}
        {filter === "room" && rooms.map((r) => (
          <button key={r.id} onClick={() => navigate("/rooms")} className="mb-2.5 flex w-full items-center gap-3 rounded-2xl bg-rachat-card p-3 text-start shadow-lg shadow-black/20">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-rachat-maroon text-rachat-gold"><Mic size={18} /></span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-rachat-papyrus">{r.name}</div>
              <div className="text-xs text-neutral-400">{r.joined ? tx("أنت داخل الغرفة", "You're in this room") : tx("اضغط للانضمام", "Tap to join")} · {r.count ?? r.participants.length} {tx("مشارك", "people")}</div>
            </div>
          </button>
        ))}
        {filter === "room" && rooms.length === 0 && <p className="mt-10 text-center text-xs text-neutral-500">{tx("مفيش غرف صوتية دلوقتي", "No voice rooms right now")}</p>}
        {filter !== "room" && shown.map((t) => {
          const last = lastMessageFor(t.id);
          return (
            <button
              key={t.id}
              onClick={() => navigate(`/chat/${t.id}`)}
              className="mb-2.5 flex w-full items-center gap-3 rounded-2xl bg-rachat-card p-3 text-start shadow-lg shadow-black/20"
            >
              <ThreadAvatar thread={t}>
                {t.type === "channel" && (
                  <span className="absolute -bottom-1 -end-1 flex h-4 w-4 items-center justify-center rounded-full bg-rachat-black text-rachat-gold ring-1 ring-rachat-black" aria-label={tx("قناة", "Channel")}>
                    <Megaphone size={9} />
                  </span>
                )}
                {t.type === "group" && (
                  <span className="absolute -bottom-1 -end-1 flex h-4 w-4 items-center justify-center rounded-full bg-rachat-black text-rachat-gold ring-1 ring-rachat-black">
                    <Users size={9} />
                  </span>
                )}
              </ThreadAvatar>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between">
                  {/* الاسم بولد طول ما فيه رسايل ما اتقرتش، وبيرجع عادي أول ما تفتحي المحادثة */}
                  <span className="flex min-w-0 items-center gap-1">
                    {t.pinned && <Pin size={12} aria-label={tx("مثبّتة", "Pinned")} className="shrink-0 text-rachat-gold" />}
                    <span className={`truncate text-sm ${unreadOf(t) ? "font-extrabold text-white" : "font-bold text-rachat-papyrus"}`} dir="auto">{t.name}</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                    <span role="button" tabIndex={0} aria-label={t.pinned ? tx("فك التثبيت", "Unpin") : tx("تثبيت", "Pin")} aria-pressed={!!t.pinned} onClick={(e) => { e.stopPropagation(); void togglePin(t); }} onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); void togglePin(t); } }} className={t.pinned ? "text-rachat-gold" : "text-neutral-600"}>{t.pinned ? <PinOff size={14} /> : <Pin size={14} />}</span>
                    <span role="button" tabIndex={0} aria-label={tx("مفضلة", "Favorite")} aria-pressed={favs.includes(t.id)} onClick={(e) => { e.stopPropagation(); toggleFavorite(t.id); }} onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); toggleFavorite(t.id); } }} className={favs.includes(t.id) ? "text-rachat-gold" : "text-neutral-600"}><Star size={14} fill={favs.includes(t.id) ? "currentColor" : "none"} /></span>
                    {last?.time ?? ""}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className={`truncate text-xs ${unreadOf(t) ? "font-bold text-rachat-papyrus" : "text-neutral-400"}`} dir="auto">
                    {last ? (last.deleted ? tx("تم حذف الرسالة", "Message deleted") : (last.text && occKind(last.text) ? tx("🎉 ملصق تهنئة", "🎉 Greeting sticker") : last.text && phaKind(last.text) ? tx("🏺 ملصق فرعوني", "🏺 Pharaonic sticker") : last.text) || (last.attachment ? `📎 ${last.attachment.name}` : "")) : tx("لا توجد رسائل بعد", "No messages yet")}
                  </span>
                  {unreadOf(t) > 0 && (
                    <span aria-label={tx("رسايل ما اتقرتش", "Unread messages")} className="shrink-0 rounded-full bg-rachat-red px-2 py-0.5 text-[11px] font-extrabold text-white">
                      {n(unreadOf(t))}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
        {filter !== "room" && shown.length === 0 && threads.length > 0 && (
          <p className="mt-10 text-center text-xs text-neutral-500">{tx("مفيش نتائج في الفلتر ده", "Nothing in this filter")}</p>
        )}
        {threads.length === 0 && (
          <p className="mt-10 text-center text-xs text-neutral-500">
            {tx("مفيش محادثات لسه — ابدأ واحدة بالزرار تحت", "No chats yet — start one with the button below")}
          </p>
        )}
      </div>
      <button
        onClick={() => setShowNewChat(true)}
        aria-label={tx("بدء جديد", "New")}
        className="absolute bottom-6 end-5 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-rachat-red to-rachat-coral text-white shadow-xl shadow-rachat-red/30"
      >
        <Plus size={26} />
      </button>

      {showNewChat && <NewChatSheet onClose={() => setShowNewChat(false)} />}
    </div>
  );
}

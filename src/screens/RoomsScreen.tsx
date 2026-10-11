import { useEffect, useRef, useState } from "react";
import { Plus, Eye, EyeOff, Lock, Mic, MicOff, Hand, LogOut, X } from "lucide-react";
import { Header } from "../components/Header";
import { useAppState, useAppActions } from "../store/AppContext";
import { RoomParticipant } from "../types";
import { useT, tr, num } from "../i18n";
import { API_ON } from "../api/client";
import { useRoomAudio } from "../rtc/roomAudio";

const TEMP_NAMES: { name: string; color: string }[] = [
  { get name() { return tr("المسافر الليلي", "Night Traveler"); }, color: "#C9A227" },
  { get name() { return tr("صوت الصحراء", "Desert Voice"); }, color: "#F2795C" },
  { get name() { return tr("نجمة النيل", "Nile Star"); }, color: "#E1523E" },
  { get name() { return tr("ساكن الفيوم", "Fayoum Dweller"); }, color: "#5B2621" },
];

const JOINER_POOL: { name: string; color: string }[] = [
  { get name() { return tr("هدى", "Huda"); }, color: "#7a4a2a" },
  { get name() { return tr("طارق", "Tarek"); }, color: "#F2795C" },
  { get name() { return tr("ليلى", "Layla"); }, color: "#C9A227" },
  { get name() { return tr("زياد", "Ziad"); }, color: "#5B2621" },
];

/**
 * غرف الحوار الصوتية + اختيار الهوية (حقيقية/مؤقتة) — راجع رحلة المستخدم (أ)
 * بالـ PRD. الانضمام/المغادرة/الصمت هنا حالة محلية فقط؛ الصوت الفعلي
 * (WebRTC signalling + media) نقطة عمل لاحقة — راجع README.
 */
export default function RoomsScreen() {
  const t = useT();
  const { rooms } = useAppState();
  const { createRoom, joinRoom, leaveRoom, simulateParticipantJoin, toggleMute } = useAppActions();

  const [pendingRoomId, setPendingRoomId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const [muted, setMuted] = useState(false);
  const joinerIdx = useRef(0);

  const activeRoom = rooms.find((r) => r.joined);
  const audio = useRoomAudio(activeRoom?.id, muted);
  const pendingRoom = rooms.find((r) => r.id === pendingRoomId);

  // يحاكي انضمام أعضاء جدد للغرفة بعد الدخول، فقط لإعطاء إحساس بالحيوية
  useEffect(() => {
    if (!activeRoom || API_ON) return;
    const timer = setInterval(() => {
      if (joinerIdx.current >= JOINER_POOL.length) return;
      const j = JOINER_POOL[joinerIdx.current];
      joinerIdx.current += 1;
      simulateParticipantJoin(activeRoom.id, { id: `sim_${j.name}`, name: j.name, color: j.color });
    }, 4000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoom?.id]);

  const chooseIdentity = (mode: "real" | "temp") => {
    if (!pendingRoomId) return;
    joinRoom(pendingRoomId, mode);
    setPendingRoomId(null);
  };

  const createAndOpen = async () => {
    if (!newRoomName.trim()) return;
    const id = await createRoom(newRoomName.trim());
    setNewRoomName("");
    setShowCreate(false);
    setPendingRoomId(id);
  };

  if (activeRoom) {
    const me = API_ON && activeRoom.me ? activeRoom.me :
      activeRoom.myIdentityMode === "temp"
        ? TEMP_NAMES[Math.abs(activeRoom.id.length) % TEMP_NAMES.length]
        : { name: t("أنت", "You"), color: "#F2795C" };
    const seats: { name: string; color: string; isMe?: boolean }[] = [
      ...activeRoom.participants.map((p) => ({ name: p.name, color: p.color })),
      { ...me, isMe: true },
    ];

    return (
      <div data-rc-theme="dark" className="text-rachat-papyrus fixed inset-y-0 left-1/2 z-30 flex w-full max-w-[420px] -translate-x-1/2 flex-col bg-gradient-to-b from-[#241210] to-rachat-black">
        <div className="flex items-center justify-between px-4 py-3.5">
          <button onClick={() => leaveRoom(activeRoom.id)} className="text-rachat-papyrus">
            <X size={20} />
          </button>
          <span className="text-sm font-extrabold text-rachat-papyrus">{activeRoom.name}</span>
          <div className="flex items-center gap-1.5 rounded-full bg-rachat-maroon/35 px-2.5 py-1">
            {activeRoom.myIdentityMode === "temp" ? (
              <Eye size={13} className="text-rachat-gold" />
            ) : (
              <EyeOff size={13} className="text-neutral-500" />
            )}
            <span className={`text-[10.5px] font-bold ${activeRoom.myIdentityMode === "temp" ? "text-rachat-gold" : "text-neutral-500"}`}>
              {t("وضع التخفي", "Incognito")}
            </span>
          </div>
        </div>

        {API_ON && ["denied", "none", "other", "full"].includes(audio) && (
          <div role="status" className="mx-4 mb-1.5 rounded-lg bg-rachat-red/20 px-2.5 py-1.5 text-[11px] text-rachat-coral">
            {audio === "denied" ? t("محتاجين إذن المايك عشان تسمع وتتكلم", "Microphone permission is needed to listen and talk") : audio === "none" ? t("مفيش مايك على الجهاز", "No microphone found") : audio === "full" ? t("الغرفة الصوتية مكتملة (٨ أشخاص)", "The voice room is full (8 people)") : t("تعذّر تشغيل الصوت", "Couldn't start audio")}
          </div>
        )}
        {activeRoom.myIdentityMode === "temp" && (
          <div className="mx-4 mb-1.5 flex items-center gap-1.5 rounded-lg border border-rachat-gold/40 bg-rachat-gold/10 px-2.5 py-1.5 text-[11px] text-rachat-gold">
            <Lock size={12} /> {t("أنت بهوية", "You are")} "{me.name}" — {t("لقطة الشاشة ممنوعة تلقائيًا", "screenshots are blocked automatically")}
          </div>
        )}

        <div className="flex flex-1 items-center justify-center">
          <div className="grid grid-cols-3 gap-x-8 gap-y-7">
            {seats.map((s, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div
                  className={`flex h-[68px] w-[68px] items-center justify-center rounded-full text-xl font-extrabold ${i === 0 ? "animate-pulse" : ""}`}
                  style={{
                    background: s.color,
                    color: s.isMe ? "#14100F" : "#F5EFE6",
                    boxShadow: i === 0 ? "0 0 0 3px #E1523E, 0 0 16px #E1523E" : undefined,
                  }}
                >
                  {s.name[0]}
                </div>
                <span className={`text-[11px] ${i === 0 ? "font-bold text-rachat-coral" : "text-neutral-500"}`}>{s.isMe ? s.name : i === 0 ? t("بيتكلم", "Speaking") : t("مستمع", "Listening")}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-center gap-5 px-4 pb-8 pt-3">
          <button
            onClick={() => { const nm = !muted; setMuted(nm); if (API_ON) void toggleMute(activeRoom.id, nm); }}
            className={`flex h-14 w-14 items-center justify-center rounded-full ${muted ? "bg-neutral-800 text-neutral-500" : "bg-rachat-card text-rachat-papyrus"}`}
          >
            {muted ? <MicOff size={19} /> : <Mic size={19} />}
          </button>
          <button className="flex h-14 w-14 items-center justify-center rounded-full bg-rachat-card text-rachat-gold">
            <Hand size={18} />
          </button>
          <button
            onClick={() => leaveRoom(activeRoom.id)}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-rachat-red text-white"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col">
      <Header
        title={t("الغرف", "Rooms")}
        right={
          <>
            <button onClick={() => setShowCreate(true)}><Plus size={19} /></button>
          </>
        }
      />
      <div className="flex-1 overflow-y-auto px-3.5">
        {rooms.length === 0 && <p className="py-10 text-center text-xs text-neutral-500">{t("مفيش غرف مفتوحة دلوقتي — اعمل غرفة بزرار +", "No open rooms right now — create one with +")}</p>}
        {rooms.map((r) => (
          <div key={r.id} className="mb-2.5 rounded-2xl bg-rachat-card p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-rachat-papyrus">{r.name}</span>
              <span className="text-[11px] text-neutral-500">{num(r.count ?? r.participants.length)} {t("مستمع", "listening")}</span>
            </div>
            <div className="mt-2.5 flex items-center justify-between">
              <div className="flex">
                {r.participants.slice(0, 5).map((p, i) => (
                  <div
                    key={p.id + i}
                    style={{ background: p.color, marginInlineStart: -10 }}
                    className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-rachat-card text-[11px] font-bold text-white"
                  >
                    {p.name[0]}
                  </div>
                ))}
              </div>
              <button
                onClick={() => setPendingRoomId(r.id)}
                className="rounded-full bg-gradient-to-br from-rachat-red to-rachat-coral px-4 py-1.5 text-xs font-bold text-white"
              >
                {t("دخول", "Join")}
              </button>
            </div>
          </div>
        ))}
      </div>

      {pendingRoom && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/85 p-6">
          <div className="w-full rounded-2xl bg-rachat-card p-6 text-center">
            <p className="font-extrabold text-rachat-papyrus">{t("هل تريد الدخول بهويتك الحقيقية أم بهوية مؤقتة؟", "Join with your real identity or a temporary one?")}</p>
            <p className="mt-2 text-xs text-neutral-500">
              {t("الهوية المؤقتة غير مرتبطة بحسابك وتُحذف نهائيًا عند المغادرة", "A temporary identity isn't linked to your account and is permanently deleted when you leave")}
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              <button
                onClick={() => chooseIdentity("temp")}
                className="flex items-center justify-center gap-2 rounded-xl border border-rachat-gold py-2.5 text-sm font-bold text-rachat-gold"
              >
                <Eye size={16} /> {t("ادخل بهوية مؤقتة", "Join with temporary identity")}
              </button>
              <button
                onClick={() => chooseIdentity("real")}
                className="flex items-center justify-center gap-2 rounded-xl border border-rachat-maroon py-2.5 text-sm text-rachat-papyrus"
              >
                <EyeOff size={16} /> {t("ادخل بهويتي الحقيقية", "Join with my real identity")}
              </button>
              <button onClick={() => setPendingRoomId(null)} className="mt-1 text-xs text-neutral-500">
                {t("إلغاء", "Cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/85 p-6">
          <div className="w-full rounded-2xl bg-rachat-card p-6">
            <p className="mb-3 text-center font-extrabold text-rachat-papyrus">{t("غرفة جديدة", "New room")}</p>
            <input
              autoFocus
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder={t("اسم الغرفة، مثال: نقاش تصميم 🎨", "Room name, e.g. Design chat 🎨")}
              className="mb-4 w-full rounded-xl bg-rachat-black px-3.5 py-2.5 text-sm text-rachat-papyrus outline-none placeholder:text-neutral-600"
            />
            <div className="flex gap-2.5">
              <button onClick={() => setShowCreate(false)} className="flex-1 rounded-xl border border-rachat-maroon py-2.5 text-sm text-neutral-400">
                {t("إلغاء", "Cancel")}
              </button>
              <button
                onClick={createAndOpen}
                className="flex-[2] rounded-xl bg-gradient-to-br from-rachat-red to-rachat-coral py-2.5 text-sm font-bold text-white"
              >
                {t("إنشاء ودخول", "Create & join")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

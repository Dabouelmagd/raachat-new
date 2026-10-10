import { useState } from "react";
import { BroadcastSheet } from "./BroadcastSheet";
import { useNavigate } from "react-router-dom";
import { MessageCircle, Phone, Video, Users, X, Send, UserPlus } from "lucide-react";
import { useT } from "../i18n";
import { API_ON } from "../api/client";
import { useAppState, useAppActions } from "../store/AppContext";

export function NewChatSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const t = useT();
  const { contacts, threads } = useAppState();
  const { createDm } = useAppActions();
  const [bc, setBc] = useState(false);

  const startDm = async (contactId: string) => {
    const existing = threads.find((x) => x.type === "dm" && x.memberIds[0] === contactId);
    const id = existing?.id ?? (await createDm(contactId));
    onClose();
    // مع الباك إند: نفتح المحادثة مباشرة؛ في الديمو بنرجع لقائمة الدردشات
    navigate(API_ON ? `/chat/${id}` : "/");
  };

  const callContact = async (contactId: string, mode: "voice" | "video") => {
    const existing = threads.find((x) => x.type === "dm" && x.memberIds[0] === contactId);
    const id = existing?.id ?? (await createDm(contactId));
    onClose();
    navigate(`/call/${id}?mode=${mode}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 sm:items-center">
      <div className="max-h-[80vh] w-full max-w-[380px] overflow-y-auto rounded-t-2xl bg-rachat-card p-5 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="font-extrabold text-rachat-papyrus">{t("بدء جديد", "New")}</p>
          <button onClick={onClose} className="text-neutral-500">
            <X size={18} />
          </button>
        </div>

        <button
          onClick={() => {
            onClose();
            navigate("/new-group");
          }}
          className="mb-4 flex w-full items-center gap-3 rounded-xl bg-rachat-black px-3.5 py-3"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rachat-gold/20 text-rachat-gold">
            <Users size={17} />
          </div>
          <span className="text-sm font-bold text-rachat-papyrus">{t("إنشاء جروب جديد", "Create new group")}</span>
        </button>

        <button onClick={() => setBc(true)} className="mb-4 flex w-full items-center gap-3 rounded-xl bg-rachat-black px-3.5 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rachat-red/20 text-rachat-red"><Send size={17} /></div>
          <span className="text-sm font-bold text-rachat-papyrus">{t("رسالة لأكتر من شخص", "Message several people")}</span>
        </button>
        <button onClick={() => { onClose(); navigate("/friends"); }} className="mb-4 flex w-full items-center gap-3 rounded-xl bg-rachat-black px-3.5 py-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-rachat-gold/20 text-rachat-gold"><UserPlus size={17} /></div>
          <span className="text-sm font-bold text-rachat-papyrus">{t("الأصدقاء ودعوة أصدقاء", "Friends & invite")}</span>
        </button>
        {bc && <BroadcastSheet onClose={() => { setBc(false); onClose(); }} />}

        <p className="mb-2 text-[11px] font-bold text-neutral-500">{t("دردشة فردية", "Direct chat")}</p>
        <div className="space-y-2">
          {contacts.map((c) => (
            <div key={c.id} className="flex w-full items-center gap-2 rounded-xl bg-rachat-black px-3.5 py-2.5">
              <button onClick={() => startDm(c.id)} className="flex min-w-0 flex-1 items-center gap-3 text-start">
                <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full font-bold text-rachat-ink ${c.colorClass}`}>
                  {c.initial}
                </div>
                <span className="truncate text-sm text-rachat-papyrus">{c.name}</span>
              </button>
              <button aria-label={t("رسالة", "Message")} onClick={() => startDm(c.id)} className="p-1.5 text-neutral-500"><MessageCircle size={16} /></button>
              <button aria-label={t("مكالمة صوتية", "Voice call")} onClick={() => callContact(c.id, "voice")} className="p-1.5 text-rachat-coral"><Phone size={16} /></button>
              <button aria-label={t("مكالمة فيديو", "Video call")} onClick={() => callContact(c.id, "video")} className="p-1.5 text-rachat-coral"><Video size={16} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

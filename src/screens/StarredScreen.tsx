import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Star } from "lucide-react";
import { API_ON, api } from "../api/client";
import { ApiMessage, mapMessage } from "../api/mappers";
import { Header } from "../components/Header";
import { fullStamp } from "../timefmt";
import { useT } from "../i18n";
import { Message } from "../types";

type Starred = Message & { threadName?: string };

/**
 * الرسائل اللي ميّزتيها بنجمة. **خاصة بيكي**: مفيش حد تاني بيشوف نجومك، ولا
 * حتى صاحب الرسالة. والرسالة اللي اتمسحت أو اللي خرجتي من محادثتها بتختفي.
 */
export default function StarredScreen() {
  const t = useT();
  const nav = useNavigate();
  const [rows, setRows] = useState<Starred[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!API_ON) { setRows([]); return; }
    api<(ApiMessage & { threadName?: string })[]>("/me/starred")
      .then((l) => setRows(l.map((m) => ({ ...mapMessage(m), threadName: m.threadName }))))
      .catch((e) => setErr((e as Error).message || t("تعذّر التحميل", "Couldn't load")));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full flex-col">
      <Header title={t("الرسائل المميّزة", "Starred messages")} showBack globalActions={false} />
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {err && <p className="text-sm text-rachat-coral" role="alert">{err}</p>}
        {rows === null && !err && <p className="text-xs text-neutral-500">{t("جاري التحميل…", "Loading…")}</p>}
        {rows?.length === 0 && (
          <div className="mt-16 flex flex-col items-center gap-2 text-center">
            <Star size={34} className="text-rachat-gold" />
            <p className="text-sm text-neutral-400">{t("مفيش رسائل مميّزة لسه", "No starred messages yet")}</p>
            <p className="max-w-[260px] text-[11px] leading-5 text-neutral-500">
              {t("دوسي على أي رسالة واختاري «تمييز بنجمة» عشان ترجعيلها بسرعة من هنا.",
                 "Tap any message and choose “Star” to find it quickly here.")}
            </p>
          </div>
        )}
        {rows?.map((m) => (
          <button
            key={m.id}
            onClick={() => nav(`/chat/${m.threadId}`)}
            className="mb-2 flex w-full flex-col gap-1 rounded-2xl bg-rachat-card p-3 text-start"
          >
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="min-w-0 flex-1 truncate font-bold text-rachat-gold" dir="auto">{m.threadName ?? m.authorName}</span>
              <span className="shrink-0 text-neutral-500">{m.at ? fullStamp(m.at) : m.time}</span>
            </div>
            <p className="line-clamp-3 break-words text-sm text-rachat-papyrus" dir="auto">
              {m.text || m.attachment?.name || t("مرفق", "Attachment")}
            </p>
            <span className="text-[11px] text-neutral-500" dir="auto">{m.authorName}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

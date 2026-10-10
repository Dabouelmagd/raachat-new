import { useState } from "react";
import { Check, Send, Users, X } from "lucide-react";
import { useT } from "../i18n";
import { useAppState, useAppActions } from "../store/AppContext";

/** رسالة واحدة لأكتر من شخص/جروب: كل واحد بياخد رسالة منفصلة في محادثته. */
export function BroadcastSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { contacts, threads } = useAppState();
  const { createDm, sendMessage } = useAppActions();
  const [sel, setSel] = useState<string[]>([]); // "c:<contactId>" أو "t:<threadId>"
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ ok: number; fail: number } | null>(null);

  const groups = threads.filter((x) => x.type === "group");
  const toggle = (k: string) => setSel((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));
  const all = [...contacts.map((c) => `c:${c.id}`), ...groups.map((g) => `t:${g.id}`)];

  const send = async () => {
    if (!text.trim() || !sel.length || busy) return;
    setBusy(true);
    let ok = 0, fail = 0;
    for (const k of sel) {
      try {
        let tid: string;
        if (k.startsWith("t:")) tid = k.slice(2);
        else {
          const cid = k.slice(2);
          tid = threads.find((x) => x.type === "dm" && x.memberIds[0] === cid)?.id ?? (await createDm(cid));
        }
        await sendMessage(tid, text.trim());
        ok++;
      } catch { fail++; }
    }
    setBusy(false);
    setDone({ ok, fail });
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={t("رسالة لأكتر من شخص", "Message several people")} className="fixed inset-0 z-[55] flex items-end justify-center bg-black/80 sm:items-center">
      <div className="flex max-h-[88vh] w-full max-w-[380px] flex-col rounded-t-2xl bg-rachat-card p-5 sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-extrabold text-rachat-papyrus">{t("رسالة لأكتر من شخص", "Message several people")}</p>
          <button onClick={onClose} aria-label={t("إغلاق", "Close")} className="text-neutral-500"><X size={18} /></button>
        </div>

        {done ? (
          <div className="py-8 text-center">
            <p className="text-sm font-bold text-emerald-400">{t(`اتبعتت لـ ${done.ok} محادثة`, `Sent to ${done.ok} chats`)}</p>
            {done.fail > 0 && <p className="mt-1 text-xs text-rachat-coral">{t(`فشل الإرسال لـ ${done.fail}`, `${done.fail} failed`)}</p>}
            <button onClick={onClose} className="mt-5 rounded-full bg-rachat-gold px-6 py-2 text-sm font-extrabold text-rachat-ink">{t("تم", "Done")}</button>
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between text-[11px] text-neutral-400">
              <span>{t(`المحدد: ${sel.length}`, `Selected: ${sel.length}`)}</span>
              <button onClick={() => setSel(sel.length === all.length ? [] : all)} className="font-bold text-rachat-gold">{sel.length === all.length ? t("إلغاء التحديد", "Clear") : t("تحديد الكل", "Select all")}</button>
            </div>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
              {contacts.map((c) => (
                <Row key={c.id} on={sel.includes(`c:${c.id}`)} onClick={() => toggle(`c:${c.id}`)} label={c.name} avatar={<span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-rachat-ink ${c.colorClass}`}>{c.initial}</span>} />
              ))}
              {groups.map((g) => (
                <Row key={g.id} on={sel.includes(`t:${g.id}`)} onClick={() => toggle(`t:${g.id}`)} label={g.name} avatar={<span className="flex h-8 w-8 items-center justify-center rounded-full bg-rachat-gold/20 text-rachat-gold"><Users size={15} /></span>} />
              ))}
            </div>
            <div className="mt-3 flex items-end gap-2">
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={4000} placeholder={t("اكتب الرسالة...", "Write your message...")} className="min-w-0 flex-1 resize-none rounded-xl bg-rachat-black px-3 py-2 text-sm text-rachat-papyrus outline-none" />
              <button onClick={send} disabled={busy || !text.trim() || !sel.length} aria-label={t("إرسال", "Send")} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-rachat-red to-rachat-coral text-white disabled:opacity-40"><Send size={17} /></button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Row({ on, onClick, label, avatar }: { on: boolean; onClick: () => void; label: string; avatar: React.ReactNode }) {
  return (
    <button role="checkbox" aria-checked={on} onClick={onClick} className="flex w-full items-center gap-3 rounded-xl bg-rachat-black px-3 py-2 text-start">
      {avatar}
      <span className="min-w-0 flex-1 truncate text-sm text-rachat-papyrus">{label}</span>
      <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${on ? "border-rachat-gold bg-rachat-gold text-rachat-ink" : "border-neutral-600"}`}>{on && <Check size={12} />}</span>
    </button>
  );
}

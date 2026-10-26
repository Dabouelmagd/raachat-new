import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { api, API_ON } from "../api/client";
import { useT } from "../i18n";

type U = { id: string; name: string };

export function BlockedUsersSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [rows, setRows] = useState<U[] | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (!API_ON) { setRows([]); return; }
    api<U[]>("/blocks").then(setRows).catch(() => setErr(true));
  }, []);
  const unblock = async (id: string) => {
    try { await api(`/blocks/${id}`, { method: "DELETE" }); setRows((r) => (r ?? []).filter((x) => x.id !== id)); } catch { setErr(true); }
  };
  return (
    <div role="dialog" aria-modal="true" aria-label={t("المحظورون", "Blocked users")} className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div className="max-h-[80%] w-full overflow-y-auto rounded-t-3xl bg-rachat-ink p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-rachat-papyrus">{t("المحظورون", "Blocked users")}</h2>
          <button onClick={onClose} aria-label={t("إغلاق", "Close")} className="p-1 text-neutral-400"><X size={18} /></button>
        </div>
        {err && <p className="mb-2 text-xs text-rachat-red">{t("حدث خطأ، حاول مرة أخرى.", "Something went wrong, try again.")}</p>}
        {rows === null && !err && <p className="text-xs text-neutral-400">…</p>}
        {rows?.length === 0 && <p className="py-6 text-center text-xs text-neutral-400">{t("لا يوجد محظورون.", "No blocked users.")}</p>}
        {rows?.map((u) => (
          <div key={u.id} className="mb-2 flex items-center justify-between rounded-xl bg-rachat-card px-3.5 py-3 text-xs text-rachat-papyrus">
            <span>{u.name}</span>
            <button onClick={() => unblock(u.id)} className="rounded-full border border-rachat-gold px-3 py-1 text-rachat-gold">{t("إلغاء الحظر", "Unblock")}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

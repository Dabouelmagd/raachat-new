import { useEffect, useState } from "react";
import { API_ON, api } from "../api/client";
import { Laptop, Smartphone } from "lucide-react";
import { Header } from "../components/Header";
import { useT, tr } from "../i18n";

interface Sess { id: string; device: string; place: string; when: string; current?: boolean; kind: "phone" | "desk" }

const SEED: Sess[] = [
  { id: "s1", get device() { return tr("هذا الجهاز · موبايل", "This device · Mobile"); }, get place() { return tr("القاهرة", "Cairo"); }, get when() { return tr("نشط الآن", "Active now"); }, current: true, kind: "phone" },
  { id: "s2", get device() { return tr("متصفح Chrome · ويندوز", "Chrome browser · Windows"); }, get place() { return tr("الجيزة", "Giza"); }, get when() { return tr("آخر نشاط أمس ٩:٤٠ م", "Last active yesterday 9:40 PM"); }, kind: "desk" },
  { id: "s3", get device() { return tr("رع شات للويب · ماك", "Raa Chat Web · Mac"); }, get place() { return tr("الإسكندرية", "Alexandria"); }, get when() { return tr("آخر نشاط من ٣ أيام", "Last active 3 days ago"); }, kind: "desk" },
];

export default function SessionsScreen() {
  const t = useT();
  const [list, setList] = useState<Sess[]>(API_ON ? [] : SEED);
  useEffect(() => {
    if (!API_ON) return;
    api<{ id: string; device: string; lastUsed: string; current: boolean }[]>("/sessions").then((l) =>
      setList(l.map((s) => ({ id: s.id, device: s.device || tr("جهاز", "Device"), place: "", when: s.current ? tr("نشط الآن", "Active now") : new Date(s.lastUsed).toLocaleString(), current: s.current, kind: /mobile|android|iphone/i.test(s.device) ? "phone" : "desk" }))),
    ).catch(() => {});
  }, []);
  const endOne = (id: string) => { setList((l) => l.filter((x) => x.id !== id)); if (API_ON) void api(`/sessions/${id}`, { method: "DELETE" }); };
  const endOthers = () => { setList((l) => l.filter((x) => x.current)); if (API_ON) void api("/sessions", { method: "DELETE" }); };
  const [confirm, setConfirm] = useState<string | null>(null);
  const others = list.filter((s) => !s.current);

  return (
    <div className="flex h-full flex-col">
      <Header title={t("الجلسات النشطة", "Active sessions")} showBack />
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <p className="mb-3 mt-3 text-xs leading-6 text-neutral-500">{t("دي الأجهزة المسجّل منها حسابك. لو شفتي جهاز مش مألوف، أنهي جلسته فورًا.", "These are the devices signed in to your account. If you see one you don't recognize, end its session right away.")}</p>
        {list.map((s) => (
          <div key={s.id} className="mb-2 flex items-center gap-3 rounded-xl bg-rachat-card px-3.5 py-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rachat-maroon/50 text-rachat-red">
              {s.kind === "phone" ? <Smartphone size={19} /> : <Laptop size={19} />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-bold text-rachat-papyrus">{s.device}</div>
              <div className={`mt-0.5 text-[10.5px] ${s.current ? "text-emerald-400" : "text-neutral-500"}`}>{s.place ? `${s.place} · ` : ""}{s.when}</div>
            </div>
            {!s.current && (
              confirm === s.id ? (
                <button onClick={() => { endOne(s.id); setConfirm(null); }}
                  className="rounded-lg bg-rachat-red px-2.5 py-1.5 text-[11px] font-bold text-white">{t("تأكيد الإنهاء", "Confirm")}</button>
              ) : (
                <button onClick={() => setConfirm(s.id)} className="rounded-lg bg-rachat-maroon/40 px-2.5 py-1.5 text-[11px] font-bold text-rachat-papyrus">{t("إنهاء", "End")}</button>
              )
            )}
          </div>
        ))}
        {others.length === 0 && <div className="mt-6 text-center text-xs text-neutral-500">{t("مفيش جلسات تانية مفتوحة.", "No other open sessions.")}</div>}
        {others.length > 1 && (
          <button onClick={endOthers}
            className="mt-3 w-full rounded-xl border border-rachat-red/60 py-3 text-sm font-bold text-rachat-red">{t("إنهاء كل الجلسات الأخرى", "End all other sessions")}</button>
        )}
      </div>
    </div>
  );
}

import { dismissToast, useToast } from "../sound/notify";
import logo from "../assets/logo.png";

/** بانر إشعار داخل التطبيق — بشعار رع وأيقونة عنخ */
export function NotificationToast() {
  const t = useToast();
  if (!t) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex justify-center px-4" role="status" aria-live="polite">
      <button
        key={t.id}
        onClick={dismissToast}
        className="pointer-events-auto flex w-full max-w-[380px] items-center gap-3 rounded-2xl border border-rachat-gold/40 bg-rachat-card px-3.5 py-3 text-start shadow-[0_8px_30px_rgba(0,0,0,0.35)]"
        style={{ animation: "rcToast .35s ease-out" }}
      >
        <img src={logo} alt="" className="h-10 w-10 shrink-0 rounded-xl" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-extrabold text-rachat-gold">{t.title}</span>
          <span className="block truncate text-[11.5px] text-rachat-papyrus">{t.body}</span>
        </span>
      </button>
    </div>
  );
}

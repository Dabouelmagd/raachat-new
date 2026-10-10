import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { checkDueAd, clickAd, dismissAd, syncShownFromServer, useAdState } from "./ads";
import { useT, num } from "../i18n";

const SKIP_AFTER = 5; // ثواني قبل ظهور زر الإغلاق

/** يفحص موعد الإعلان عند الدخول وكل نصف دقيقة، ويعرضه كنافذة كاملة */
export function AdHost() {
  const t = useT();
  const { current } = useAdState();
  const [left, setLeft] = useState(SKIP_AFTER);

  useEffect(() => {
    void syncShownFromServer().finally(() => checkDueAd());
    const t = setInterval(() => checkDueAd(), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!current) return;
    setLeft(SKIP_AFTER);
    const t = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [current]);

  if (!current) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-5">
      <div className={`relative w-full max-w-[360px] overflow-hidden rounded-3xl bg-gradient-to-br ${current.gradient} p-6 shadow-2xl ring-1 ring-white/10`}>
        <div className="mb-10 flex items-center justify-between">
          <span className="rounded-full bg-black/40 px-2.5 py-1 text-[10.5px] font-bold text-rachat-gold">{t("إعلان", "Ad")}</span>
          {left > 0 ? (
            <span className="text-xs text-white/70">{t("يمكنك الإغلاق بعد", "You can close in")} {num(left)}</span>
          ) : (
            <button onClick={dismissAd} aria-label={t("إغلاق الإعلان", "Close ad")} className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40">
              <X size={16} />
            </button>
          )}
        </div>
        <div className="text-[11px] font-bold text-white/70">{current.advertiser}</div>
        <h2 className="mt-1 text-2xl font-extrabold leading-9">{current.headline}</h2>
        <p className="mt-2 text-sm leading-6 text-white/85">{current.body}</p>
        <button onClick={clickAd} className="mt-8 w-full rounded-xl bg-rachat-cream py-3.5 font-extrabold text-rachat-ink">
          {current.cta}
        </button>
      </div>
    </div>
  );
}

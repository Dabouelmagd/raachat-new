import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { trackBanner, useCatalog } from "./ads";
import { useT, num } from "../i18n";

// البانر مرن: يتكيف مع عرض الشاشة (النص يلتف والزر ينزل سطر لو الشاشة ضيقة)،
// يدور تلقائيًا بين الإعلانات، ويمكن إغلاقه أو التنقل بالنقاط.
let dismissed = false; // يُستبدل بإعداد من الباك إند / تفضيل المستخدم

export function SponsoredCard({ index = 0, rotate = true, placement = "banner" }: { index?: number; rotate?: boolean; placement?: "banner" | "services" }) {
  const t = useT();
  const { list } = useCatalog(placement);
  const ADS = list ?? [];
  const [i, setI] = useState(index);
  const [hidden, setHidden] = useState(dismissed);
  const [paused, setPaused] = useState(false);
  // الصور اللي ما حمّلتش (رابط اتمسح من القرص، أو شبكة). الرجوع للتصميم النصّي
  // أحسن من مستطيل فاضي، والمستخدم لازم يشوف الإعلان على كل حال.
  const [broken, setBroken] = useState<Record<string, true>>({});

  useEffect(() => {
    if (!rotate || paused || hidden) return;
    const t = setInterval(() => setI((x) => (x + 1) % Math.max(1, ADS.length)), 6000);
    return () => clearInterval(t);
  }, [rotate, paused, hidden, ADS.length]);

  const ad = ADS.length ? ADS[i % ADS.length] : undefined;
  useEffect(() => { if (ad && !hidden) trackBanner(ad.id, placement, "shown"); }, [ad?.id, hidden, placement]);
  if (hidden || !ad) return null;
  return (
    <div
      className={`relative mb-2.5 rounded-2xl bg-gradient-to-br ${ad.gradient} p-3.5 ring-1 ring-white/10 transition-all`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      role="region"
      aria-label={t("إعلان", "Ad")}
    >
      <button
        aria-label={t("إخفاء الإعلان", "Hide ad")}
        onClick={() => { dismissed = true; setHidden(true); }}
        className="absolute end-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/35 text-white/80"
      >
        <X size={13} />
      </button>
      {ad.imageUrl && !broken[ad.id] && (
        // مقاس البانر ١٢٠٠×٣٠٠، فالنسبة ٤:١ — والشريحة بتاخد عرض الكارت كله
        // فوق النص. `object-cover` عشان صورة بنسبة تانية ما تتمدّش.
        <img
          src={ad.imageUrl}
          alt=""
          loading="lazy"
          onError={() => setBroken((b) => ({ ...b, [ad.id]: true }))}
          className="mb-2.5 aspect-[4/1] w-full rounded-xl object-cover"
        />
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pe-7">
        <div className="min-w-[10rem] flex-1">
          <div className="mb-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-white/70">
            <span className="rounded bg-black/40 px-1.5 py-0.5 font-bold text-rachat-gold">{t("إعلان", "Ad")}</span>
            {ad.advertiser}
          </div>
          <div className="text-sm font-extrabold leading-6">{ad.headline}</div>
          <div className="mt-0.5 text-[11.5px] leading-5 text-white/80">{ad.body}</div>
        </div>
        {ad.link && /^https:\/\//.test(ad.link)
          ? <a href={ad.link} target="_blank" rel="noopener noreferrer sponsored" onClick={() => trackBanner(ad.id, placement, "clicked")} className="shrink-0 rounded-lg bg-rachat-cream px-3.5 py-1.5 text-xs font-extrabold text-rachat-ink">{ad.cta}</a>
          : <span className="shrink-0 rounded-lg bg-rachat-cream px-3.5 py-1.5 text-xs font-extrabold text-rachat-ink">{ad.cta}</span>}
      </div>
      {rotate && (
        <div className="mt-2.5 flex justify-center gap-1.5">
          {ADS.map((a, k) => (
            <button key={a.id} aria-label={t(`الإعلان ${num(k + 1)}`, `Ad ${k + 1}`)} onClick={() => setI(k)}
              className={`h-1.5 rounded-full transition-all ${k === i ? "w-4 bg-white" : "w-1.5 bg-white/40"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

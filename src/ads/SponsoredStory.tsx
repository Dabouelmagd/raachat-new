import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { trackBanner, useCatalog } from "./ads";
import { useCloseOnEscape } from "../components/useCloseOnEscape";
import { useT } from "../i18n";

/**
 * **الستوري الممول — إعلان موضع `story`.**
 *
 * الموضع ده كان **مباعًا في اللوحة ومش معروضًا في التطبيق خالص**: `adsFor("story")`
 * مكانش بيتنادى من أي مكان، يعني المعلن يدفع ٢٥٠ ج/يوم على مكان **عمره ما ظهر**
 * لأي مستخدم، ومفيش ولا خطأ يقول كده — الحملة تعدّي والإحصاءات تفضل صفرًا.
 *
 * بيظهر كدايرة في آخر شريط القصص بحلقة ذهبية وكلمة «إعلان» — **متعلّم بوضوح**،
 * ومابيتحطّش وسط ستوريز الناس عشان المستخدم ما يفتكرش إنه من حد يعرفه.
 */
const SECONDS = 6;

export function SponsoredStory() {
  const t = useT();
  const { list } = useCatalog("story");
  const [open, setOpen] = useState(false);
  const ad = (list ?? [])[0];
  if (!ad) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`${t("إعلان", "Ad")} — ${ad.advertiser}`}
        className="flex flex-shrink-0 flex-col items-center gap-1"
      >
        <div
          className="relative flex h-14 w-14 items-center justify-center rounded-full p-[2px]"
          style={{ background: "linear-gradient(135deg, #C9A227, #E1523E)" }}
        >
          <div
            className={`flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white ${ad.gradient}`}
            style={ad.imageUrl ? { background: `center / cover url(${ad.imageUrl})` } : undefined}
          >
            {!ad.imageUrl && ad.advertiser[0]}
          </div>
          <span className="absolute -bottom-1 start-1/2 -translate-x-1/2 rounded bg-rachat-black px-1 text-[8px] font-bold text-rachat-gold ring-1 ring-rachat-black">
            {t("إعلان", "Ad")}
          </span>
        </div>
        <span className="max-w-[56px] truncate text-[10px] text-neutral-400">{ad.advertiser.split(" ")[0]}</span>
      </button>
      {open && <StoryAd ad={ad} onClose={() => setOpen(false)} />}
    </>
  );
}

function StoryAd({ ad, onClose }: { ad: NonNullable<ReturnType<typeof useCatalog>["list"]>[number]; onClose: () => void }) {
  const t = useT();
  const [left, setLeft] = useState(SECONDS);
  const [broken, setBroken] = useState(false);
  useCloseOnEscape(onClose);

  useEffect(() => { trackBanner(ad.id, "story", "shown"); }, [ad.id]);
  useEffect(() => {
    const i = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(i);
  }, []);
  // بيقفل لوحده زي أي ستوري — من غير كده المستخدم محبوس في إعلان
  useEffect(() => { if (left <= 0) onClose(); }, [left, onClose]);

  const img = ad.imageUrl && !broken ? ad.imageUrl : null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95" onClick={onClose}>
      <div
        className={`relative flex aspect-[9/16] max-h-full w-full max-w-[420px] flex-col justify-end overflow-hidden bg-gradient-to-br ${ad.gradient}`}
        onClick={(e) => e.stopPropagation()}
      >
        {img && (
          <img src={img} alt="" onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/45" />

        {/* شريط التقدّم زي الستوري العادي — المستخدم يعرف إنه هيخلص إمتى */}
        <div className="absolute inset-x-3 top-3 h-1 overflow-hidden rounded-full bg-white/25">
          <div className="h-full bg-white transition-[width] duration-1000 ease-linear" style={{ width: `${((SECONDS - left) / SECONDS) * 100}%` }} />
        </div>
        <div className="absolute inset-x-3 top-7 flex items-center justify-between">
          <span className="rounded-full bg-black/45 px-2.5 py-1 text-[10.5px] font-bold text-rachat-gold">{t("إعلان", "Ad")}</span>
          <button onClick={onClose} aria-label={t("إغلاق الإعلان", "Close ad")} className="flex h-8 w-8 items-center justify-center rounded-full bg-black/45">
            <X size={16} />
          </button>
        </div>

        <div className="relative p-5">
          <div className="text-[11px] font-bold text-white/75">{ad.advertiser}</div>
          <h2 className="mt-1 text-2xl font-extrabold leading-9">{ad.headline}</h2>
          <p className="mt-2 text-sm leading-6 text-white/85">{ad.body}</p>
          {ad.link && /^https:\/\//.test(ad.link)
            ? <a href={ad.link} target="_blank" rel="noopener noreferrer sponsored" onClick={() => trackBanner(ad.id, "story", "clicked")}
                className="mt-5 block rounded-xl bg-rachat-cream py-3 text-center font-extrabold text-rachat-ink">{ad.cta}</a>
            : <div className="mt-5 rounded-xl bg-rachat-cream py-3 text-center font-extrabold text-rachat-ink">{ad.cta}</div>}
        </div>
      </div>
    </div>
  );
}

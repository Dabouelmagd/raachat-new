import { Megaphone } from "lucide-react";
import { Header } from "../components/Header";
import { trackBanner, useCatalog } from "../ads/ads";
import { useT } from "../i18n";
import { useEffect } from "react";

/**
 * عروض ممولة شغّالة النهارده.
 *
 * **موضع مباع زي أي موضع تاني (`adsfeed`)** — قبل كده كانت بتعرض **كل**
 * الحملات المعتمدة مهما كانت المواضع اللي اشترتها، وبلا تتبّع ظهور ولا نقر:
 * يعني ظهور مجاني وغير محسوب، والمعلن اللي اشترى الستوري بس كان بيظهر هنا
 * كمان من غير ما يدفع.
 */
export default function AdsScreen() {
  const t = useT();
  const { list, err } = useCatalog("adsfeed");
  // الظهور بيتسجّل لكل إعلان في القايمة — `trackBanner` بيمنع التكرار في اليوم
  useEffect(() => { (list ?? []).forEach((ad) => trackBanner(ad.id, "adsfeed", "shown")); }, [list]);

  return (
    <div className="flex h-full flex-col bg-rachat-black">
      <Header title={t("الإعلانات", "Ads")} right={<Megaphone size={20} />} />
      <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-6">
        {list === null && <p className="py-10 text-center text-sm text-neutral-500">{t("جاري التحميل…", "Loading…")}</p>}
        {err && <p role="alert" className="py-10 text-center text-sm text-rachat-red">{t("تعذّر تحميل الإعلانات", "Couldn't load ads")}</p>}
        {list && !err && list.length === 0 && <p className="py-10 text-center text-sm text-neutral-500">{t("مفيش عروض دلوقتي", "No offers right now")}</p>}
        {(list ?? []).map((ad) => (
          <article key={ad.id} className={`rounded-2xl bg-gradient-to-br ${ad.gradient} p-4 ring-1 ring-white/10`}>
            <div className="mb-1 flex items-center gap-2 text-[11px] text-white/75">
              <b className="rounded bg-black/40 px-1.5 py-0.5 text-rachat-gold">{t("إعلان", "Ad")}</b>{ad.advertiser}
            </div>
            <h2 className="text-lg font-extrabold leading-8">{ad.headline}</h2>
            <p className="mt-1 text-sm text-white/85">{ad.body}</p>
            {ad.link && /^https:\/\//.test(ad.link)
              ? <a href={ad.link} target="_blank" rel="noopener noreferrer sponsored" onClick={() => trackBanner(ad.id, "adsfeed", "clicked")} className="mt-3 block rounded-xl bg-rachat-cream py-2.5 text-center font-extrabold text-rachat-ink">{ad.cta}</a>
              : <div className="mt-3 rounded-xl bg-rachat-cream py-2.5 text-center font-extrabold text-rachat-ink">{ad.cta}</div>}
          </article>
        ))}
      </div>
    </div>
  );
}

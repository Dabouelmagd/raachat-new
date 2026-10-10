import { Megaphone } from "lucide-react";
import { useCatalog } from "../ads/ads";
import { useT } from "../i18n";

/** عروض ممولة شغّالة النهارده (من حملات الإعلانات المعتمدة) */
export default function AdsScreen() {
  const t = useT();
  const { list, err } = useCatalog();
  return (
    <div className="flex h-full flex-col bg-rachat-black">
      <header className="flex items-center gap-2 px-4 pb-3 pt-5">
        <Megaphone size={22} className="text-rachat-red" />
        <h1 className="text-xl font-extrabold">{t("الإعلانات", "Ads")}</h1>
      </header>
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
              ? <a href={ad.link} target="_blank" rel="noopener noreferrer sponsored" className="mt-3 block rounded-xl bg-rachat-cream py-2.5 text-center font-extrabold text-rachat-ink">{ad.cta}</a>
              : <div className="mt-3 rounded-xl bg-rachat-cream py-2.5 text-center font-extrabold text-rachat-ink">{ad.cta}</div>}
          </article>
        ))}
      </div>
    </div>
  );
}

import { Check, X } from "lucide-react";
import { useT, useDir } from "../i18n";
import { WALLPAPERS, setWallpaper, useWallpaper, wallpaperStyle } from "../theme/wallpapers";
import { BUBBLES, setBubble, useBubble } from "../theme/bubbles";
import { TEXT_SCALES, setTextScale, useTextScale } from "../theme/textScale";

export function WallpaperSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const dir = useDir();
  const cur = useWallpaper();
  const bub = useBubble();
  const scale = useTextScale();
  return (
    <div role="dialog" aria-modal="true" aria-label={t("شكل المحادثة", "Chat appearance")} dir={dir} className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div className="max-h-[85%] w-full overflow-y-auto rounded-t-3xl bg-rachat-black p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-rachat-papyrus">{t("شكل المحادثة", "Chat appearance")}</h2>
          <button onClick={onClose} aria-label={t("إغلاق", "Close")} className="p-1 text-neutral-400"><X size={18} /></button>
        </div>
        {/* حجم الخط: بيكبر التطبيق كله والإيموجي معاه */}
        <h3 className="mb-2 text-xs font-bold text-neutral-400">{t("حجم الخط", "Text size")}</h3>
        <div role="group" aria-label={t("حجم الخط", "Text size")} className="mb-4 flex gap-1.5">
          {TEXT_SCALES.map(([v, ar, en]) => (
            <button key={v} onClick={() => setTextScale(v)} aria-pressed={scale === v}
              className={`flex-1 rounded-xl py-2 font-bold ${scale === v ? "bg-rachat-red text-white" : "bg-rachat-card text-neutral-300"}`}
              style={{ fontSize: `${0.75 * v}rem` }}>
              {t(ar, en)}
            </button>
          ))}
        </div>
        <p className="mb-4 rounded-xl bg-rachat-card px-3 py-2 text-sm text-rachat-papyrus">{t("هكذا سيظهر شكل الكلام 🙂", "This is how your text will look 🙂")}</p>

        {/* لون فقاعة الكلام — غير خلفية الشاشة */}
        <h3 className="mb-2 text-xs font-bold text-neutral-400">{t("لون فقاعة الكلام", "Bubble colour")}</h3>
        <div className="mb-4 grid grid-cols-3 gap-2.5">
          {BUBBLES.map((b) => (
            <button key={b.id} onClick={() => setBubble(b.id)} aria-pressed={bub === b.id} aria-label={t(b.ar, b.en)}
              className={`rounded-2xl border-2 p-2 ${bub === b.id ? "border-rachat-gold" : "border-transparent"} bg-rachat-card`}>
              <span className="mb-1 block h-5 rounded-full" style={{ background: b.me.bg }} />
              <span className="mb-1.5 block h-4 w-3/4 rounded-full" style={{ background: b.them.bg }} />
              <span className="block text-center text-[11px] font-bold text-rachat-papyrus">{t(b.ar, b.en)}</span>
            </button>
          ))}
        </div>

        <h3 className="mb-2 text-xs font-bold text-neutral-400">{t("خلفية المحادثة", "Chat wallpaper")}</h3>
        <div className="grid grid-cols-3 gap-2.5">
          {WALLPAPERS.map((w) => (
            <button key={w.id} onClick={() => setWallpaper(w.id)} aria-pressed={cur === w.id} className={`relative aspect-[3/4] overflow-hidden rounded-2xl border-2 ${cur === w.id ? "border-rachat-gold" : "border-transparent"} bg-rachat-card`} style={wallpaperStyle(w.id)}>
              {cur === w.id && <span className="absolute end-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rachat-gold text-rachat-ink"><Check size={12} /></span>}
              <span className="absolute inset-x-0 bottom-0 bg-black/55 py-1 text-center text-[11px] font-bold text-white">{t(w.ar, w.en)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

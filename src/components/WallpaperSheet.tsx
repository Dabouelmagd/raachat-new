import { Check, X } from "lucide-react";
import { useT, useDir } from "../i18n";
import { WALLPAPERS, setWallpaper, useWallpaper, wallpaperStyle } from "../theme/wallpapers";

export function WallpaperSheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const dir = useDir();
  const cur = useWallpaper();
  return (
    <div role="dialog" aria-modal="true" aria-label={t("خلفية الشات", "Chat wallpaper")} dir={dir} className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div className="max-h-[85%] w-full overflow-y-auto rounded-t-3xl bg-rachat-black p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-base font-bold text-rachat-papyrus">{t("خلفية الشات", "Chat wallpaper")}</h2>
          <button onClick={onClose} aria-label={t("إغلاق", "Close")} className="p-1 text-neutral-400"><X size={18} /></button>
        </div>
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

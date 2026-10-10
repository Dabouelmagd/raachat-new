import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { readImage } from "../media/files";
import { useT } from "../i18n";
import { useAppActions } from "../store/AppContext";

const PALETTE: [string, string][] = [
  ["#E1523E", "#F2795C"],
  ["#14100F", "#C9A227"],
  ["#5B2621", "#E1523E"],
  ["#C9A227", "#F5EFE6"],
];

export function AddStorySheet({ onClose }: { onClose: () => void }) {
  const t = useT();
  const { addStory } = useAppActions();
  const [caption, setCaption] = useState("");
  const [colorIdx, setColorIdx] = useState(0);
  const [image, setImage] = useState<string | undefined>();
  const fileRef = useRef<HTMLInputElement>(null);
  const pick = async (f?: File | null) => {
    if (!f || !f.type.startsWith("image/")) return;
    try { setImage(await readImage(f, 900)); } catch { /* تجاهل */ }
  };

  const publish = () => {
    if (!caption.trim() && !image) return;
    const [from, to] = PALETTE[colorIdx];
    addStory(caption.trim(), from, to, image);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 sm:items-center">
      <div className="w-full max-w-[380px] rounded-t-2xl bg-rachat-card p-5 sm:rounded-2xl">
        <p className="mb-3 font-extrabold text-rachat-papyrus">{t("قصة جديدة", "New story")}</p>
        <div
          className="relative mb-3 flex h-40 items-center justify-center overflow-hidden rounded-xl px-4 text-center text-sm font-bold text-white"
          style={{ background: image ? `center / cover url(${image})` : `linear-gradient(135deg, ${PALETTE[colorIdx][0]}, ${PALETTE[colorIdx][1]})` }}
        >
          {image && <span className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />}
          <span className="relative drop-shadow">{caption || (image ? "" : t("اكتب نص القصة هنا…", "Write your story text here…"))}</span>
          {image && (
            <button onClick={() => setImage(undefined)} aria-label={t("إزالة الصورة", "Remove photo")} className="absolute end-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50"><X size={14} /></button>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
        <button onClick={() => fileRef.current?.click()} className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-rachat-black py-2.5 text-xs font-bold text-rachat-papyrus">
          <ImagePlus size={16} className="text-rachat-coral" /> {image ? t("تغيير الصورة", "Change photo") : t("إضافة صورة", "Add photo")}
        </button>
        <div className="mb-4 flex gap-2">
          {PALETTE.map(([from, to], i) => (
            <button
              key={i}
              aria-label={`${t("لون", "Color")} ${i + 1}`}
              onClick={() => setColorIdx(i)}
              className={`h-7 w-7 rounded-full ${colorIdx === i ? "ring-2 ring-rachat-papyrus" : ""}`}
              style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
            />
          ))}
        </div>
        <textarea
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          maxLength={80}
          rows={2}
          placeholder={t("اكتب حالتك…", "Write your status…")}
          className="mb-4 w-full resize-none rounded-xl bg-rachat-black px-3 py-2 text-sm text-rachat-papyrus outline-none placeholder:text-neutral-600"
        />
        <div className="flex gap-2.5">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl border border-rachat-maroon py-2.5 text-sm text-neutral-400"
          >
            {t("إلغاء", "Cancel")}
          </button>
          <button
            onClick={publish}
            className="flex-[2] rounded-xl bg-gradient-to-br from-rachat-red to-rachat-coral py-2.5 text-sm font-bold text-white"
          >
            {t("نشر", "Post")}
          </button>
        </div>
      </div>
    </div>
  );
}

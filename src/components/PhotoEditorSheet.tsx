import { useEffect, useRef, useState } from "react";
import { RotateCw, X, ZoomIn } from "lucide-react";
import { useT } from "../i18n";

const OUT = 480; // مقاس الصورة النهائية (مربعة)
const MIN_Z = 1;
const MAX_Z = 4;

/**
 * محرّر صورة البروفايل: قصّ دائري مع تحريك وتكبير وتدوير.
 * بيطلع صورة مربعة (JPEG) عشان ما تتهرسش في الدوائر.
 */
export function PhotoEditorSheet({ src, onCancel, onDone }: { src: string; onCancel: () => void; onDone: (dataUrl: string) => void }) {
  const t = useT();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rot, setRot] = useState(0); // 0 / 90 / 180 / 270
  const [off, setOff] = useState({ x: 0, y: 0 }); // إزاحة بالنسبة لمركز الإطار
  const [err, setErr] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const i = new Image();
    i.onload = () => setImg(i);
    i.onerror = () => setErr(true);
    i.src = src;
  }, [src]);

  // أبعاد الصورة بعد التدوير
  const swapped = rot % 180 !== 0;
  const iw = img ? (swapped ? img.height : img.width) : 1;
  const ih = img ? (swapped ? img.width : img.height) : 1;
  /** أقل تكبير يغطّي الإطار بالكامل (عشان ما يبانش فراغ في الركن) */
  const cover = Math.max(OUT / iw, OUT / ih);

  /** يمنع الصورة تسيب الإطار */
  const clamp = (o: { x: number; y: number }, z: number) => {
    const w = iw * cover * z, h = ih * cover * z;
    const mx = Math.max(0, (w - OUT) / 2), my = Math.max(0, (h - OUT) / 2);
    return { x: Math.min(mx, Math.max(-mx, o.x)), y: Math.min(my, Math.max(-my, o.y)) };
  };

  useEffect(() => { setOff((o) => clamp(o, zoom)); /* eslint-disable-next-line */ }, [zoom, rot, img]);

  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current || !boxRef.current) return;
    const scale = OUT / boxRef.current.clientWidth; // الإطار معروض أصغر من 480
    setOff(clamp({ x: drag.current.ox + (e.clientX - drag.current.x) * scale, y: drag.current.oy + (e.clientY - drag.current.y) * scale }, zoom));
  };
  const onUp = () => { drag.current = null; };

  const apply = () => {
    if (!img) return;
    const c = document.createElement("canvas");
    c.width = OUT; c.height = OUT;
    const g = c.getContext("2d")!;
    g.fillStyle = "#14100F";
    g.fillRect(0, 0, OUT, OUT);
    g.translate(OUT / 2 + off.x, OUT / 2 + off.y);
    g.rotate((rot * Math.PI) / 180);
    g.scale(cover * zoom, cover * zoom);
    g.drawImage(img, -img.width / 2, -img.height / 2);
    onDone(c.toDataURL("image/jpeg", 0.88));
  };

  // معاينة بنفس حسابات الـ canvas، بس بمقياس الإطار المعروض
  const preview: React.CSSProperties = img
    ? { transform: `translate(-50%, -50%) translate(${(off.x / OUT) * 100}%, ${(off.y / OUT) * 100}%) rotate(${rot}deg) scale(${cover * zoom})`, width: img.width, height: img.height }
    : {};

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/85 sm:items-center" role="dialog" aria-modal="true" aria-label={t("تعديل الصورة", "Edit photo")}>
      <div className="w-full max-w-[380px] rounded-t-2xl bg-rachat-card p-5 sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <p className="font-extrabold text-rachat-papyrus">{t("تعديل الصورة", "Edit photo")}</p>
          <button onClick={onCancel} aria-label={t("إغلاق", "Close")} className="text-neutral-500"><X size={18} /></button>
        </div>

        {err ? (
          <p role="alert" className="py-10 text-center text-sm text-rachat-coral">{t("تعذّر فتح الصورة", "Couldn't open this image")}</p>
        ) : (
          <>
            <div
              ref={boxRef}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
              className="relative mx-auto aspect-square w-full max-w-[280px] cursor-grab touch-none overflow-hidden rounded-full bg-rachat-black ring-2 ring-rachat-gold/60 active:cursor-grabbing"
            >
              {img && <img src={src} alt="" draggable={false} className="absolute left-1/2 top-1/2 max-w-none select-none" style={preview} />}
            </div>
            <p className="mt-2.5 text-center text-[11px] text-neutral-500">{t("اسحب الصورة لتحريكها", "Drag the photo to move it")}</p>

            <div className="mt-4 flex items-center gap-3">
              <ZoomIn size={16} className="shrink-0 text-neutral-500" />
              <input
                type="range" min={MIN_Z} max={MAX_Z} step={0.01} value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                aria-label={t("تكبير", "Zoom")}
                className="h-1.5 w-full accent-rachat-red"
              />
              <button onClick={() => setRot((r) => (r + 90) % 360)} aria-label={t("تدوير", "Rotate")} title={t("تدوير", "Rotate")} className="shrink-0 rounded-lg bg-rachat-black p-2 text-rachat-papyrus">
                <RotateCw size={16} />
              </button>
            </div>

            <div className="mt-5 flex gap-2.5">
              <button onClick={onCancel} className="flex-1 rounded-xl bg-rachat-black py-2.5 text-sm font-bold text-neutral-300">{t("إلغاء", "Cancel")}</button>
              <button onClick={apply} disabled={!img} className="flex-1 rounded-xl bg-rachat-red py-2.5 text-sm font-bold text-white disabled:opacity-50">{t("حفظ", "Save")}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

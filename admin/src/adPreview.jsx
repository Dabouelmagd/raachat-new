import React, { useState } from "react";
import { GRADS } from "./data.js";
import { n } from "./ui.jsx";

/**
 * **معاينة الإعلان بمقاس الموضع نفسه.**
 *
 * المعاينة القديمة كانت مقاسين مرسومين بإيدينا (بانر ونافذة) **مش متعلّقين
 * بمقاسات المواضع الحقيقية** في `AdPlacement` — فالمراجع بيشوف شكلًا تقريبيًا،
 * وأي تغيير في مقاس موضع من تبويب «المواضع» مابيبانش هنا خالص.
 *
 * دلوقتي كل موضع **مختار في الحملة** بيترسم بنسبته الحقيقية (`width/height`)،
 * ومكتوب تحته المقاس بالبكسل ونسبة التصغير — لأن ١٠٨٠×١٩٢٠ مستحيل تتعرض
 * بحجمها الطبيعي جوه لوحة، فالصدق إننا نقول «بتصغير ×كام» بدل ما ندّعي
 * إنها بالحجم الأصلي.
 *
 * **وأهم حاجة فيها: التحذير من القطع.** الصورة بتتعرض `object-fit: cover`
 * (زي التطبيق بالظبط)، فصورة بنسبة مختلفة عن الموضع **بتتقصّ** — واللوجو أو
 * السعر في طرف الصورة بيضيع من غير ما حد ياخد باله. فالمعاينة بتقرا مقاس
 * الصورة الحقيقي من المتصفح وتحذّر قبل الاعتماد.
 */

/** أقصى عرض للمربع في اللوحة: العريض ياخد ٣٢٠px والطولي ١٧٦px عشان الاتنين يبانوا. */
const boxWidth = (p) => (p.width >= p.height ? 320 : 176);

/** نسبة أبعاد مقرّبة («١٦:٩») للمقارنة والعرض. */
const ratio = (w, h) => (w && h ? w / h : 0);

function CropWarn({ img, p }) {
  if (!img) return null;
  const rp = ratio(p.width, p.height), ri = ratio(img.w, img.h);
  if (!rp || !ri) return null;
  const off = Math.abs(ri - rp) / rp;
  if (off < 0.04) return <div style={{ color: "var(--good)", fontSize: 11 }}>✓ مقاس الصورة مطابق للموضع</div>;
  // الأعرض من الموضع بتتقص من الجناب، والأطول بتتقص من فوق وتحت
  const side = ri > rp ? "من الجنب" : "من فوق وتحت";
  return (
    <div role="alert" style={{ color: "var(--bad)", fontSize: 11 }}>
      ⚠ الصورة <span dir="ltr">{n(img.w)}×{n(img.h)}</span> — نسبتها مختلفة عن الموضع، فهتتقصّ {side}. الأفضل ترفعيها بمقاس <span dir="ltr">{n(p.width)}×{n(p.height)}</span>.
    </div>
  );
}

/** مربع واحد: الموضع بنسبته، وجواه الصورة أو التصميم المتدرّج بالنص. */
function PlacementBox({ p, c, onImg }) {
  const [img, setImg] = useState(null);
  const bg = GRADS[c.grad]?.[1] || GRADS[0][1];
  const w = boxWidth(p);
  const h = Math.round((w * p.height) / p.width) || w;
  const scale = p.width ? w / p.width : 1;
  const wide = p.width >= p.height;
  return (
    <div style={{ minWidth: w }}>
      <div className="tag" style={{ marginBottom: 6, display: "inline-block" }}>{p.name}</div>
      <div style={{ width: w, height: h, borderRadius: wide ? 14 : 18, background: bg, color: "#fff", overflow: "hidden", position: "relative", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        {c.imageUrl && (
          <img
            src={c.imageUrl}
            alt=""
            onLoad={(e) => { const v = { w: e.target.naturalWidth, h: e.target.naturalHeight }; setImg(v); onImg?.(v); }}
            onError={() => { setImg(null); onImg?.(null); }}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}
        {/* نفس التعتيم المتدرّج اللي في التطبيق عشان النص يفضل مقروءًا فوق الصورة */}
        {c.imageUrl && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #000e, #0005)" }} />}
        <div style={{ position: "relative", padding: wide ? "8px 10px" : "10px 11px" }}>
          <div style={{ fontSize: 8, opacity: .8 }}>
            <b style={{ background: "#0006", color: "#C9A227", borderRadius: 3, padding: "0 4px" }}>إعلان</b> {c.advertiser || "اسم المعلن"}
          </div>
          <div style={{ fontWeight: 800, fontSize: wide ? 12 : 13, lineHeight: 1.45, marginTop: 2 }}>{c.headline || "عنوان الإعلان"}</div>
          <div style={{ fontSize: 9.5, opacity: .85, lineHeight: 1.5 }}>{c.body || "نص مختصر يشرح العرض"}</div>
          <div style={{ background: "#F5EFE6", color: "#14100F", borderRadius: 7, padding: "4px 0", textAlign: "center", fontWeight: 800, fontSize: 10, marginTop: 6 }}>{c.cta || "زر"}</div>
        </div>
      </div>
      <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 5 }}>
        <span dir="ltr">{n(p.width)}×{n(p.height)}</span> px · معروضة بتصغير <span dir="ltr">×{(1 / scale).toFixed(1).replace(/\d/g, (d) => n(+d))}</span>
      </div>
      {c.imageUrl && <CropWarn img={img} p={p} />}
    </div>
  );
}

/**
 * المعاينة لكل المواضع المختارة. لو مفيش موضع مختار بتعرض المواضع النشطة كلها
 * عشان المراجع يشوف المقاسات المتاحة قبل ما يختار.
 */
export function AdPreview({ c, placements }) {
  const picked = placements.filter((p) => c.placements.includes(p.key));
  const show = picked.length ? picked : placements.filter((p) => p.active);
  if (!show.length) return <div className="empty">مفيش مواضع</div>;
  return (
    <>
      {!picked.length && <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 10 }}>دي كل المواضع النشطة — اختاري موضع من النموذج والمعاينة تتظبط عليه.</div>}
      <div className="row" style={{ gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
        {show.map((p) => <PlacementBox key={p.key} p={p} c={c} />)}
      </div>
      {!c.imageUrl && <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 10 }}>مفيش صورة — الإعلان هيظهر بالتصميم المتدرّج والنص وحده.</div>}
    </>
  );
}

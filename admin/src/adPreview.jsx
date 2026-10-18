import React, { useState } from "react";
import { GRADS } from "./data.js";
import { n } from "./ui.jsx";
import { toAbs, uploadAdImage } from "./api.js";

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

/**
 * مربع واحد: الموضع بنسبته، وجواه صورته هو أو التصميم المتدرّج بالنص.
 *
 * **ورفع الصورة هنا مش في النموذج** — كل موضع مقاسه مختلف، فالمكان الطبيعي
 * للرفع هو جنب المقاس المطلوب وتحذير القطع، مش خانة واحدة لكل المواضع.
 *
 * 🔴 **والموضع اللي لسه مش في الحملة بياخد زرار اختيار مش فراغ.** الرفع
 * بيتطلّب إن الموضع يكون محجوزًا في الحملة (الصورة بتتخزن على `AdBooking`)،
 * فالمربع غير المختار مالوش زرار رفع — واللي بيتبلّغ إن «زرار الابلود
 * مابيظهرش» هو ده بالظبط. فبدل ما نسيب الشرط مخفيًا ونكتب تحته سطرًا رماديًا،
 * المربع نفسه بيعرض «اختاري الموضع ده» وبيحجزه بضغطة، والرفع بيظهر فورًا.
 */
function PlacementBox({ p, c, onPick, canUpload, onToggle }) {
  const [img, setImg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // صورة الموضع، وإلا صورة الحملة (الحملات القديمة) — نفس ترتيب السيرفر
  const url = c.images?.[p.key] || c.imageUrl || "";
  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = ""; // عشان اختيار نفس الملف تاني يشتغل
    if (!f) return;
    setErr(""); setBusy(true);
    try { onPick(p.key, (await uploadAdImage(f)).url); setImg(null); }
    catch (x) { setErr(x.message || "تعذّر رفع الصورة"); }
    finally { setBusy(false); }
  };
  const bg = GRADS[c.grad]?.[1] || GRADS[0][1];
  const w = boxWidth(p);
  const h = Math.round((w * p.height) / p.width) || w;
  const scale = p.width ? w / p.width : 1;
  const wide = p.width >= p.height;
  return (
    <div style={{ minWidth: w }}>
      <div className="tag" style={{ marginBottom: 6, display: "inline-block" }}>{p.name}</div>
      <div style={{ width: w, height: h, borderRadius: wide ? 14 : 18, background: bg, color: "#fff", overflow: "hidden", position: "relative", display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        {url && (
          <img
            src={toAbs(url)}
            alt=""
            onLoad={(e) => setImg({ w: e.target.naturalWidth, h: e.target.naturalHeight })}
            onError={() => setImg(null)}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
        )}
        {/* نفس التعتيم المتدرّج اللي في التطبيق عشان النص يفضل مقروءًا فوق الصورة */}
        {url && <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, #000e, #0005)" }} />}
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
      {url && <CropWarn img={img} p={p} />}
      {canUpload ? (
        <div className="row" style={{ gap: 6, marginTop: 6 }}>
          <label className="btn sm" style={{ cursor: busy ? "progress" : "pointer" }}>
            {busy ? "جاري الرفع…" : url ? "استبدال" : "ارفعي صورة"}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={pick} disabled={busy} style={{ display: "none" }} />
          </label>
          {c.images?.[p.key] && !busy && <button type="button" className="btn sm" onClick={() => { onPick(p.key, null); setImg(null); setErr(""); }}>شيل</button>}
        </div>
      ) : onToggle ? (
        <div className="row" style={{ gap: 6, marginTop: 6 }}>
          <button type="button" className="btn sm" onClick={() => onToggle(p.key)}>اختاري الموضع ده عشان ترفعي صورته</button>
        </div>
      ) : null}
      {err && <div role="alert" style={{ color: "var(--bad)", fontSize: 11, marginTop: 4 }}>{err}</div>}
    </div>
  );
}

/**
 * المعاينة لكل المواضع المختارة. لو مفيش موضع مختار بتعرض المواضع النشطة كلها
 * عشان المراجع يشوف المقاسات المتاحة قبل ما يختار.
 */
export function AdPreview({ c, placements, onPick, onToggle }) {
  const picked = placements.filter((p) => c.placements.includes(p.key));
  const show = picked.length ? picked : placements.filter((p) => p.active);
  if (!show.length) return <div className="empty">مفيش مواضع</div>;
  const none = !c.imageUrl && !Object.keys(c.images || {}).length;
  return (
    <>
      {!picked.length
        ? <div role="status" style={{ border: "1px solid var(--gold)", borderRadius: 10, padding: "8px 10px", fontSize: 12, marginBottom: 10 }}>
            <b>الرفع بيظهر بعد اختيار الموضع.</b> كل موضع بيتحجز في الحملة وبعدين بتترفع صورته بمقاسه — اختاري موضع من تحت (أو من «المواضع المحجوزة» في النموذج) وزرار «ارفعي صورة» يبان تحته.
          </div>
        : <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 10 }}>لكل موضع صورته بمقاسه — ارفعي صورة تحت كل واحد.</div>}
      <div className="row" style={{ gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
        {show.map((p) => <PlacementBox key={p.key} p={p} c={c} onPick={onPick} onToggle={onToggle} canUpload={!!onPick && c.placements.includes(p.key)} />)}
      </div>
      {none && <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 10 }}>مفيش صور — الإعلان هيظهر بالتصميم المتدرّج والنص وحده.</div>}
    </>
  );
}

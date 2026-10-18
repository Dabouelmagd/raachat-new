import React, { useEffect, useMemo, useState } from "react";
import { Card, Kpi, Table, Pill, Switch, n, egp, useAdmin } from "./ui.jsx";
import { GRADS } from "./data.js";
import { api, toAbs } from "./api.js";
import { AdPreview } from "./adPreview.jsx";
import { useMe, useLoad, Err, Confirm, useDo } from "./live.jsx";
import { clearDraft, draftHasWork, draftKey, loadDraft, saveDraft } from "./draft.js";

const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (s, k) => iso(new Date(+new Date(s + "T00:00:00Z") + k * 864e5));
const dnum = (s) => n(+s.slice(8));
const AR_LATN = "ar-EG-u-nu-latn";
/**
 * 🔴 **الخريطة كانت جدار من ٣٠ عمود بلا أي علامة.** العين مالهاش حاجة
 * ترسّي عليها، فعد الأعمدة عشان توصل ليوم معيّن كان شغلًا بالإصبع على
 * الشاشة. الحرف ده (ح · ن · ث …) بيدي إيقاعًا أسبوعيًا، والجمعة والسبت
 * بيتظللوا — فالأسبوع بقى وحدة مرئية بدل شريط متصل.
 */
const wday = (s) => new Date(s + "T00:00:00Z").toLocaleDateString(AR_LATN, { weekday: "narrow", timeZone: "UTC" });
const isWeekend = (s) => [5, 6].includes(new Date(s + "T00:00:00Z").getUTCDay()); // الجمعة والسبت
const mon = (s) => new Date(s + "T00:00:00Z").toLocaleDateString("ar-EG-u-nu-latn", { month: "long", timeZone: "UTC" });
const fdate = (s) => new Date(s + "T00:00:00Z").toLocaleDateString("ar-EG-u-nu-latn", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const KINDS = { modal: "نافذة كاملة", banner: "بانر", story: "ستوري", room: "غرفة صوتية" };
const WHY = { inactive: "الموضع متوقف", blocked: "الموضع مقفول", full: "مفيش مكان فاضي" };
const Size = ({ p }) => {
  const k = 22 / Math.max(p.width, p.height);
  return <span className="ratio" style={{ width: Math.max(6, p.width * k), height: Math.max(6, p.height * k) }} aria-hidden="true" />;
};
/**
 * 🔴 **البيع بالشهر** (قرار داليا ١٩ أكتوبر ٢٠٢٦) — والشهر = 30 يوم بالظبط،
 * نفس `MONTH_DAYS` على السيرفر. مفيش نص شهر: المعلن بيشتري شهرًا أو أكتر.
 *
 * والفترة **شاملة الطرفين**، فنهاية N شهر = البداية + N×30 − 1. وأكواد
 * الهدايا مشتقّة من نفس الرقم على السيرفر، فمستحيل يفترقوا (قبل كده كانت
 * «سنة» 365 هنا و360 هناك، فحملة سنة بهدية سنة تسيب يومًا بفلوس — ٩٢٠ ج.م).
 */
const MONTH_DAYS = 30;
const MAX_MONTHS = 12;
const DURATIONS = [[1, "شهر"], [3, "3 شهور"], [6, "6 شهور"], [12, "سنة"]];
const endOfMonths = (start, months) => addDays(start, months * MONTH_DAYS - 1);
/** أيام الفترة شاملة الطرفين، أو 0 لو الفترة غلط */
const dayCount = (start, end) => {
  if (!start || !end || end < start) return 0;
  return Math.round((+new Date(end + "T00:00:00Z") - +new Date(start + "T00:00:00Z")) / 864e5) + 1;
};
/** شهور الفترة، أو null لو مش شهورًا كاملة (حملة قديمة اتعملت قبل القرار) */
const monthsOf = (start, end) => {
  const d = dayCount(start, end);
  return d > 0 && d % MONTH_DAYS === 0 ? d / MONTH_DAYS : null;
};
/**
 * نسب العرض الجاهزة — **اختيارات بس، والرقم بيتكتب بالإيد** لأن الخصم
 * بيتفق عليه لكل حملة وكل عميل على حدة (قرار داليا ١٨ أكتوبر ٢٠٢٦).
 */
const OFFERS = [0, 5, 10, 15, 20, 25, 30, 50];

/**
 * 🔴 **الخريطة لازم تظلّل المحجوز قدّام كل موضع** (بطلب داليا ١٩ أكتوبر ٢٠٢٦).
 *
 * الأرقام في الخانات بتقول «فاضي كام» — بس **مين** حاجز و**من إمتى لإمتى**
 * كان لازم يتجمّع بالعين من صفّ أرقام. الشريط بيقول الاتنين في نظرة.
 *
 * والشرايط المتداخلة بتتوزّع على سطور (الموضع فيه أكتر من مكان، فحملتان في
 * نفس اليوم شيء طبيعي) — من غير التوزيع كانت هتركب على بعضها وتخفي واحدة.
 */
function packRows(items) {
  const rows = [];
  for (const it of items.slice().sort((a, b) => a.s - b.s || a.e - b.e)) {
    let r = rows.find((row) => row[row.length - 1].e < it.s);
    if (!r) { r = []; rows.push(r); }
    r.push(it);
  }
  return rows;
}

/** صورة الصفّ في الطابور: أول صورة موضع موجودة، وإلا صورة الحملة (القديمة). */
const rowImage = (c) => Object.values(c.images || {})[0] || c.imageUrl || "";
const blank = (start) => ({ id: "", advertiser: "", headline: "", body: "", cta: "اعرف أكتر", link: "https://", grad: 0, audience: "كل المستخدمين", priority: 2, dailyCap: 3, note: "", start, end: endOfMonths(start, 1), placements: [], approve: false, giftCode: "", imageUrl: "", images: {}, offerPct: 0, house: false });

/* ---------- خريطة المخزون ---------- */
function InventoryMap({ data, from, setFrom, span, setSpan, today, onPick, can }) {
  /**
   * 🔴 **ضغطة واحدة = يوم البداية.** الاختيار كان بضغطتين (بداية ثم نهاية)،
   * وده ماعادش له معنى بعد قرار البيع بالشهر: النهاية **محسوبة** من عدد
   * الشهور، فضغطتان كانا بيسمحان بفترة مش شهورًا كاملة والسيرفر يرفضها
   * بـ٤٠٠ بعد كل الشغل. فالبداية من الخريطة والمدة من القايمة.
   */
  const [sel, setSel] = useState(null); // { key, a }
  const [selMonths, setSelMonths] = useState(1);
  const selEnd = sel && endOfMonths(sel.a, selMonths);
  const cellState = (p, c) => !p.active ? "off" : c.blocked ? "blk" : c.free === 0 ? "full" : c.free < p.slots ? "part" : "free";
  const click = (p, c) => {
    if (c.day < today) return;
    setSel({ key: p.key, a: c.day });
  };
  const inSel = (p, d) => sel && sel.key === p.key && d >= sel.a && d <= selEnd;
  /**
   * شرايط المحجوز لكل موضع: حملة لكل شريط + الأقفال. الحدود **بتتقصّ على
   * الفترة المعروضة** (`clamp`) — الحملة اللي بدأت قبل النافذة لازم شريطها
   * يبدأ من أولها مش من مكان سالب، وإلا الشريط يخرج برّه الجدول ويختفي.
   */
  const idx = (d) => data.days.indexOf(d);
  const last = data.days.length - 1;
  const bars = (p) => {
    const span = (from, to) => {
      const s = from <= data.days[0] ? 0 : idx(from);
      const e = to >= data.days[last] ? last : idx(to);
      return s < 0 || e < 0 || e < s ? null : { s, e };
    };
    const out = [];
    for (const c of p.campaigns || []) {
      const r = span(c.start, c.end);
      if (r) out.push({ ...r, id: `c${c.id}`, kind: c.status === "approved" ? "ok" : c.status === "paused" ? "paused" : "hold", label: c.advertiser,
        title: `${c.advertiser} — ${fdate(c.start)} إلى ${fdate(c.end)} · ${c.status === "approved" ? "معتمدة" : c.status === "paused" ? "متوقفة" : "بانتظار الموافقة"}` });
    }
    for (const b of p.blocks || []) {
      const r = span(b.from, b.to);
      if (r) out.push({ ...r, id: `b${b.id}`, kind: "blk", label: b.reason || "مقفول", title: `مقفول — ${fdate(b.from)} إلى ${fdate(b.to)}${b.reason ? ` · ${b.reason}` : ""}` });
    }
    return packRows(out);
  };
  return (
    <Card title="خريطة المخزون" right={
      <div className="row">
        <button className="btn sm" onClick={() => setFrom(addDays(from, -span))} aria-label="الفترة السابقة">→</button>
        <input className="inp" type="date" aria-label="من تاريخ" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} />
        <button className="btn sm" onClick={() => setFrom(addDays(from, span))} aria-label="الفترة التالية">←</button>
        <button className="btn sm" onClick={() => setFrom(today)}>النهارده</button>
        <select className="inp" aria-label="المدة" value={span} onChange={(e) => setSpan(+e.target.value)}><option value="14">14 يوم</option><option value="30">30 يوم</option><option value="60">60 يوم</option></select>
      </div>}>
      {/* الشرح فوق الخريطة مش تحتها: الرقم في الخانة مابيشرحش نفسه، وقراءة
          ٣٠ خانة قبل ما توصلي لسطر في وسيلة الإيضاح بيخلّي الأرقام تتقري غلط */}
      <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 8 }}>
        الرقم في كل خانة = <b>الأماكن الفاضية</b> في اليوم ده، والشريط تحته = <b>المحجوز</b> باسم المعلن ومدّته. اضغطي على <b>يوم البداية</b> واختاري عدد الشهور — البيع بالشهر، والشهر = {n(MONTH_DAYS)} يوم.
      </div>
      <div className="imap" role="region" aria-label="خريطة مخزون الإعلانات" tabIndex={0}>
        <table>
          <thead><tr>
            <th className="pl">الموضع</th>
            {data.days.map((d, i) => (
              <th key={d} className={`dh${d === today ? " today" : ""}${d.endsWith("-01") || i === 0 ? " mo" : ""}${isWeekend(d) ? " we" : ""}`}>
                {(d.endsWith("-01") || i === 0) && <div style={{ color: "var(--gold)" }}>{mon(d)}</div>}
                <div style={{ fontSize: 9, opacity: .65, fontWeight: 500 }}>{wday(d)}</div>
                {dnum(d)}
              </th>
            ))}
            <th className="sumcol">متاح للفترة كلها</th>
          </tr></thead>
          <tbody>
            {data.placements.flatMap((p) => [
              <tr key={p.key}>
                <td className="pl">
                  <div className="row" style={{ flexWrap: "nowrap", gap: 8 }}><Size p={p} /><b>{p.name}</b></div>
                  <div style={{ color: "var(--muted)", fontSize: 11 }}><span dir="ltr">{n(p.width)}×{n(p.height)}</span> · {n(p.slots)} أماكن · {egp(p.pricePerMonth)}/شهر</div>
                </td>
                {p.cells.map((c) => {
                  const st = cellState(p, c);
                  const tip = `${p.name} — ${fdate(c.day)}\n${!p.active ? "الموضع متوقف" : c.blocked ? "مقفول" : `متاح ${n(c.free)} من ${n(p.slots)}`}${c.booked ? ` · مؤكد ${n(c.booked)}` : ""}${c.held ? ` · بانتظار الموافقة ${n(c.held)}` : ""}`;
                  return <td key={c.day}><button type="button" title={tip} aria-label={tip.replace("\n", " ")} className={`c ${st}${c.held ? " held" : ""}${inSel(p, c.day) ? " sel" : ""}${c.day < today ? " past" : ""}${isWeekend(c.day) ? " we" : ""}`} onClick={() => click(p, c)}>{st === "blk" ? "✕" : st === "off" ? "—" : n(c.free)}</button></td>;
                })}
                {/* ملخّص الصفّ: من غيره لازم تعدّي بعينك على ٣٠ خانة عشان تعرف
                    الموضع ده فيه مكان ولا لأ — وده السؤال اللي بيتباع عليه */}
                <td className="sumcol">
                  {(() => {
                    // أقل عدد فاضي في الفترة = اللي ينفع يتباع للمدة كلها
                    const open = p.active ? p.cells.reduce((m, c) => Math.min(m, c.free), p.slots) : 0;
                    return <><b style={{ color: open ? "var(--good)" : "var(--bad)" }}>{n(open)}</b><span style={{ color: "var(--muted)" }}> / {n(p.slots)} مكان</span></>;
                  })()}
                </td>
              </tr>,
              ...bars(p).map((row, ri) => (
                <tr key={`${p.key}-bar-${ri}`} className="barrow">
                  <td className="pl">{ri === 0 && <span style={{ color: "var(--muted)", fontSize: 11 }}>المحجوز</span>}</td>
                  <td colSpan={p.cells.length}>
                    <div className="track">
                      {row.map((b) => (
                        <div key={b.id} className={`bar ${b.kind}`} title={b.title}
                          style={{ insetInlineStart: `${(b.s / p.cells.length) * 100}%`, width: `${((b.e - b.s + 1) / p.cells.length) * 100}%` }}>
                          <span>{b.label}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="sumcol" />
                </tr>
              )),
            ])}
          </tbody>
        </table>
      </div>
      <div className="legend">
        <span><i style={{ background: "color-mix(in srgb,var(--good) 34%,transparent)" }} />متاح بالكامل</span>
        <span><i style={{ background: "color-mix(in srgb,var(--warn) 42%,transparent)" }} />متاح جزئيًا</span>
        <span><i style={{ background: "color-mix(in srgb,var(--bad) 46%,transparent)" }} />ممتلئ</span>
        <span><i className="c blk" style={{ width: 14 }} />مقفول</span>
        <span><i style={{ boxShadow: "inset 0 -3px 0 var(--warn)" }} />فيه حجز بانتظار الموافقة</span>
        <span><i className="bar ok" style={{ width: 14, position: "static" }} />حجز معتمد</span>
        <span><i className="bar hold" style={{ width: 14, position: "static" }} />بانتظار الموافقة</span>
        <span><i className="bar paused" style={{ width: 14, position: "static" }} />متوقفة</span>
        <span><i style={{ background: "var(--panel2)" }} />الجمعة والسبت</span>
      </div>
      {sel && (
        <div className="row" style={{ marginTop: 12 }} role="status">
          <b>{data.placements.find((p) => p.key === sel.key).name}</b>
          <select className="inp" aria-label="عدد الشهور" value={selMonths} onChange={(e) => setSelMonths(+e.target.value)}>
            {Array.from({ length: MAX_MONTHS }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m === 12 ? "سنة (12 شهر)" : `${m} شهر`}</option>)}
          </select>
          <span>من {fdate(sel.a)} إلى {fdate(selEnd)}</span>
          {can("ads.manage") && <button className="btn pri" onClick={() => onPick({ key: sel.key, start: sel.a, end: selEnd })}>احجز الفترة دي</button>}
          <button className="btn" onClick={() => setSel(null)}>إلغاء التحديد</button>
        </div>
      )}
    </Card>
  );
}

/* ---------- نموذج الحجز / التعديل ---------- */
/**
 * 🔴 **`onBack` مش `onCancel`.** النموذج بيحلّ محلّ شاشة الإعلانات كلها بلا
 * تبويبات، والمخرج الوحيد كان «إلغاء» في آخر نموذج طويل — و«إلغاء» **بيمسح
 * المسوّدة**. فاللي عايزة ترجع تبصّ على الطابور أو المواضع كانت لازم تضيّع
 * اللي كتبته. فالسهم فوق بيخرج من النموذج **والمسوّدة بتفضل محفوظة**، وأول
 * ما ترجعي النموذج بيرجع باللي كان فيه.
 */
function CampaignForm({ draft, placements, onDone, onCancel, onBack }) {
  const run = useDo();
  /**
   * المسوّدة بترجع من `localStorage` **قبل أول رسم** — من غير كده النموذج
   * بيبان فاضيًا لحظة ثم يتملا، والمستخدم يبدأ يكتب فوق حاجة لسه جاية.
   * وبنبدأ من `draft` الجايّة من السيرفر وندمج فوقها، فأي حقل جديد في
   * النموذج ياخد قيمته الافتراضية بدل `undefined` من مسوّدة قديمة.
   */
  const key = draftKey(draft.id);
  const [c, setC] = useState(() => {
    const saved = loadDraft(key);
    return saved && draftHasWork(saved, draft) ? { ...draft, ...saved, id: draft.id } : draft;
  });
  const [restored] = useState(() => c !== draft);
  const [q, setQ] = useState(null);
  const [err, setErr] = useState("");
  const isNew = !draft.id;
  const months = monthsOf(c.start, c.end);
  const set = (k, v) => setC((x) => ({ ...x, [k]: v }));
  // الحفظ مع كل تغيير: الكتابة في `localStorage` متزامنة وسريعة، والتأجيل
  // بمؤقّت كان معناه إن إعادة تحميل في اللحظة الغلط تضيّع آخر تعديل
  useEffect(() => { if (draftHasWork(c, draft)) saveDraft(key, c); }, [c, key, draft]);
  const reset = () => { clearDraft(key); setC(draft); setQ(null); setErr(""); };
  const toggle = (k) => set("placements", c.placements.includes(k) ? c.placements.filter((x) => x !== k) : [...c.placements, k]);
  useEffect(() => {
    if (!c.placements.length || !c.start || !c.end || c.end < c.start) { setQ(null); return; }
    if (c.house) { setQ(null); return; } // بلا حملة = بلا سعر، فمفيش تسعيرة تتجاب
    let live = true;
    const t = setTimeout(() => api("/admin/ads/quote", { method: "POST", body: { placements: c.placements, start: c.start, end: c.end, excludeId: c.id || undefined, giftCode: c.giftCode || undefined, offerPct: +c.offerPct || 0 } }).then((r) => live && setQ(r)).catch((e) => live && setQ({ error: e.message })), 250);
    return () => { live = false; clearTimeout(t); };
  }, [c.placements, c.start, c.end, c.id, c.giftCode, c.offerPct, c.house]);
  const submit = async (e) => {
    e.preventDefault();
    if (!c.placements.length) return setErr("اختار موضع واحد على الأقل");
    if (!c.house && c.end < c.start) return setErr("تاريخ النهاية قبل تاريخ البداية");
    // الفترة شهور كاملة — الحملة القديمة (شهور = null) تفضل متعدّلة طول ما
    // تواريخها ما اتغيّرتش، فالفحص على الجديدة وعلى اللي اتغيّرت مدتها بس
    if (!c.house && months === null && (isNew || c.start !== draft.start || c.end !== draft.end)) return setErr(`المدة لازم تكون شهورًا كاملة (الشهر = ${MONTH_DAYS} يوم)`);
    setErr("");
    const body = { advertiser: c.advertiser, headline: c.headline, body: c.body, cta: c.cta, link: c.link, grad: +c.grad, audience: c.audience, priority: +c.priority, dailyCap: +c.dailyCap, note: c.note || undefined, start: c.start, end: c.end, placements: c.placements, giftCode: c.giftCode || undefined, imageUrl: c.imageUrl || null, offerPct: +c.offerPct || 0,
      // المواضع اللي اتشالت من الحملة مش بيتبعت لها صورة — السيرفر بيرفض موضع مش منها
      images: Object.fromEntries(c.placements.map((k) => [k, c.images?.[k] ?? null])) };
    const r = await run(() => isNew ? api("/admin/ads/campaigns", { method: "POST", body: { ...body, approve: c.approve, house: !!c.house, ...(c.house ? { start: undefined, end: undefined, giftCode: undefined, offerPct: 0 } : {}) } }) : api(`/admin/ads/campaigns/${c.id}`, { method: "PATCH", body }), isNew ? `تم حجز حملة ${c.advertiser}` : `تم تعديل حملة ${c.advertiser}`);
    if (r) { clearDraft(key); onDone(); }
  };
  return (
    <div className="grid two">
      <Card title={isNew ? "حجز حملة جديدة" : `تعديل حملة ${c.advertiser}`}>
        {onBack && (
          <div className="row" style={{ marginBottom: 10 }}>
            <button type="button" className="btn sm" aria-label="رجوع للإعلانات" onClick={onBack}>→ رجوع للإعلانات</button>
            <span style={{ color: "var(--muted)", fontSize: 11 }}>الرجوع مابيضيّعش اللي كتبتيه — المسوّدة بتفضل محفوظة</span>
          </div>
        )}
        <form className="grid" style={{ gap: 12 }} onSubmit={submit}>
          <div className="form">
            <label className="f">اسم المعلن<input className="inp" required minLength={2} value={c.advertiser} onChange={(e) => set("advertiser", e.target.value)} /></label>
            <label className="f">عنوان الإعلان<input className="inp" required minLength={2} maxLength={50} value={c.headline} onChange={(e) => set("headline", e.target.value)} /></label>
          </div>
          <label className="f">النص<textarea className="inp" rows="2" maxLength={110} value={c.body} onChange={(e) => set("body", e.target.value)} /></label>
          <div className="form">
            <label className="f">نص الزر<input className="inp" maxLength={16} value={c.cta} onChange={(e) => set("cta", e.target.value)} /></label>
            <label className="f">رابط الوجهة (https)<input className="inp" dir="ltr" required pattern="https://\S+" value={c.link} onChange={(e) => set("link", e.target.value)} /></label>
          </div>
          <div className="f">الخلفية
            <div className="row">{GRADS.map(([name, g], i) => <button type="button" key={name} aria-label={name} aria-pressed={c.grad === i} onClick={() => set("grad", i)} style={{ width: 36, height: 36, borderRadius: 10, background: g, border: c.grad === i ? "2px solid var(--gold)" : "2px solid transparent", outlineOffset: 2 }} />)}</div></div>
          <div className="f">صور الإعلان (اختيارية)
            <span style={{ color: "var(--muted)", fontSize: 11 }}>كل موضع مقاسه مختلف، فلكل واحد صورته — اختاري المواضع تحت، والرفع من <b>المعاينة</b> جنبك تحت كل موضع. PNG أو JPG أو WebP أو GIF، لحد 10 ميجا.</span>
          </div>
          <div className="f">المواضع المحجوزة
            <div className="grid" style={{ gap: 8, gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))" }}>
              {placements.map((p) => (
                <button type="button" key={p.key} className="chk" aria-pressed={c.placements.includes(p.key)} onClick={() => toggle(p.key)} disabled={!p.active && !c.placements.includes(p.key)} style={{ textAlign: "start" }}>
                  <Size p={p} /><span><b>{p.name}</b><span style={{ display: "block", color: "var(--muted)", fontSize: 11 }}><span dir="ltr">{n(p.width)}×{n(p.height)}</span> · {egp(p.pricePerMonth)}/شهر{!p.active ? " · متوقف" : ""}</span></span>
                </button>))}
            </div></div>
          {isNew && (
            <div className="li" style={{ border: 0, padding: 0 }}>
              <div>
                <div className="t">إعلان بدون حملة</div>
                {/*
                  بطلب داليا: «ينزل إعلان واحد أو اتنين مش لازم المجموعة كلها».
                  بلا تواريخ ولا سعر ولا حجز — وبيظهر في **الأماكن الفاضية بس**،
                  فمابياخدش من نصيب معلن دافع (الموضع مبيوع بعدد أماكن).
                */}
                <div className="s">بلا تواريخ ولا فاتورة. يظهر في الأماكن الفاضية بس، فمابياخدش من نصيب معلن دافع — ويتوقف في أي وقت من الطابور.</div>
              </div>
              <Switch on={!!c.house} label="إعلان بدون حملة" onChange={(v) => set("house", v)} />
            </div>
          )}
          <div className="form" style={c.house ? { display: "none" } : undefined}>
            <label className="f">تاريخ البداية<input className="inp" type="date" required={!c.house} value={c.start} onChange={(e) => setC((x) => ({ ...x, start: e.target.value, end: endOfMonths(e.target.value, monthsOf(x.start, x.end) ?? 1) }))} /></label>
            {/* 🔴 النهاية **محسوبة** مش مكتوبة: البيع شهور كاملة، وخانة تاريخ حرّة
                بتسمح بفترة مش شهورًا كاملة فالسيرفر يرفضها بـ٤٠٠ **بعد** ما الواحد
                يملا النموذج كله. فالاختيار هو عدد الشهور، والتاريخ عرض للمراجعة. */}
            <label className="f">عدد الشهور
              <select className="inp" value={months ?? ""} onChange={(e) => set("end", endOfMonths(c.start, +e.target.value))}>
                {months === null && <option value="">فترة قديمة ({n(dayCount(c.start, c.end))} يوم)</option>}
                {Array.from({ length: MAX_MONTHS }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m === 12 ? "سنة (12 شهر)" : `${m} شهر`}</option>)}
              </select>
            </label>
            <div className="f">مدة جاهزة
              <div className="row">
                {DURATIONS.map(([m, label]) => (
                  <button type="button" key={m} className="tab" aria-pressed={months === m} onClick={() => set("end", endOfMonths(c.start, m))}>{label}</button>
                ))}
              </div>
              <span style={{ color: "var(--muted)", fontSize: 11 }}>
                الشهر = {n(MONTH_DAYS)} يوم، والفترة شاملة الطرفين — فالنهاية {months === null ? "محتاجة اختيار مدة" : <b>{fdate(c.end)}</b>}. ونفس أيام أكواد الهدايا، فهدية المدة بتغطيها بالكامل.
              </span>
            </div>
            <label className="f">الجمهور<input className="inp" value={c.audience} onChange={(e) => set("audience", e.target.value)} /></label>
            <label className="f">الأولوية<select className="inp" value={c.priority} onChange={(e) => set("priority", e.target.value)}><option value="1">منخفضة</option><option value="2">عادية</option><option value="3">عالية</option></select></label>
            <label className="f">أقصى ظهور للمستخدم يوميًا<input className="inp" type="number" min="1" max="10" value={c.dailyCap} onChange={(e) => set("dailyCap", e.target.value)} /></label>
          </div>
          {!c.house && (
            <div className="f">خصم / عرض
              <div className="row">
                <input className="inp" type="number" min="0" max="100" style={{ maxWidth: 110 }} value={c.offerPct} onChange={(e) => set("offerPct", e.target.value)} aria-label="نسبة الخصم" />
                <span style={{ fontWeight: 700 }}>٪</span>
                {OFFERS.map((p) => <button type="button" key={p} className="tab" aria-pressed={+c.offerPct === p} onClick={() => set("offerPct", p)}>{p === 0 ? "بدون" : `${n(p)}٪`}</button>)}
              </div>
              {/*
                الترتيب مقصود ومكتوب للمستخدم: الهدية بتغطي أيامًا بالكامل،
                والنسبة بتتحسب على **المتبقي بعدها** — خصم على أيام مجانية
                أصلًا مابيوفّرش ولا جنيه، والمعلن كان هيشوف نسبة بلا أثر.
              */}
              <span style={{ color: "var(--muted)", fontSize: 11 }}>بيتحدّد لكل حملة وكل عميل. بيتحسب على المتبقي بعد كود الهدية.</span>
            </div>
          )}
          {!c.house && <label className="f">كود هدية (اختياري)<input className="inp" dir="ltr" placeholder="RA-XXXX-XXXX" value={c.giftCode || ""} onChange={(e) => set("giftCode", e.target.value.toUpperCase())} disabled={!isNew && !!draft.giftCode} />{q?.giftError && <span role="alert" style={{ color: "var(--bad)", fontSize: 12 }}>{q.giftError}</span>}</label>}
          <label className="f">ملاحظات داخلية<input className="inp" maxLength={300} value={c.note || ""} onChange={(e) => set("note", e.target.value)} /></label>
          {isNew && <div className="li" style={{ border: 0, padding: 0 }}><div><div className="t">اعتماد فوري</div><div className="s">من غير مراجعة (لو سبته مقفول الحملة بتستنى الموافقة وتحجز المكان مؤقتًا)</div></div><Switch on={c.approve} label="اعتماد فوري" onChange={(v) => set("approve", v)} /></div>}
          {restored && (
            <div className="li" style={{ alignItems: "center", background: "var(--card2, transparent)" }}>
              <div>
                <div className="t">رجّعنا اللي كنتِ كاتباه</div>
                <div className="s">المسوّدة بتتحفظ على جهازك مع كل تعديل، فإعادة تحميل الصفحة مابتضيّعهاش.</div>
              </div>
              <button type="button" className="btn sm" onClick={reset}>ابدأ من جديد</button>
            </div>
          )}
          {err && <div role="alert" style={{ color: "var(--bad)", fontWeight: 700 }}>{err}</div>}
          <div className="row"><button className="btn pri" type="submit" disabled={(q && q.ok === false) || !!q?.giftError}>{isNew ? "احجز" : "حفظ التعديلات"}</button><button type="button" className="btn" onClick={() => { clearDraft(key); onCancel(); }}>إلغاء</button></div>
        </form>
      </Card>
      <div className="grid" style={{ gap: 14, alignContent: "start" }}>
        <Card title="السعر والتوافر">
          {!q && <div className="empty">اختار المواضع والتواريخ عشان يظهر السعر</div>}
          {q?.error && <Err msg={q.error} />}
          {q && !q.error && (
            <>
              <Table head={["الموضع", "سعر الشهر", "الشهور", "الإجمالي"]}>
                {q.lines.map((l) => <tr key={l.key}><td><b>{l.name}</b></td><td>{egp(l.pricePerMonth)}</td><td>{n(l.months)}</td><td>{egp(l.subtotal)}</td></tr>)}
              </Table>
              {q.gift > 0 && <div className="li"><div><div className="t">هدية (تغطي {n(q.giftMonths)} شهر)</div><div className="s">قبل الخصم {egp(q.gross)}</div></div><div style={{ color: "var(--good)", fontWeight: 800 }}>− {egp(q.gift)}</div></div>}
              {q.offer > 0 && <div className="li"><div><div className="t">عرض {n(q.offerPct)}٪</div><div className="s">على المتبقي بعد الهدية</div></div><div style={{ color: "var(--good)", fontWeight: 800 }}>− {egp(q.offer)}</div></div>}
              {/*
                الفرق بقى **شهورًا كاملة** بعد قرار البيع بالشهر — قبل كده كانت
                الهدية ٣٦٥ يوم والسنة ٣٦٦ (الفترة شاملة الطرفين)، فحملة سنة
                بهدية سنة تسيب **يومًا واحدًا بفلوس** (٩٢٠ ج.م في عرض حقيقي)
                والمعلن مايفهمش منين. دلوقتي الاتنين مشتقّان من `MONTH_DAYS`
                فمستحيل يفترقوا، والسطر ده للفرق المقصود (هدية ٣ شهور على
                حملة ٦ مثلًا) بيسمّيه ويصلّحه بضغطة.
              */}
              {q.gift > 0 && q.giftMonths < q.lines[0]?.months && (
                <div className="li" style={{ alignItems: "center" }}>
                  <div>
                    <div className="t" style={{ color: "var(--bad)" }}>{n(q.lines[0].months - q.giftMonths)} شهر برّه الهدية — دي سبب المبلغ المتبقي</div>
                    <div className="s">الهدية بتغطي {n(q.giftMonths)} شهر والحملة {n(q.lines[0].months)}</div>
                  </div>
                  <button type="button" className="btn sm" onClick={() => set("end", endOfMonths(c.start, q.giftMonths))}>
                    اظبطي المدة على شهور الهدية
                  </button>
                </div>
              )}
              {/*
                الأسعار شاملة الضريبة، فالصافي والضريبة **مستخرجان** من
                المطلوب — والمطلوب هو الرقم الكبير لأنه اللي المعلن بيدفعه.
              */}
              {q.vat && q.total > 0 && (
                <>
                  <div className="li"><div className="t">الصافي قبل الضريبة</div><div>{egp(q.vat.net)}</div></div>
                  <div className="li"><div className="t">ضريبة القيمة المضافة {n(q.vat.pct)}٪</div><div>{egp(q.vat.vat)}</div></div>
                </>
              )}
              <div className="li"><div><div className="t">المطلوب دفعه</div><div className="s">شامل ضريبة القيمة المضافة</div></div><div style={{ fontWeight: 800, fontSize: 18 }}>{egp(q.total)}</div></div>
              {q.ok ? <div style={{ color: "var(--good)", fontWeight: 700 }}>✓ كل المواضع متاحة في الفترة دي</div>
                : <div role="alert" style={{ color: "var(--bad)", fontWeight: 700 }}>✕ مش متاح:{q.conflicts.map((x) => <div key={x.key}>{x.name} — {WHY[x.reason]} من {fdate(x.day)}</div>)}</div>}
            </>
          )}
        </Card>
        <Card title="المعاينة بمقاس الموضع"><AdPreview c={c} placements={placements} onToggle={toggle} onPick={(key, url) => setC((x) => ({ ...x, images: { ...x.images, ...(url ? { [key]: url } : { [key]: undefined }) } }))} /></Card>
      </div>
    </div>
  );
}

/* ---------- الشغّال دلوقتي ---------- */
/**
 * 🔴 **«إيه الشغّال دلوقتي» مكانش له مكان في الشاشة خالص.**
 *
 * خريطة المخزون بتقول **إيه المحجوز** (والرقم في الخانة = الفاضي)، وطابور
 * الحملات بيعرض كل الحالات مع بعض فاللي شغّال بيتعرف من **قراءة شارتين**
 * (معتمدة + جارية) في جدول طويل. فاللي بيفتح الشاشة مايعرفش في لمحة مين
 * ظاهر للمستخدمين دلوقتي.
 *
 * 🔴 **وأسوأ من كده: «نسبة الإشغال» كانت بتوحي إنها الشغّال وهي مش كده** —
 * `occupancy` بيعدّ `HOLD` = معتمدة **وبانتظار الموافقة ومتوقفة**. يعني
 * ٧٣٪ ممكن تكون كلها حجوزات لسه ماظهرتش لحد. فاللوحة دي بتقول الرقم
 * الحقيقي، والـKPI اتسمّى «الحجز» بدل «الإشغال».
 *
 * والحكم على **`phase` الجايّة من السيرفر** (محسوبة بيوم القاهرة) مش بتاريخ
 * المتصفح — الجهاز ممكن يكون على منطقة زمنية تانية فيقول «شغّالة» على حملة
 * خلصت امبارح.
 */
function RunningNow({ mapKey, onAll }) {
  const { data, err } = useLoad("/admin/ads/campaigns?status=approved", [mapKey]);
  const live = (data || []).filter((c) => c.phase === "running");
  const today = iso(new Date());
  return (
    <Card title={`شغّالة دلوقتي${data ? ` · ${n(live.length)}` : ""}`} right={<button className="btn sm" onClick={onAll}>كل الحملات</button>}>
      <Err msg={err} />
      {data && !live.length && <div className="empty">مفيش ولا إعلان ظاهر للمستخدمين دلوقتي — الحجز اللي بانتظار الموافقة أو المتوقف بيتحسب في خريطة المخزون إنما مابيظهرش لحد.</div>}
      <div className="grid" style={{ gap: 10, gridTemplateColumns: "repeat(auto-fit,minmax(290px,1fr))" }}>
        {live.map((c) => {
          // إعلاننا بدون حملة نهايته ٢٠٩٩ — «باقي ٢٦٠٠٠ يوم» رقم بلا معنى
          const left = c.isHouse ? null : Math.max(0, Math.round((+new Date(c.end + "T00:00:00Z") - +new Date(today + "T00:00:00Z")) / 864e5));
          // ظهور صفر على حملة بدأت قبل النهاردة = الإعلان مش بيتعرض فعلًا،
          // وده عطل صامت حصل قبل كده (موضع مباع ومفيش مكان بيعرضه)
          const silent = c.shown === 0 && c.start < today;
          return (
            <div key={c.id} className="li" style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 10, border: "1px solid var(--line)", borderRadius: 12 }}>
              {rowImage(c)
                ? <img src={toAbs(rowImage(c))} alt="" style={{ width: 54, height: 54, borderRadius: 8, objectFit: "cover", flex: "none" }} />
                : <span style={{ width: 54, height: 54, borderRadius: 8, background: GRADS[c.grad]?.[1] || GRADS[0][1], flex: "none" }} />}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="row" style={{ gap: 6 }}>
                  <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.advertiser}</b>
                  {c.isHouse && <span className="tag">إعلاننا</span>}
                </div>
                <div style={{ color: "var(--muted)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.headline}</div>
                <div className="row" style={{ gap: 4, marginTop: 5, flexWrap: "wrap" }}>
                  {c.placements.map((p) => <span key={p.key} className="tag">{p.name}</span>)}
                </div>
                <div style={{ color: "var(--muted)", fontSize: 11, marginTop: 5 }}>
                  {c.isHouse ? "بلا تاريخ نهاية" : left === 0 ? "آخر يوم النهاردة" : `باقي ${n(left)} يوم · لحد ${fdate(c.end)}`}
                  {" · "}<span dir="ltr">{n(c.shown)}</span> ظهور · <span dir="ltr">{n(c.clicked)}</span> نقرة
                </div>
                {silent && <div role="alert" style={{ color: "var(--bad)", fontSize: 11, marginTop: 4 }}>⚠ شغّالة من {fdate(c.start)} ومفيش ولا ظهور — اتأكدي إن الموضع بيتعرض فعلًا في التطبيق</div>}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/* ---------- الحملات ---------- */
function Campaigns({ onEdit, onNew, onRepublish, can, reloadMap, mapKey }) {
  const run = useDo();
  const [f, setF] = useState("");
  const [qs, setQs] = useState("");
  const { data, err, reload } = useLoad(`/admin/ads/campaigns${f ? `?status=${f}` : ""}`, [mapKey]);
  const act = (c, action, label) => run(() => api(`/admin/ads/campaigns/${c.id}/${action}`, { method: "POST", body: {} }), `${label} حملة ${c.advertiser}`).then((ok) => { if (ok) { reload(); reloadMap(); } });
  const rows = (data || []).filter((c) => !qs || (c.advertiser + c.headline).includes(qs));
  const live = (data || []).filter((c) => c.status === "approved" && c.phase === "running");
  const money = (data || []).filter((c) => ["approved", "paused", "pending"].includes(c.status)).reduce((a, c) => a + c.total, 0);
  return (
    <>
      <div className="grid kpis" style={{ marginBottom: 14 }}>
        <Kpi l="شغّالة الآن" v={n(live.length)} /><Kpi l="بانتظار الموافقة" v={n((data || []).filter((c) => c.status === "pending").length)} />
        <Kpi l="إجمالي قيمة الحجوزات" v={egp(money)} /><Kpi l="مرات الظهور" v={n((data || []).reduce((a, c) => a + c.shown, 0))} /><Kpi l="النقرات" v={n((data || []).reduce((a, c) => a + c.clicked, 0))} />
      </div>
      <Card title={`الحملات${data ? ` · ${n(rows.length)}` : ""}`} right={
        <div className="row">
          <input className="inp" aria-label="بحث" placeholder="بحث بالمعلن أو العنوان" value={qs} onChange={(e) => setQs(e.target.value)} />
          <select className="inp" aria-label="الحالة" value={f} onChange={(e) => setF(e.target.value)}>
            <option value="">كل الحالات</option><option value="pending">بانتظار الموافقة</option><option value="approved">معتمدة</option><option value="paused">متوقفة</option><option value="rejected">مرفوضة</option><option value="cancelled">ملغاة</option>
          </select>
          {can("ads.manage") && <button className="btn pri" onClick={onNew}>+ حجز حملة</button>}
        </div>}>
        <Err msg={err} />
        <Table head={["الحملة", "المواضع", "الفترة", "السعر", "ظهور / نقرات", "الحالة", can("ads.manage") ? "إجراءات" : ""]}>
          {rows.map((c) => (
            <tr key={c.id}>
              {/* الصورة نفسها في الطابور عشان اللي بيوافق يشوف اللي بيوافق عليه، مش اسم المعلن بس */}
              <td><div className="row" style={{ flexWrap: "nowrap" }}>{rowImage(c)
                ? <img src={toAbs(rowImage(c))} alt="" style={{ width: 34, height: 34, borderRadius: 5, objectFit: "cover", flex: "none" }} />
                : <span style={{ width: 10, height: 34, borderRadius: 4, background: GRADS[c.grad]?.[1], flex: "none" }} />}<div><b>{c.advertiser}</b><div style={{ color: "var(--muted)", fontSize: 12 }}>{c.headline}</div></div></div></td>
              <td>{c.placements.map((p) => <span key={p.key} className="tag" style={{ marginInlineEnd: 4 }}>{p.name}</span>)}</td>
              <td style={{ fontSize: 12 }}>{fdate(c.start)}<br />{fdate(c.end)}<div style={{ color: "var(--muted)" }}>{monthsOf(c.start, c.end) !== null ? `${n(monthsOf(c.start, c.end))} شهر` : `${n(c.days)} يوم`}</div></td>
              <td>{c.isHouse ? <span className="tag">بدون حملة</span> : <>{egp(c.total)}{c.giftCode && <div className="tag" dir="ltr" style={{ marginTop: 4 }} title={`خصم ${egp(c.discount)}`}>🎁 {c.giftCode}</div>}{c.offerPct > 0 && <div className="tag" style={{ marginTop: 4 }} title={`خصم ${egp(c.discount)}`}>عرض {n(c.offerPct)}٪</div>}</>}</td>
              <td>{n(c.shown)}<div style={{ color: "var(--muted)", fontSize: 12 }}>{n(c.clicked)} نقرة · {n(c.shown ? (c.clicked / c.shown) * 100 : 0, 1)}٪</div></td>
              <td><Pill s={c.status} />{c.status === "approved" && <div style={{ marginTop: 4 }}><Pill s={c.phase} /></div>}</td>
              <td>{can("ads.manage") && <div className="row">
                {["pending", "approved", "paused"].includes(c.status) && c.phase !== "ended" && <button className="btn sm" onClick={() => onEdit(c)}>تعديل</button>}
                {c.status === "pending" && <><button className="btn sm pri" onClick={() => act(c, "approve", "اعتماد")}>موافقة</button><Confirm danger onYes={() => act(c, "reject", "رفض")}>رفض</Confirm></>}
                {c.status === "approved" && <button className="btn sm" onClick={() => act(c, "pause", "إيقاف")}>إيقاف</button>}
                {c.status === "paused" && <button className="btn sm" onClick={() => act(c, "resume", "استئناف")}>استئناف</button>}
                {["pending", "approved", "paused"].includes(c.status) && <Confirm danger onYes={() => act(c, "cancel", "إلغاء")}>إلغاء</Confirm>}
                <button className="btn sm" title="حجز نسخة جديدة من الحملة بتواريخ جديدة" onClick={() => onRepublish(c)}>↻ إعادة نشر</button>
              </div>}</td>
            </tr>
          ))}
        </Table>
        {data && !rows.length && <div className="empty">مفيش حملات. اضغط «حجز حملة» أو اختار فترة من الخريطة.</div>}
      </Card>
    </>
  );
}

/* ---------- المواضع والمقاسات والإغلاق ---------- */
function PlacementRow({ p, can, onSaved }) {
  const run = useDo();
  const [f, setF] = useState({ name: p.name, kind: p.kind, width: p.width, height: p.height, slots: p.slots, pricePerMonth: p.pricePerMonth, dailyImpressions: p.dailyImpressions, active: p.active, note: p.note || "" });
  useEffect(() => setF({ name: p.name, kind: p.kind, width: p.width, height: p.height, slots: p.slots, pricePerMonth: p.pricePerMonth, dailyImpressions: p.dailyImpressions, active: p.active, note: p.note || "" }), [p]);
  const dirty = JSON.stringify(f) !== JSON.stringify({ name: p.name, kind: p.kind, width: p.width, height: p.height, slots: p.slots, pricePerMonth: p.pricePerMonth, dailyImpressions: p.dailyImpressions, active: p.active, note: p.note || "" });
  const cpm = +f.dailyImpressions > 0 ? Math.round(((+f.pricePerMonth / MONTH_DAYS) / +f.dailyImpressions) * 1000) : null;
  const ratio = cpm ? cpm / p.marketCpm : null;
  const save = (e) => { e?.preventDefault(); run(() => api(`/admin/ads/placements/${p.key}`, { method: "PUT", body: { ...f, width: +f.width, height: +f.height, slots: +f.slots, pricePerMonth: +f.pricePerMonth, dailyImpressions: +f.dailyImpressions || 0, note: f.note || null } }), `حفظ الموضع ${f.name}`).then((ok) => ok && onSaved()); };
  const dis = !can("ads.manage");
  return (
    <form className="card" onSubmit={save} style={{ display: "grid", gap: 10 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row"><Size p={{ width: +f.width || 1, height: +f.height || 1 }} /><b>{p.name}</b><span className="tag" dir="ltr">{p.key}</span></div>
        <div className="row"><span style={{ color: "var(--muted)", fontSize: 12 }}>{f.active ? "مفعّل" : "متوقف"}</span><Switch on={f.active} label={`تفعيل ${p.name}`} onChange={dis ? () => {} : (v) => setF({ ...f, active: v })} /></div>
      </div>
      <div className="form">
        <label className="f">الاسم<input className="inp" disabled={dis} value={f.name} minLength={2} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="f">النوع<select className="inp" disabled={dis} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="f">العرض (px)<input className="inp" type="number" min="50" max="4000" disabled={dis} value={f.width} onChange={(e) => setF({ ...f, width: e.target.value })} /></label>
        <label className="f">الارتفاع (px)<input className="inp" type="number" min="50" max="4000" disabled={dis} value={f.height} onChange={(e) => setF({ ...f, height: e.target.value })} /></label>
        <label className="f">عدد الأماكن/يوم<input className="inp" type="number" min="1" max="20" disabled={dis} value={f.slots} onChange={(e) => setF({ ...f, slots: e.target.value })} /></label>
        <label className="f">سعر الشهر (ج.م)<input className="inp" type="number" min="0" step="0.01" disabled={dis} value={f.pricePerMonth} onChange={(e) => setF({ ...f, pricePerMonth: e.target.value })} /></label>
        <label className="f">ظهور متوقع يوميًا للمكان<input className="inp" type="number" min="0" disabled={dis} value={f.dailyImpressions} onChange={(e) => setF({ ...f, dailyImpressions: e.target.value })} /></label>
      </div>
      <div role="note" style={{ fontSize: 12, color: !cpm ? "var(--muted)" : ratio > 3 ? "var(--bad)" : ratio < 0.7 ? "var(--warn)" : "var(--good)" }}>
        {!cpm ? "اكتبي الظهور المتوقع عشان يتحسب سعر الألف ظهور ويتقارن بالسوق." : `سعر الألف ظهور عندك ≈ ${egp(cpm)} · متوسط ميتا في مصر ≈ ${egp(p.marketCpm)}${ratio > 3 ? " — أغلى بكتير من السوق" : ratio < 0.7 ? " — أرخص من السوق" : ratio > 1.8 ? " — علاوة مقبولة للمواضع كاملة الشاشة" : " — قريب من السوق"}`}
      </div>
      <label className="f">وصف<input className="inp" disabled={dis} maxLength={200} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
      {!dis && <div className="row"><button className="btn pri" type="submit" disabled={!dirty}>حفظ</button>{dirty && <span style={{ color: "var(--warn)", fontSize: 12 }}>فيه تعديلات غير محفوظة</span>}</div>}
    </form>
  );
}

/**
 * **خريطة الأماكن المتاحة في التطبيق** — بطاقة لكل موضع بشكله الحقيقي
 * (النسبة مظبوطة) ومكانه في التطبيق ومقاسه وعدد أماكنه وسعره.
 *
 * ليه موجودة: «خريطة المخزون» بتقول **إيه المحجوز** — مابتقولش **إيه
 * الموجود أصلًا وشكله فين**. فاللي بيبيع إعلانًا مكانش عنده صفحة واحدة
 * يقول منها للمعلن «ده المكان وده مقاسه وده سعره».
 */
function PlacementMap({ placements }) {
  return (
    <Card title="الأماكن المتاحة للإعلان في التطبيق">
      <div className="grid" style={{ gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,240px),1fr))" }}>
        {placements.map((p) => {
          const wide = p.width >= p.height;
          const w = wide ? 200 : 96;
          const h = Math.max(24, Math.round((w * p.height) / p.width));
          return (
            <div key={p.key} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12, opacity: p.active ? 1 : .55 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "start" }}>
                <b>{p.name}</b>
                {!p.active && <span className="tag">متوقف</span>}
              </div>
              <div style={{ color: "var(--muted)", fontSize: 12, margin: "2px 0 8px" }}>{p.note || KINDS[p.kind] || p.kind}</div>
              {/* الشكل بنسبته الحقيقية — الفرق بين ٤:١ و٩:١٦ بيبان بالعين */}
              <div style={{ width: w, height: h, borderRadius: wide ? 8 : 12, background: "linear-gradient(135deg,#5B2621,#14100F)", border: "1px solid var(--line)" }} />
              <div style={{ marginTop: 8, fontSize: 12 }}>
                <div><span dir="ltr">{n(p.width)}×{n(p.height)}</span> px</div>
                <div style={{ color: "var(--muted)" }}>{n(p.slots)} أماكن في اليوم · {egp(p.pricePerMonth)}/شهر</div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Placements({ data, can, reload, today }) {
  const run = useDo();
  const [b, setB] = useState({ placement: data.placements[0]?.key || "", from: today, to: addDays(today, 2), reason: "" });
  const blocks = data.placements.flatMap((p) => p.blocks.map((x) => ({ ...x, p })));
  const add = (e) => { e.preventDefault(); run(() => api("/admin/ads/blocks", { method: "POST", body: b }), "تم قفل الموضع").then((ok) => ok && (setB({ ...b, reason: "" }), reload())); };
  return (
    <div className="grid" style={{ gap: 14 }}>
      <PlacementMap placements={data.placements} />
      <div className="grid" style={{ gap: 14, gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,420px),1fr))" }}>
        {data.placements.map((p) => <PlacementRow key={p.key} p={p} can={can} onSaved={reload} />)}
      </div>
      <Card title="قفل موضع لفترة (صيانة / حدث / حجز داخلي)">
        {can("ads.manage") && (
          <form className="form" onSubmit={add}>
            <label className="f">الموضع<select className="inp" value={b.placement} onChange={(e) => setB({ ...b, placement: e.target.value })}>{data.placements.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}</select></label>
            <label className="f">من<input className="inp" type="date" required value={b.from} onChange={(e) => setB({ ...b, from: e.target.value })} /></label>
            <label className="f">إلى<input className="inp" type="date" required min={b.from} value={b.to} onChange={(e) => setB({ ...b, to: e.target.value })} /></label>
            <label className="f">السبب<input className="inp" required minLength={2} maxLength={120} value={b.reason} onChange={(e) => setB({ ...b, reason: e.target.value })} /></label>
            <button className="btn pri" type="submit">قفل</button>
          </form>
        )}
        <Table head={["الموضع", "الفترة", "السبب", ""]}>
          {blocks.map((x) => (
            <tr key={x.id}><td><b>{x.p.name}</b></td><td>{fdate(x.from)} ← {fdate(x.to)}</td><td>{x.reason}</td>
              <td>{can("ads.manage") && <Confirm onYes={() => run(() => api(`/admin/ads/blocks/${x.id}`, { method: "DELETE" }), "تم فتح الموضع").then(reload)}>فتح</Confirm>}</td></tr>
          ))}
        </Table>
        {!blocks.length && <div className="empty">مفيش مواضع مقفولة في الفترة المعروضة على الخريطة.</div>}
      </Card>
    </div>
  );
}


/* ---------- أكواد الهدايا ---------- */
const MONTHS = [[1, "شهر"], [3, "3 شهور"], [6, "6 شهور"], [12, "سنة"]];
const GIFT_ST = { available: ["متاح", "good"], used: ["مستخدم", "info"], expired: ["منتهي", "mute"], void: ["ملغي", "bad"] };
function Gifts({ placements, can }) {
  const run = useDo();
  const { act } = useAdmin();
  const { data, err, reload } = useLoad("/admin/ads/gifts");
  const [f, setF] = useState({ months: 1, count: 1, recipient: "", note: "", placements: [], expiresAt: "" });
  const [fresh, setFresh] = useState([]);
  const create = async (e) => {
    e.preventDefault();
    const r = await run(() => api("/admin/ads/gifts", { method: "POST", body: { months: +f.months, count: +f.count, recipient: f.recipient || undefined, note: f.note || undefined, placements: f.placements, expiresAt: f.expiresAt || undefined } }), "تم إنشاء أكواد الهدايا");
    if (r) { setFresh(r.map((g) => g.id)); reload(); }
  };
  const label = (m) => MONTHS.find(([k]) => k === m)?.[1] || `${m} شهر`;
  const msg = (g) => `🎁 هدية من رع شات: إعلان مجاني لمدة ${label(g.months)}${g.recipient ? ` لـ ${g.recipient}` : ""}.\nكود الهدية: ${g.code}\n${g.expiresAt ? `صالح للاستخدام حتى ${fdate(g.expiresAt)}.\n` : ""}اذكره لفريقنا عند حجز حملتك.`;
  const copy = async (text, what) => { try { await navigator.clipboard.writeText(text); act(`تم نسخ ${what}`); } catch { act("تعذّر النسخ — انسخيه يدويًا"); } };
  const toggle = (k) => setF({ ...f, placements: f.placements.includes(k) ? f.placements.filter((x) => x !== k) : [...f.placements, k] });
  return (
    <div className="grid" style={{ gap: 14 }}>
      {can("ads.manage") && (
        <Card title="إنشاء أكواد هدية">
          <form className="grid" style={{ gap: 12 }} onSubmit={create}>
            <div className="f">مدة الإعلان المجاني
              <div className="row">{MONTHS.map(([k, l]) => <button type="button" key={k} className="tab" aria-pressed={+f.months === k} onClick={() => setF({ ...f, months: k })}>{l}</button>)}</div></div>
            <div className="form">
              <label className="f">عدد الأكواد<input className="inp" type="number" min="1" max="50" value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} /></label>
              <label className="f">اسم العميل (اختياري)<input className="inp" maxLength={80} value={f.recipient} onChange={(e) => setF({ ...f, recipient: e.target.value })} /></label>
              <label className="f">صالح لحد (اختياري)<input className="inp" type="date" value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} /></label>
              <label className="f">ملاحظة<input className="inp" maxLength={200} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
            </div>
            <div className="f">يشمل مواضع (سيبيها فاضية = كل المواضع)
              <div className="row">{placements.map((p) => <button type="button" key={p.key} className="tab" aria-pressed={f.placements.includes(p.key)} onClick={() => toggle(p.key)}>{p.name}</button>)}</div></div>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>الكود بيغطي المدة دي من سعر الحملة بالكامل، ولو الحملة أطول بتدفع الباقي. الكود بيتستخدم مرة واحدة.</div>
            <div><button className="btn pri" type="submit">إنشاء</button></div>
          </form>
        </Card>
      )}
      <Card title={`الأكواد${data ? ` · ${n(data.length)}` : ""}`}>
        <Err msg={err} />
        <Table head={["الكود", "المدة", "العميل", "المواضع", "الصلاحية", "الحالة", ""]}>
          {(data || []).map((g) => (
            <tr key={g.id} style={fresh.includes(g.id) ? { background: "color-mix(in srgb,var(--gold) 14%,transparent)" } : undefined}>
              <td dir="ltr" style={{ textAlign: "right" }}><b>{g.code}</b></td>
              <td>{label(g.months)}<div style={{ color: "var(--muted)", fontSize: 12 }}>{n(g.days)} يوم</div></td>
              <td>{g.recipient || "—"}{g.usedBy && <div style={{ color: "var(--muted)", fontSize: 12 }}>استخدمه: {g.usedBy}</div>}</td>
              <td>{g.placements.length ? g.placements.map((k) => placements.find((p) => p.key === k)?.name || k).join("، ") : "كل المواضع"}</td>
              <td>{g.expiresAt ? fdate(g.expiresAt) : "بدون"}</td>
              <td><Pill s={g.status} /></td>
              <td><div className="row">
                {g.status === "available" && <><button className="btn sm" onClick={() => copy(g.code, "الكود")}>نسخ الكود</button><button className="btn sm" onClick={() => copy(msg(g), "رسالة الإرسال")}>نسخ رسالة جاهزة</button></>}
                {g.status === "available" && can("ads.manage") && <Confirm danger onYes={() => run(() => api(`/admin/ads/gifts/${g.id}`, { method: "DELETE" }), `إلغاء الكود ${g.code}`).then(reload)}>إلغاء</Confirm>}
              </div></td>
            </tr>
          ))}
        </Table>
        {data && !data.length && <div className="empty">مفيش أكواد هدايا لسه.</div>}
      </Card>
    </div>
  );
}

/* ---------- الصفحة ---------- */
export function LiveAds() {
  const { can } = useMe();
  const { act } = useAdmin();
  const [tab, setTab] = useState("map");
  const [span, setSpan] = useState(30);
  const [from, setFrom] = useState(null);
  const [form, setForm] = useState(null);
  const [tick, setTick] = useState(0);
  const { data, err, reload } = useLoad(`/admin/ads/inventory?days=${span}${from ? `&from=${from}` : ""}`, [tick]);
  const today = data?.today;
  useEffect(() => { if (data && !from) setFrom(data.from); }, [data, from]);
  const bump = () => { reload(); setTick((t) => t + 1); };
  /**
   * 🔴 **الأرقام أماكن مش مكان×يوم** (بطلب داليا ١٩ أكتوبر ٢٠٢٦: «عايزة أعرف
   * إجمالي الإعلانات المتاحة في التطبيق قد إيه، يخصم المحجوز ويكتب الباقي»).
   *
   * كانت بتجمع `slots` على **كل يوم** في الفترة، فـ٢١ مكان في ٣٠ يوم بتطلع
   * ٦٣٠ — رقم صحيح حسابيًا وبلا معنى للي بيبيع، **وبيتغيّر لما تغيّري المدة**
   * فيبان كأن المخزون نفسه اتغيّر.
   *
   * والمتاح = **أقل عدد فاضي في الفترة كلها** (`min`) مش المتوسط: البيع بالشهر،
   * فالمكان اللي فاضي ٢٩ يوم ومحجوز يوم واحد **مش متاح للبيع** — وجمع المتوسط
   * كان هيعدّه متاحًا ويخلّينا نبيع مكانًا مش موجود.
   */
  const stats = useMemo(() => {
    if (!data) return null;
    let total = 0, open = 0;
    data.placements.forEach((p) => {
      if (!p.active) return;
      total += p.slots;
      open += p.cells.reduce((m, c) => Math.min(m, c.free), p.slots);
    });
    return { total, open, taken: total - open, pct: total ? Math.round(((total - open) / total) * 100) : 0 };
  }, [data]);

  if (err && !data) return <Err msg={err} />;
  if (!data) return <div className="empty">جاري التحميل…</div>;
  if (form) return <CampaignForm draft={form} placements={data.placements} onBack={() => setForm(null)} onCancel={() => setForm(null)} onDone={() => { setForm(null); bump(); setTab("campaigns"); }} />;
  const start = from && from > today ? from : today;
  return (
    <>
      {/* فوق التبويبات عن قصد: ده السؤال الأول لأي حد بيفتح الشاشة، ولازم
          يتجاوب من غير ما يدوس على تبويب ويقرا شارتين في جدول */}
      <div style={{ marginBottom: 14 }}><RunningNow mapKey={tick} onAll={() => setTab("campaigns")} /></div>
      <div className="tabs">
        {[["map", "خريطة المخزون"], ["campaigns", "الحملات والحجوزات"], ["placements", "المواضع والمقاسات والأسعار"], ["gifts", "أكواد الهدايا"]].map(([k, l]) => <button key={k} className="tab" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}
        {can("ads.manage") && <button className="btn pri" style={{ marginInlineStart: "auto" }} onClick={() => setForm(blank(start))}>+ حجز حملة</button>}
      </div>
      {tab === "map" && (
        <>
          <div className="grid kpis" style={{ marginBottom: 14 }}>
            {/* الأرقام **أماكن** — عدد الإعلانات اللي التطبيق بيشيلها، ناقص
                المحجوز = الباقي اللي ينفع يتباع. والمتاح بـ`min` على الفترة
                كلها عشان مانعرضش مكانًا محجوزًا يوم واحد كأنه فاضي. */}
            <Kpi l="أماكن الإعلانات في التطبيق" v={n(stats.total)} d={`في ${n(data.placements.filter((p) => p.active).length)} مواضع نشطة من ${n(data.placements.length)}`} />
            <Kpi l="محجوز في الفترة" v={n(stats.taken)} d="شامل اللي بانتظار الموافقة والمتوقف والمقفول" />
            <Kpi l="الباقي المتاح للبيع" v={n(stats.open)} d={`فاضي طول الفترة (${n(data.days.length)} يوم)`} />
            <Kpi l="نسبة الحجز" v={`${n(stats.pct)}٪`} d={`${n(stats.taken)} من ${n(stats.total)} مكان`} />
          </div>
          <InventoryMap data={data} from={from || data.from} setFrom={setFrom} span={span} setSpan={setSpan} today={today} can={can}
            onPick={(s) => { setForm({ ...blank(s.start), end: s.end, placements: [s.key] }); act("اتفتح نموذج الحجز بالفترة المحددة"); }} />
        </>
      )}
      {tab === "campaigns" && <Campaigns can={can} mapKey={tick} reloadMap={bump} onNew={() => setForm(blank(start))}
        onRepublish={(c) => { const m = monthsOf(c.start, c.end) ?? 1; const st = c.end >= start && ["approved", "paused"].includes(c.status) ? addDays(c.end, 1) : start; setForm({ ...blank(st), advertiser: c.advertiser, headline: c.headline, body: c.body, cta: c.cta, link: c.link, grad: c.grad, audience: c.audience, priority: c.priority, dailyCap: c.dailyCap, note: c.note || "", end: endOfMonths(st, m), placements: c.placements.map((p) => p.key), imageUrl: c.imageUrl || "", images: { ...(c.images || {}) } }); act(`اتجهّزت نسخة جديدة من حملة ${c.advertiser} — راجعي التواريخ وأكدي الحجز`); }}
        onEdit={(c) => setForm({ id: c.id, advertiser: c.advertiser, headline: c.headline, body: c.body, cta: c.cta, link: c.link, grad: c.grad, audience: c.audience, priority: c.priority, dailyCap: c.dailyCap, note: c.note || "", start: c.start, end: c.end, placements: c.placements.map((p) => p.key), giftCode: c.giftCode || "", imageUrl: c.imageUrl || "", images: { ...(c.images || {}) }, offerPct: c.offerPct || 0, house: !!c.isHouse })} />}
      {tab === "gifts" && <Gifts placements={data.placements} can={can} />}
      {tab === "placements" && <Placements data={data} can={can} reload={bump} today={today} />}
    </>
  );
}

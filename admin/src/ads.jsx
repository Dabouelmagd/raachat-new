import React, { useState, useMemo } from "react";
import { Card, Kpi, Table, Pill, Switch, LineChart, Bars, n, egp, useAdmin } from "./ui.jsx";
import { GRADS, PLACEMENTS, AUDIENCES, AD_DAILY } from "./data.js";

const ctr = (c) => (c.impressions ? (c.clicks / c.impressions) * 100 : 0);
const fmtH = (m) => { const h = Math.floor(m / 60), mm = m % 60; return `${n(h % 12 || 12)}:${String(mm).padStart(2, "0").replace(/\d/g, (d) => n(+d))} ${h >= 12 ? "م" : "ص"}`; };
const blank = () => ({ id: "", advertiser: "", headline: "", body: "", cta: "اعرف أكتر", link: "https://", grad: 0, placements: { modal: true, banner: true, services: false }, start: "2026-10-12", end: "2026-11-12", budget: 2000, spent: 0, cpm: 90, audience: AUDIENCES[0], priority: 2, dailyCap: 3, impressions: 0, clicks: 0, status: "pending" });

function preview(perDay, from, to, gap) {
  const span = ((to - from) * 60) / perDay;
  let seed = 7, last = -1e9;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  return Array.from({ length: perDay }, (_, i) => { let m = Math.round(from * 60 + span * i + rnd() * span); if (m - last < gap) m = last + gap; last = m; return m; });
}

/* معاينة الإعلان كما يظهر في التطبيق */
export function Preview({ c }) {
  const bg = GRADS[c.grad][1];
  return (
    <div className="grid" style={{ gap: 14 }}>
      <div>
        <div className="tag" style={{ marginBottom: 6, display: "inline-block" }}>بانر الدردشات</div>
        <div style={{ background: bg, borderRadius: 16, padding: 14, color: "#fff", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 10, opacity: .75 }}><b style={{ background: "#0006", color: "#C9A227", borderRadius: 4, padding: "1px 6px" }}>إعلان</b> {c.advertiser || "اسم المعلن"}</div>
            <div style={{ fontWeight: 800, fontSize: 14, lineHeight: 1.6 }}>{c.headline || "عنوان الإعلان"}</div>
            <div style={{ fontSize: 11.5, opacity: .85 }}>{c.body || "نص مختصر يشرح العرض"}</div>
          </div>
          <span style={{ background: "#F5EFE6", color: "#14100F", borderRadius: 9, padding: "5px 14px", fontWeight: 800, fontSize: 12 }}>{c.cta || "زر"}</span>
        </div>
      </div>
      <div>
        <div className="tag" style={{ marginBottom: 6, display: "inline-block" }}>نافذة كاملة</div>
        <div style={{ background: bg, borderRadius: 22, padding: 18, color: "#fff", maxWidth: 300 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 26, fontSize: 10.5 }}>
            <b style={{ background: "#0006", color: "#C9A227", borderRadius: 99, padding: "2px 9px" }}>إعلان</b><span style={{ opacity: .7 }}>إغلاق بعد ٥</span></div>
          <div style={{ fontSize: 11, opacity: .75 }}>{c.advertiser || "اسم المعلن"}</div>
          <div style={{ fontWeight: 800, fontSize: 19, lineHeight: 1.6 }}>{c.headline || "عنوان الإعلان"}</div>
          <div style={{ fontSize: 12.5, opacity: .85, margin: "6px 0 18px" }}>{c.body || "نص مختصر يشرح العرض"}</div>
          <div style={{ background: "#F5EFE6", color: "#14100F", borderRadius: 11, padding: "9px 0", textAlign: "center", fontWeight: 800 }}>{c.cta || "زر"}</div>
        </div>
      </div>
    </div>
  );
}

function Editor({ draft, onSave, onCancel, isNew }) {
  const [c, setC] = useState(draft);
  const set = (k, v) => setC((x) => ({ ...x, [k]: v }));
  const anyPlace = Object.values(c.placements).some(Boolean);
  const [err, setErr] = useState("");
  const submit = (e) => {
    e.preventDefault();
    if (!c.advertiser.trim() || !c.headline.trim()) return setErr("اكتب اسم المعلن وعنوان الإعلان");
    if (!anyPlace) return setErr("اختار موضع واحد على الأقل لعرض الإعلان");
    if (c.end < c.start) return setErr("تاريخ النهاية قبل تاريخ البداية");
    if (!/^https?:\/\//.test(c.link) || c.link.length < 10) return setErr("اكتب رابط الوجهة بشكل صحيح يبدأ بـ https://");
    setErr(""); onSave({ ...c, budget: +c.budget, cpm: +c.cpm, priority: +c.priority, dailyCap: +c.dailyCap });
  };
  return (
    <div className="grid two">
      <Card title={isNew ? "إعلان جديد" : `تعديل ${c.id}`}>
        <form className="grid" style={{ gap: 12 }} onSubmit={submit}>
          <div className="form">
            <label className="f">اسم المعلن<input id="e-adv" className="inp" value={c.advertiser} onChange={(e) => set("advertiser", e.target.value)} /></label>
            <label className="f">عنوان الإعلان<input id="e-head" className="inp" maxLength={50} value={c.headline} onChange={(e) => set("headline", e.target.value)} /></label>
          </div>
          <label className="f">النص<textarea id="e-body" className="inp" rows="2" maxLength={110} value={c.body} onChange={(e) => set("body", e.target.value)} /></label>
          <div className="form">
            <label className="f">نص الزر<input id="e-cta" className="inp" maxLength={16} value={c.cta} onChange={(e) => set("cta", e.target.value)} /></label>
            <label className="f">رابط الوجهة<input id="e-link" className="inp" dir="ltr" value={c.link} onChange={(e) => set("link", e.target.value)} /></label>
          </div>
          <div className="f">الخلفية
            <div className="row">{GRADS.map(([name, g], i) => (
              <button type="button" key={name} aria-label={name} aria-pressed={c.grad === i} onClick={() => set("grad", i)}
                style={{ width: 38, height: 38, borderRadius: 10, background: g, border: c.grad === i ? "2px solid var(--gold)" : "2px solid transparent", outlineOffset: 2 }} />))}</div></div>
          <div className="f">أماكن الظهور
            <div className="row">{Object.entries(PLACEMENTS).map(([k, label]) => (
              <button type="button" key={k} className="tab" aria-pressed={c.placements[k]} onClick={() => set("placements", { ...c.placements, [k]: !c.placements[k] })}>{label}</button>))}</div></div>
          <div className="form">
            <label className="f">البداية<input id="e-st" className="inp" type="date" value={c.start} onChange={(e) => set("start", e.target.value)} /></label>
            <label className="f">النهاية<input id="e-en" className="inp" type="date" value={c.end} onChange={(e) => set("end", e.target.value)} /></label>
            <label className="f">الميزانية (ج.م)<input id="e-bu" className="inp" type="number" min="100" value={c.budget} onChange={(e) => set("budget", e.target.value)} /></label>
            <label className="f">سعر الألف ظهور (ج.م)<input id="e-cp" className="inp" type="number" min="1" value={c.cpm} onChange={(e) => set("cpm", e.target.value)} /></label>
          </div>
          <div className="form">
            <label className="f">الجمهور<select id="e-au" className="inp" value={c.audience} onChange={(e) => set("audience", e.target.value)}>{AUDIENCES.map((a) => <option key={a}>{a}</option>)}</select></label>
            <label className="f">الأولوية<select id="e-pr" className="inp" value={c.priority} onChange={(e) => set("priority", e.target.value)}><option value="1">منخفضة</option><option value="2">عادية</option><option value="3">عالية</option></select></label>
            <label className="f">أقصى ظهور للمستخدم يوميًا<input id="e-dc" className="inp" type="number" min="1" max="10" value={c.dailyCap} onChange={(e) => set("dailyCap", e.target.value)} /></label>
          </div>
          {err && <div role="alert" style={{ color: "var(--bad)", fontWeight: 700 }}>{err}</div>}
          <div className="row"><button className="btn pri" type="submit">{isNew ? "إرسال للمراجعة" : "حفظ التعديلات"}</button><button type="button" className="btn" onClick={onCancel}>إلغاء</button></div>
        </form>
      </Card>
      <Card title="المعاينة كما تظهر في التطبيق"><Preview c={c} /></Card>
    </div>
  );
}

export function Ads({ campaigns, setCampaigns }) {
  const { act } = useAdmin();
  const [tab, setTab] = useState("campaigns");
  const [edit, setEdit] = useState(null);
  const [place, setPlace] = useState({
    modal: { on: true, perDay: 6, from: 8, to: 23, gap: 60, skip: 5 },
    banner: { on: true, rotate: 6, dismissible: true },
    services: { on: true, rotate: 8, dismissible: true },
    freq: 3,
  });
  const slots = useMemo(() => preview(place.modal.perDay, place.modal.from, place.modal.to, place.modal.gap), [place.modal]);
  const setSt = (id, status, what) => { const c = campaigns.find((x) => x.id === id); setCampaigns(campaigns.map((x) => x.id === id ? { ...x, status } : x)); act(`${what} حملة ${c.advertiser} (${id})`); };
  const save = (c) => {
    if (!c.id) { const id = "AD-" + (campaigns.length + 11); setCampaigns([...campaigns, { ...c, id }]); act(`أنشأ إعلانًا جديدًا للمعلن ${c.advertiser} (${id})`); }
    else { setCampaigns(campaigns.map((x) => x.id === c.id ? c : x)); act(`عدّل إعلان ${c.advertiser} (${c.id})`); }
    setEdit(null); setTab("campaigns");
  };
  const imp = campaigns.reduce((a, c) => a + c.impressions, 0), clk = campaigns.reduce((a, c) => a + c.clicks, 0), sp = campaigns.reduce((a, c) => a + c.spent, 0);

  if (edit) return <Editor draft={edit.c} isNew={!edit.c.id} onSave={save} onCancel={() => setEdit(null)} />;
  return (
    <>
      <div className="tabs">
        {[["campaigns", "الحملات"], ["placements", "المواضع والجدولة"], ["reports", "التقارير"]].map(([k, l]) => <button key={k} className="tab" aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}
        <button className="btn pri" style={{ marginInlineStart: "auto" }} onClick={() => setEdit({ c: blank() })}>+ إعلان جديد</button>
      </div>

      {tab === "campaigns" && (
        <>
          <div className="grid kpis" style={{ marginBottom: 14 }}>
            <Kpi l="مرات الظهور" v={n(imp)} /><Kpi l="النقرات" v={n(clk)} /><Kpi l="نسبة النقر" v={`${n(imp ? (clk / imp) * 100 : 0, 1)}٪`} />
            <Kpi l="الإيراد" v={egp(sp)} /><Kpi l="حملات نشطة" v={n(campaigns.filter((c) => c.status === "active").length)} />
          </div>
          <Card title="كل الحملات">
            <Table head={["الإعلان", "أماكن الظهور", "الفترة", "الميزانية", "ظهور / نقرات", "الحالة", "إجراءات"]}>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <td><div className="row" style={{ flexWrap: "nowrap" }}><span style={{ width: 10, height: 34, borderRadius: 4, background: GRADS[c.grad][1], flex: "none" }} /><div><b>{c.advertiser}</b><div style={{ color: "var(--muted)", fontSize: 12 }}>{c.headline}</div></div></div></td>
                  <td>{Object.entries(PLACEMENTS).filter(([k]) => c.placements[k]).map(([k, l]) => <span key={k} className="tag" style={{ marginInlineEnd: 4 }}>{l}</span>)}</td>
                  <td style={{ fontSize: 12 }}>{c.start}<br />{c.end}</td>
                  <td style={{ minWidth: 130 }}><div style={{ fontSize: 12 }}>{egp(c.spent)} / {egp(c.budget)}</div><div className="bar" style={{ marginTop: 4 }}><i style={{ width: `${Math.min(100, (c.spent / c.budget) * 100)}%` }} /></div></td>
                  <td>{n(c.impressions)}<div style={{ color: "var(--muted)", fontSize: 12 }}>{n(c.clicks)} نقرة · {n(ctr(c), 1)}٪</div></td>
                  <td><Pill s={c.status} /></td>
                  <td><div className="row">
                    <button className="btn sm" onClick={() => setEdit({ c })}>تعديل</button>
                    {c.status === "pending" && <><button className="btn sm pri" onClick={() => setSt(c.id, "active", "وافق على")}>موافقة</button><button className="btn sm dng" onClick={() => { setCampaigns(campaigns.filter((x) => x.id !== c.id)); act(`رفض إعلان ${c.advertiser} (${c.id})`); }}>رفض</button></>}
                    {c.status === "active" && <button className="btn sm" onClick={() => setSt(c.id, "paused", "أوقف")}>إيقاف</button>}
                    {c.status === "paused" && <button className="btn sm" onClick={() => setSt(c.id, "active", "استأنف")}>استئناف</button>}
                  </div></td>
                </tr>
              ))}
            </Table>
            {!campaigns.length && <div className="empty">لا توجد حملات. اضغط «إعلان جديد» لإضافة أول حملة.</div>}
          </Card>
        </>
      )}

      {tab === "placements" && (
        <div className="grid two">
          <Card title="نافذة كاملة عند الدخول">
            <div className="li"><div><div className="t">تفعيل</div><div className="s">تظهر على الشاشة كلها وبها زر إغلاق متأخر</div></div><Switch on={place.modal.on} label="تفعيل النافذة" onChange={(v) => { setPlace({ ...place, modal: { ...place.modal, on: v } }); act(`${v ? "فعّل" : "أوقف"} الإعلان بنافذة كاملة`); }} /></div>
            <div className="form" style={{ marginTop: 12 }}>
              <label className="f">إعلانات يوميًا<input id="p-pd" className="inp" type="number" min="1" max="12" value={place.modal.perDay} onChange={(e) => setPlace({ ...place, modal: { ...place.modal, perDay: Math.max(1, Math.min(12, +e.target.value || 1)) } })} /></label>
              <label className="f">من الساعة<input id="p-f" className="inp" type="number" min="0" max="22" value={place.modal.from} onChange={(e) => setPlace({ ...place, modal: { ...place.modal, from: Math.min(+e.target.value || 0, place.modal.to - 1) } })} /></label>
              <label className="f">إلى الساعة<input id="p-t" className="inp" type="number" min="1" max="24" value={place.modal.to} onChange={(e) => setPlace({ ...place, modal: { ...place.modal, to: Math.max(+e.target.value || 1, place.modal.from + 1) } })} /></label>
              <label className="f">أقل فاصل (دقيقة)<input id="p-g" className="inp" type="number" min="0" value={place.modal.gap} onChange={(e) => setPlace({ ...place, modal: { ...place.modal, gap: +e.target.value || 0 } })} /></label>
              <label className="f">زر الإغلاق بعد (ثانية)<input id="p-s" className="inp" type="number" min="0" max="15" value={place.modal.skip} onChange={(e) => setPlace({ ...place, modal: { ...place.modal, skip: +e.target.value || 0 } })} /></label>
            </div>
            <div style={{ margin: "12px 0 6px", color: "var(--muted)", fontSize: 12 }}>مواعيد اليوم المتوقعة</div>
            <div className="row">{slots.map((m, i) => <span className="tag" key={i}>{fmtH(m)}</span>)}</div>
          </Card>
          <div className="grid" style={{ gap: 14 }}>
            {[["banner", "بانر الدردشات"], ["services", "بانر الخدمات"]].map(([k, label]) => (
              <Card key={k} title={label}>
                <div className="li"><div><div className="t">تفعيل</div><div className="s">بانر مرن يدور بين الإعلانات</div></div><Switch on={place[k].on} label={`تفعيل ${label}`} onChange={(v) => { setPlace({ ...place, [k]: { ...place[k], on: v } }); act(`${v ? "فعّل" : "أوقف"} ${label}`); }} /></div>
                <div className="li"><div className="t">التدوير كل (ثانية)</div><input aria-label={`تدوير ${label}`} className="inp" type="number" min="3" max="30" style={{ width: 90 }} value={place[k].rotate} onChange={(e) => setPlace({ ...place, [k]: { ...place[k], rotate: +e.target.value || 6 } })} /></div>
                <div className="li"><div className="t">السماح للمستخدم بإخفائه</div><Switch on={place[k].dismissible} label={`إخفاء ${label}`} onChange={(v) => setPlace({ ...place, [k]: { ...place[k], dismissible: v } })} /></div>
              </Card>
            ))}
            <Card title="حدود التكرار">
              <div className="li"><div><div className="t">أقصى ظهور للإعلان الواحد للمستخدم يوميًا</div><div className="s">يتجاوزها الحد الخاص بكل حملة إن كان أقل</div></div>
                <input aria-label="حد التكرار" className="inp" type="number" min="1" max="10" style={{ width: 80 }} value={place.freq} onChange={(e) => setPlace({ ...place, freq: +e.target.value || 1 })} /></div>
              <button className="btn pri" style={{ marginTop: 12 }} onClick={() => act(`حفظ إعدادات المواضع والجدولة (${n(place.modal.perDay)} نوافذ يوميًا)`)}>حفظ كل الإعدادات</button>
            </Card>
          </div>
        </div>
      )}

      {tab === "reports" && (
        <>
          <div className="grid two">
            <Card title="مرات الظهور اليومية · آخر ٣٠ يوم"><LineChart data={AD_DAILY} step={1000} label="مرات ظهور الإعلانات يوميًا خلال ٣٠ يوم" /></Card>
            <Card title="نسبة النقر لكل حملة">
              <Bars rows={campaigns.filter((c) => c.impressions).map((c) => [c.advertiser, Math.round(ctr(c) * 10) / 10])} />
              <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>القيم بالنسبة المئوية</div>
            </Card>
          </div>
          <div style={{ marginTop: 14 }}>
            <Card title="أداء الحملات">
              <Table head={["الحملة", "الظهور", "النقرات", "CTR", "الإنفاق", "سعر الألف", "تكلفة النقرة"]}>
                {campaigns.filter((c) => c.impressions).map((c) => (
                  <tr key={c.id}><td><b>{c.advertiser}</b></td><td>{n(c.impressions)}</td><td>{n(c.clicks)}</td><td>{n(ctr(c), 1)}٪</td><td>{egp(c.spent)}</td><td>{egp(c.cpm)}</td><td>{egp(c.clicks ? c.spent / c.clicks : 0)}</td></tr>
                ))}
              </Table>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

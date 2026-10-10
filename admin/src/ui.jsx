import React, { createContext, useContext, useState, useCallback } from "react";

export const n = (v, d = 0) => Number(v).toLocaleString("ar-EG", { minimumFractionDigits: d, maximumFractionDigits: d });
export const egp = (v) => `${n(v, 2)} ج.م`;

export const Ctx = createContext(null);
export const useAdmin = () => useContext(Ctx);

export function Provider({ children, seed }) {
  const [audit, setAudit] = useState(seed);
  const [toast, setToast] = useState("");
  const act = useCallback((what, msg) => {
    setAudit((a) => [{ who: "داليا (المالك)", what, when: "الآن" }, ...a]);
    setToast(msg || what);
    clearTimeout(window.__t);
    window.__t = setTimeout(() => setToast(""), 2600);
  }, []);
  return (
    <Ctx.Provider value={{ audit, act }}>
      {children}
      {toast && <div className="toast" role="status">{toast}</div>}
    </Ctx.Provider>
  );
}

const PILLS = {
  active: ["نشط", "good"], suspended: ["موقوف", "warn"], banned: ["محظور", "bad"], deleted: ["محذوف", "mute"],
  restricted: ["مقيّد", "warn"], live: ["مباشر", "good"], ended: ["انتهت", "mute"],
  open: ["مفتوح", "warn"], resolved: ["تمت المعالجة", "good"],
  done: ["ناجحة", "good"], failed: ["فشلت", "bad"], pending: ["قيد المراجعة", "warn"],
  approved: ["معتمدة", "good"], rejected: ["مرفوضة", "bad"], cancelled: ["ملغاة", "mute"], upcoming: ["قادمة", "info"], running: ["شغّالة الآن", "good"],
  refunded: ["مستردة", "info"], paused: ["متوقف", "mute"], on: ["مفعّل", "good"], off: ["معطّل", "mute"],
};
export function Pill({ s }) {
  const [t, c] = PILLS[s] || [s, "mute"];
  return <span className={`pill p-${c}`}>{t}</span>;
}
export function Switch({ on, onChange, label }) {
  return <button type="button" role="switch" aria-checked={on} aria-label={label} className="sw" onClick={() => onChange(!on)} />;
}
export const Card = ({ title, right, children }) => (
  <section className="card">
    {(title || right) && <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
      <h3 style={{ margin: 0 }}>{title}</h3>{right}</div>}
    {children}
  </section>
);
export const Kpi = ({ l, v, d, up }) => (
  <div className="card kpi"><div className="l">{l}</div><div className="v">{v}</div>
    {d && <div className={`d ${up ? "up" : "down"}`}>{d}</div>}</div>
);
export const Table = ({ head, children }) => (
  <div className="scroll"><table className="tbl"><thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>
);

/* مخطط خطي بمقياس واحد: أقصى/أدنى قيمة تُحسب من البيانات والتسميات على نفس المقياس */
export function LineChart({ data, step = 500, label = "مستخدمون نشطون يوميًا خلال ٣٠ يوم", ends = ["قبل ٢٩ يوم", "اليوم"] }) {
  const W = 640, H = 220, L = 46, R = 14, T = 14, B = 26;
  const min = Math.floor(Math.min(...data) / step) * step, max = Math.ceil(Math.max(...data) / step) * step;
  const x = (i) => L + (i * (W - L - R)) / (data.length - 1);
  const y = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const pts = data.map((v, i) => [x(i), y(v)]);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${path} L${x(data.length - 1)},${H - B} L${x(0)},${H - B} Z`;
  const ticks = [0, 1, 2, 3, 4].map((k) => min + ((max - min) * k) / 4);
  const last = pts[pts.length - 1];
  return (
    <div dir="ltr">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={label}>
        {ticks.map((t, i) => (
          <g key={i}><line className="grid" x1={L} x2={W - R} y1={y(t)} y2={y(t)} /><text x={L - 8} y={y(t) + 4} textAnchor="end">{n(t)}</text></g>
        ))}
        <path d={area} fill="var(--accent)" opacity=".16" />
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinejoin="round" />
        <circle cx={last[0]} cy={last[1]} r="4.5" fill="var(--accent)" stroke="var(--panel)" strokeWidth="2" />
        <text x={last[0]} y={last[1] - 10} textAnchor="end" style={{ fill: "var(--fg)", fontWeight: 700 }}>{n(data[data.length - 1])}</text>
        {[0, 7, 14, 21, 29].map((i) => <text key={i} x={x(i)} y={H - 6} textAnchor="middle">{i === 29 ? "اليوم" : `قبل ${n(29 - i)} يوم`}</text>)}
      </svg>
    </div>
  );
}
export function Bars({ rows }) {
  const max = Math.max(...rows.map((r) => r[1]));
  return (
    <div className="list">
      {rows.map(([l, v]) => (
        <div key={l} className="li" style={{ display: "grid", gridTemplateColumns: "110px 1fr 56px", gap: 12 }}>
          <span>{l}</span><div className="bar"><i style={{ width: `${(v / max) * 100}%` }} /></div><b style={{ textAlign: "left" }}>{n(v, Number.isInteger(v) ? 0 : 1)}</b>
        </div>
      ))}
    </div>
  );
}

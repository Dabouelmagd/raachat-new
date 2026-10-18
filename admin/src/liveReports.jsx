import React, { useState } from "react";
import { Card, Table, Pill, n } from "./ui.jsx";
import { api } from "./api.js";
import { useMe, useLoad, useDo, Err, Confirm } from "./live.jsx";

const KINDS = { message: "رسالة", story: "Story", room: "غرفة", user: "مستخدم", thread: "جروب" };
const REASONS = { child_safety: "إيذاء طفل أو استغلاله", abuse: "إساءة لفظية", spam: "رسائل مزعجة (Spam)", inappropriate: "محتوى غير لائق", impersonation: "انتحال شخصية", scam: "احتيال / رابط مشبوه", other: "سبب آخر" };
/** بلاغات سلامة الأطفال بتيجي أول الطابور من السيرفر، وبتتعلّم بصريًا كمان
 *  عشان مايضيعوش بين عشرين بلاغ سبام — الإجراء المنشور «من أول بلاغ». */
const URGENT = "child_safety";
const RES = { delete: "اتحذف المحتوى", delete_ban: "حذف + حظر", warn: "تحذير", dismiss: "تم التجاهل" };
const fmt = (iso) => new Date(iso).toLocaleString("ar-EG-u-nu-latn", { dateStyle: "medium", timeStyle: "short" });

export function LiveReports() {
  const { can } = useMe();
  const run = useDo();
  const [tab, setTab] = useState("open");
  const { data, err, reload } = useLoad(`/admin/reports?status=${tab}`);
  const sum = useLoad("/admin/reports/summary", [tab]);
  const mod = can("content.moderate");
  const resolve = (r, action, label) => run(() => api(`/admin/reports/${r.id}/resolve`, { method: "POST", body: { action } }), `${label} — ${r.target}`).then((ok) => ok && reload());
  const canDeleteKind = (r) => r.kind === "message" || r.kind === "story" || r.kind === "room";
  return (
    <>
      <div className="tabs">
        <button className="tab" aria-pressed={tab === "open"} onClick={() => setTab("open")}>مفتوحة{sum.data ? ` (${n(sum.data.open)})` : ""}</button>
        <button className="tab" aria-pressed={tab === "resolved"} onClick={() => setTab("resolved")}>تمت معالجتها{sum.data ? ` (${n(sum.data.resolved)})` : ""}</button>
      </div>
      <Err msg={err} />
      <div className="grid two">
        {(data || []).map((r) => (
          <div className="rep" key={r.id}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b style={r.reason === URGENT ? { color: "var(--danger, #e5484d)" } : undefined}>
                {r.reason === URGENT && "🚨 "}{REASONS[r.reason] || r.reason}
              </b>
              <span className="tag">{KINDS[r.kind] || r.kind} · {fmt(r.at)}</span>
            </div>
            {r.reason === URGENT && r.status === "open" && (
              <div className="pill p-bad">أولوية قصوى — حجب وإغلاق نهائي وتبليغ الجهات المختصة</div>
            )}
            <div style={{ color: "var(--muted)", fontSize: 12 }}>
              المبلَّغ عنه: <b style={{ color: "var(--fg)" }}>{r.target}</b> · بواسطة {r.reporter} · {r.where}
              {r.count > 1 && <span className="pill p-warn" style={{ marginInlineStart: 6 }}>{n(r.count)} بلاغات</span>}
            </div>
            {r.text && <q>{r.text}</q>}
            {r.note && <div style={{ fontSize: 12, color: "var(--muted)" }}>ملاحظة المبلِّغ: {r.note}</div>}
            {r.status === "open" ? (
              mod ? <div className="row">
                {can("users.manage") && r.targetUserId && <Confirm danger onYes={() => resolve(r, "delete_ban", "حذف + حظر")}>{canDeleteKind(r) ? "حذف + حظر" : "حظر صاحب الحساب"}</Confirm>}
                {canDeleteKind(r) && <Confirm onYes={() => resolve(r, "delete", "حذف المحتوى")}>{r.kind === "room" ? "قفل الغرفة" : "حذف المحتوى"}</Confirm>}
                <Confirm onYes={() => resolve(r, "warn", "أرسل تحذيرًا")}>تحذير</Confirm>
                <Confirm onYes={() => resolve(r, "dismiss", "تجاهل البلاغ")}>تجاهل</Confirm>
              </div> : <div className="tag">للعرض فقط — مالكش صلاحية المعالجة</div>
            ) : <div className="row"><Pill s="resolved" /><span className="tag">{RES[r.resolution] || r.resolution}</span></div>}
          </div>
        ))}
      </div>
      {data && !data.length && <div className="empty">لا توجد بلاغات هنا</div>}
    </>
  );
}

/**
 * **المحتوى (Stories) صفحة لوحدها** — كانت متحطوطة تحت البلاغات في نفس الصفحة،
 * وهما شغلان مختلفان: البلاغات شغل رد فعل (حد اشتكى)، والمحتوى تصفّح للمنشور
 * دلوقتي. (بطلب داليا، ١٢ أكتوبر.)
 */
export function LiveContent() {
  const { can } = useMe();
  const run = useDo();
  const stories = useLoad("/admin/stories");
  const mod = can("content.moderate");
  return (
    <Card title="Stories النشطة">
      <Err msg={stories.err} />
      <Table head={["المستخدم", "النص", "المشاهدات", "بلاغات", "منذ", ""]}>
        {(stories.data || []).map((s) => (
          <tr key={s.id}><td><b>{s.user}</b></td><td>{s.caption || "—"}</td><td>{n(s.views)}</td><td>{s.reports ? <span className="pill p-warn">{n(s.reports)}</span> : "—"}</td><td>{fmt(s.at)}</td>
            <td>{mod && <Confirm danger onYes={() => run(() => api(`/admin/stories/${s.id}`, { method: "DELETE" }), `حذف Story ${s.user}`).then((ok) => ok && stories.reload())}>حذف</Confirm>}</td></tr>
        ))}
      </Table>
      {stories.data && !stories.data.length && <div className="empty">لا توجد Stories نشطة</div>}
    </Card>
  );
}

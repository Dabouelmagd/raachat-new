import { useT, num } from "../i18n";
import { buildSchedule, fmtTime, showNextAdNow, resetToday, useAdState, ADS_PER_DAY } from "./ads";

/** لوحة معاينة لفريق المراجعة: جدول اليوم + زر لعرض الإعلان التالي فورًا. تُحذف من النسخة النهائية. */
export function AdSchedulePanel() {
  const t = useT();
  const { shownIdx } = useAdState();
  const sched = buildSchedule();
  return (
    <div className="rounded-2xl bg-rachat-card p-3.5">
      <div className="mb-2 text-xs text-neutral-400">
        {t(`${num(ADS_PER_DAY)} إعلانات يوميًا في أوقات متفرقة — عُرض ${num(shownIdx.length)} اليوم`, `${num(ADS_PER_DAY)} ads per day at scattered times — ${num(shownIdx.length)} shown today`)}
      </div>
      <div className="space-y-1.5">
        {sched.map((s, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="font-bold">{fmtTime(s.minutes)}</span>
            <span className="min-w-0 flex-1 truncate px-3 text-neutral-400">{s.ad.advertiser}</span>
            <span className={shownIdx.includes(i) ? "font-bold text-rachat-gold" : "text-neutral-600"}>
              {shownIdx.includes(i) ? t("تم العرض", "Shown") : t("قادم", "Upcoming")}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={showNextAdNow} className="flex-1 rounded-lg bg-rachat-red py-2 text-xs font-extrabold">{t("اعرض الإعلان التالي الآن", "Show next ad now")}</button>
        <button onClick={resetToday} className="rounded-lg bg-rachat-maroon/40 px-3 py-2 text-xs font-bold">{t("إعادة ضبط اليوم", "Reset today")}</button>
      </div>
    </div>
  );
}

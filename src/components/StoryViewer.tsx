import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useT } from "../i18n";
import { api, API_ON } from "../api/client";
import { useAppState, useAppActions } from "../store/AppContext";
import { ReportReasons, type ReportReason } from "./ReportReasons";

const DURATION_MS = 4000;

/**
 * عارض الستوري — **لحساب واحد بس**.
 * قبل كده كان بيمشي في قايمة الستوريز كلها بالترتيب، فتفتحي ستوري واحد وتلاقي
 * نفسك في ستوري حد تاني من غير ما تطلبي. دلوقتي الشرايط فوق = عدد ستوريز الحساب
 * ده، و«التالية» في آخر واحدة بتقفل بدل ما تنطّ لحساب تاني.
 */
export function StoryViewer({ authorId, onClose }: { authorId: string; onClose: () => void }) {
  const t = useT();
  const { stories } = useAppState();
  const { markStorySeen } = useAppActions();
  const mine = stories.filter((s) => s.authorId === authorId);
  // نبدأ من أول ستوري لسه ما اتشافتش عند الحساب ده
  const [index, setIndex] = useState(() => {
    const i = mine.findIndex((s) => !s.seen);
    return i >= 0 ? i : 0;
  });
  const [progress, setProgress] = useState(0);
  const [flagged, setFlagged] = useState(false);
  const [reporting, setReporting] = useState(false);

  const story = mine[index];

  /**
   * البلاغ **بسبب يختاره المستخدم**. قبل كده كان `reason: "inappropriate"`
   * مثبّتًا بلا أي منتقي — يعني بعد ما بقى فيه سبب «إيذاء طفل» وطابور أولوية
   * في اللوحة (١٥ أكتوبر)، البلاغ على ستوري فضل بيروح في طابور السبام.
   */
  const report = async (reason: ReportReason) => {
    setReporting(false);
    setFlagged(true);
    try { if (API_ON && story) await api("/reports", { method: "POST", body: { kind: "story", targetId: story.id, reason } }); } catch { /* ignore */ }
  };

  useEffect(() => {
    if (!story) {
      onClose();
      return;
    }
    markStorySeen(story.id);
    // **المؤقّت بيتوقف وانتِ بتختاري سبب البلاغ.** من غير كده الستوري بتتقدّم
    // أو العارض يتقفل خلال ٤ ثواني والمنتقي مفتوح — فالبلاغ يضيع أو ينزل على
    // ستوري تانية. ولما المنتقي يتقفل العدّ بيبدأ من الأول (أحسن من إننا
    // نضيّع الستوري من تحت إيد المستخدم).
    if (reporting) return;
    setProgress(0);
    const start = Date.now();
    const tick = setInterval(() => {
      const pct = Math.min(100, ((Date.now() - start) / DURATION_MS) * 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(tick);
        if (index < mine.length - 1) setIndex((i) => i + 1);
        else onClose();
      }
    }, 60);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, story?.id, reporting]);

  if (!story) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
      <div
        className="relative flex h-[80vh] max-h-[640px] w-full max-w-[380px] flex-col justify-between rounded-2xl p-4"
        style={{ background: story.image ? `center / cover url(${story.image})` : `linear-gradient(160deg, ${story.colorFrom}, ${story.colorTo})` }}
      >
        {story.image && <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-black/40 via-transparent to-black/60" />}
        <div>
          <div className="flex gap-1">
            {mine.map((s, i) => (
              <div key={s.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
                <div
                  className="h-full bg-white"
                  style={{ width: `${i < index ? 100 : i === index ? progress : 0}%`, }}
                />
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-sm font-bold text-white">
                {story.authorName[0]}
              </div>
              <div>
                <div className="text-xs font-bold text-white">{story.authorName}</div>
                <div className="text-[10px] text-white/70">{story.time}</div>
              </div>
            </div>
            <button onClick={onClose} aria-label={t("إغلاق", "Close")} className="text-white/80">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="text-center text-xl font-extrabold text-white drop-shadow">{story.caption}</div>

        {reporting && (
          <div className="mx-auto w-full max-w-[340px]">
            <ReportReasons onPick={(r) => void report(r)} />
          </div>
        )}

        <div className="flex justify-between text-white/70">
          <button
            className="px-4 py-2 text-xs"
            onClick={() => index > 0 && setIndex(index - 1)}
          >
            {t("السابقة", "Previous")}
          </button>
          <button className="px-4 py-2 text-xs" onClick={() => setReporting((v) => !v)} disabled={flagged} aria-expanded={reporting}>
            {flagged ? t("تم الإبلاغ", "Reported") : t("إبلاغ", "Report")}
          </button>
          <button
            className="px-4 py-2 text-xs"
            onClick={() => (index < mine.length - 1 ? setIndex(index + 1) : onClose())}
          >
            {t("التالية", "Next")}
          </button>
        </div>
      </div>
    </div>
  );
}

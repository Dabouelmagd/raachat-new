import { describe, expect, it } from "vitest";
import { cairoMidnight, cairoParts, startOfCairoMonth, todayCairo } from "../src/lib/cairo.js";

/**
 * العطل اللي الملف ده بيحميه: سقف فواتير الفئة ١٨–٢١ كان بيتحسب على **الشهر العالمي**
 * (`Date.UTC(y, m, 1)`). والقاهرة +02/+03، فأول ٢–٣ ساعات من كل شهر قاهرة لسه الشهر
 * اللي فات في UTC:
 *   - الفواتير اللي بتتدفع في الساعات دي بتتحسب على الشهر القديم، وبعد ما UTC يدخل
 *     الشهر الجديد بتختفي من الحساب خالص → السقف ينفتح من جديد = ٤٠٠٠ في شهر سقفه ٢٠٠٠.
 *   - والعكس: مستخدم خلّص سقفه الشهر اللي فات بيترفض أول ٣ ساعات من الشهر الجديد.
 */
const cairoTime = (d: Date) => {
  const p = cairoParts(d);
  return `${p.day} ${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}:${String(p.s).padStart(2, "0")}`;
};
/** الطريقة القديمة الغلط — موجودة هنا عشان لو حد رجّعها الاختبار يسقط */
const oldWay = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

describe("بداية الشهر بتوقيت القاهرة", () => {
  it("دايمًا منتصف ليل أول الشهر بالقاهرة — صيفًا وشتاءً وفي شهر تغيير التوقيت", () => {
    const cases = [
      "2026-09-30T21:30:00Z", // ١٢:٣٠ بالليل أول أكتوبر بالقاهرة (توقيت صيفي +03)
      "2026-10-01T06:00:00Z", // نفس اليوم الصبح — لازم يرجّع نفس البداية بالظبط
      "2026-10-31T23:30:00Z", // بعد نهاية التوقيت الصيفي، وبداية الشهر كانت قبله (+03)
      "2026-12-31T22:00:00Z", // أول يناير شتاءً (+02)
      "2026-04-30T22:00:00Z", // أبريل — الشهر اللي التوقيت الصيفي يبدأ فيه
      "2026-06-15T12:00:00Z",
      "2026-02-28T23:59:59Z",
    ];
    for (const iso of cases) {
      const now = new Date(iso);
      const start = startOfCairoMonth(now);
      const p = cairoParts(start);
      expect(cairoTime(start), iso).toBe(`${p.y}-${String(p.m).padStart(2, "0")}-01 00:00:00`);
      expect(p.y, iso).toBe(cairoParts(now).y);
      expect(p.m, iso).toBe(cairoParts(now).m); // نفس شهر القاهرة بتاع اللحظة
      expect(start.getTime(), iso).toBeLessThanOrEqual(now.getTime()); // مش في المستقبل
    }
  });

  it("الطريقة القديمة (الشهر العالمي) كانت بتسيب ثغرة في السقف — ودي اللي بنحميها", () => {
    // فاتورة اتدفعت ١٢:٣٠ بالليل أول أكتوبر بالقاهرة
    const paidAt = new Date("2026-09-30T21:30:00Z");
    expect(cairoTime(paidAt)).toBe("2026-10-01 00:30:00");
    // والمستخدم بيسأل عن سقفه الصبح
    const asking = new Date("2026-10-01T06:00:00Z");

    // الغلط: بداية الشهر العالمي (١ أكتوبر ٠٠:٠٠ UTC) بعد وقت الدفع → الفاتورة مش محسوبة
    expect(oldWay(asking).getTime()).toBeGreaterThan(paidAt.getTime());
    // الصح: بداية شهر القاهرة قبل الدفع → محسوبة
    expect(startOfCairoMonth(asking).getTime()).toBeLessThanOrEqual(paidAt.getTime());
  });

  it("منتصف الليل لأي يوم: مايزحفش ساعة في شهور التوقيت الصيفي", () => {
    for (const day of ["2026-10-01", "2026-10-31", "2026-04-01", "2026-04-30", "2026-01-15", "2026-07-20"]) {
      expect(cairoTime(cairoMidnight(day))).toBe(`${day} 00:00:00`);
    }
  });

  it("todayCairo بيرجّع YYYY-MM-DD بصفر على الشمال", () => {
    expect(todayCairo(new Date("2026-01-05T12:00:00Z"))).toBe("2026-01-05");
    expect(todayCairo()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

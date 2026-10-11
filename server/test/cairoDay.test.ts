import { describe, expect, it } from "vitest";
import { startOfCairoDay, todayCairo } from "../src/lib/adsInventory.js";

/**
 * الباگ الأصلي: بداية اليوم كانت `todayCairo() + "T00:00:00+02:00"` — فرق ثابت.
 * ومصر توقيتها الصيفي +03، فبين ١٢ و١ بالليل كان التاريخ بيبقى بكرة والبداية بتطلع
 * **في المستقبل**، فكل أرقام «النهارده» في لوحة الإدارة بتطلع صفر الساعة دي.
 */
const CAIRO = "Africa/Cairo";
const cairoParts = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: CAIRO, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    .format(d).split(", ");

describe("بداية اليوم بتوقيت القاهرة", () => {
  it("دايمًا منتصف الليل في القاهرة، ومش في المستقبل، في الصيف والشتاء", () => {
    const cases = [
      "2026-10-11T21:30:00Z", // ١٢:٣٠ بالليل في القاهرة (توقيت صيفي +03) — الساعة اللي كان بيفشل فيها
      "2026-10-11T21:00:00Z", // أول ثانية في اليوم الجديد بالقاهرة
      "2026-10-11T22:30:00Z",
      "2026-12-15T22:30:00Z", // ١٢:٣٠ بالليل في القاهرة (توقيت شتوي +02)
      "2026-06-01T09:15:30Z",
      "2026-01-01T00:00:00Z",
    ];
    for (const iso of cases) {
      const now = new Date(iso);
      const start = startOfCairoDay(now);
      const [day, time] = cairoParts(start);
      expect(time, iso).toBe("00:00:00"); // منتصف الليل بالقاهرة بالظبط
      expect(day, iso).toBe(cairoParts(now)[0]); // نفس يوم القاهرة
      expect(start.getTime(), iso).toBeLessThanOrEqual(now.getTime()); // مش في المستقبل أبدًا
      expect(now.getTime() - start.getTime(), iso).toBeLessThan(25 * 3600_000);
    }
  });

  it("الطريقة القديمة (فرق ثابت +02:00) كانت بترجّع المستقبل — ودي اللي بنحميها", () => {
    const now = new Date("2026-10-11T21:30:00Z");
    const oldWay = new Date(new Date(now).toLocaleDateString("en-CA", { timeZone: CAIRO }) + "T00:00:00+02:00");
    expect(oldWay.getTime()).toBeGreaterThan(now.getTime()); // الباگ
    expect(startOfCairoDay(now).getTime()).toBeLessThanOrEqual(now.getTime()); // الإصلاح
  });

  it("بداية اليوم متوافقة مع todayCairo", () => {
    expect(cairoParts(startOfCairoDay())[0]).toBe(todayCairo());
  });
});

import { describe, expect, it } from "vitest";
import { ADULT_AGE, ageOn, isAdult, validBirthDate } from "../src/lib/age.js";
import { todayCairo } from "../src/lib/cairo.js";

const d = (s: string) => new Date(s + "T00:00:00Z");
const NOW = d("2026-10-11");

describe("حساب السن", () => {
  it("بيحسب السنين الكاملة", () => {
    expect(ageOn(d("2000-10-11"), NOW)).toBe(26);
    expect(ageOn(d("2000-10-12"), NOW)).toBe(25); // عيد الميلاد بكرة
    expect(ageOn(d("2000-01-01"), NOW)).toBe(26);
    expect(ageOn(d("2000-12-31"), NOW)).toBe(25);
  });

  it("يبقى بالغًا في يوم عيد ميلاده الـ١٨ بالظبط", () => {
    expect(isAdult(d("2008-10-11"), NOW)).toBe(true);  // أتم ١٨ النهارده
    expect(isAdult(d("2008-10-12"), NOW)).toBe(false); // بكرة
    expect(ADULT_AGE).toBe(18);
  });

  it("تاريخ غير محدد = غير بالغ (الأحوط)", () => {
    expect(isAdult(null, NOW)).toBe(false);
    expect(isAdult(undefined, NOW)).toBe(false);
  });

  it("يرفض تواريخ مستحيلة", () => {
    expect(validBirthDate(d("2030-01-01"), NOW)).toBe(false); // المستقبل
    expect(validBirthDate(d("1850-01-01"), NOW)).toBe(false); // أكبر من ١٢٠
    expect(validBirthDate(new Date("نص غلط"), NOW)).toBe(false);
    expect(validBirthDate(d("1990-05-20"), NOW)).toBe(true);
  });
});

/**
 * العطل: `ageOn` كان بيقرا «النهارده» من UTC، والقاهرة +02/+03 — فأول ٢–٣ ساعات من
 * يوم عيد الميلاد السن بيطلع أقل بسنة. النتيجة: اللي يكمّل ١٨ بيتقال له «المحفظة
 * ممنوعة» في يوم عيد ميلاده، واللي يكمّل ٢١ تفضل سقوف ناقصي الأهلية مطبّقة عليه.
 */
describe("السن بيوم القاهرة مش بيوم UTC", () => {
  // ١٢:٣٠ بالليل بالقاهرة = ٩:٣٠ بالليل من اليوم اللي قبله بـ UTC (توقيت صيفي +03)
  const cairoMidnightish = new Date("2026-10-10T21:30:00Z");

  it("بيبقى بالغ من أول لحظة في يوم عيد ميلاده الـ١٨ بتوقيت القاهرة", () => {
    expect(todayCairo(cairoMidnightish)).toBe("2026-10-11"); // يوم القاهرة
    expect(cairoMidnightish.toISOString().slice(0, 10)).toBe("2026-10-10"); // ويوم UTC لسه إمبارح
    expect(ageOn(d("2008-10-11"), cairoMidnightish)).toBe(18);
    expect(isAdult(d("2008-10-11"), cairoMidnightish)).toBe(true);
  });

  it("وبرضه بيفضل أقل من ١٨ قبل عيد ميلاده بيوم", () => {
    expect(isAdult(d("2008-10-12"), cairoMidnightish)).toBe(false);
  });

  it("الشتاء كمان (+02)", () => {
    const winter = new Date("2026-01-14T22:30:00Z"); // ١٢:٣٠ بالليل ١٥ يناير بالقاهرة
    expect(todayCairo(winter)).toBe("2026-01-15");
    expect(ageOn(d("2008-01-15"), winter)).toBe(18);
  });

  it("تاريخ النهارده نفسه مقبول في الساعات دي (كان بيترفض)", () => {
    expect(validBirthDate(d("2026-10-11"), cairoMidnightish)).toBe(true);
    expect(validBirthDate(d("2026-10-12"), cairoMidnightish)).toBe(false); // بكرة لأ
  });
});

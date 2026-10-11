import { describe, expect, it } from "vitest";
import { ADULT_AGE, ageOn, isAdult, validBirthDate } from "../src/lib/age.js";

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

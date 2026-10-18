-- البيع بالشهر بدل اليوم (قرار داليا ١٩ أكتوبر ٢٠٢٦).
-- إضافة عمود بس + ملء من القيمة القديمة × 30 — مفيش حذف ولا تغيير في أي سعر محجوز،
-- و AdCampaign.total محفوظ أصلًا فكل فاتورة قديمة زي ما هي بالحرف.
ALTER TABLE "AdPlacement" ADD COLUMN "pricePerMonth" DECIMAL(10,2);
UPDATE "AdPlacement" SET "pricePerMonth" = "pricePerDay" * 30;
ALTER TABLE "AdPlacement" ALTER COLUMN "pricePerMonth" SET NOT NULL;

ALTER TABLE "AdBooking" ADD COLUMN "pricePerMonth" DECIMAL(10,2);
UPDATE "AdBooking" SET "pricePerMonth" = "pricePerDay" * 30;
ALTER TABLE "AdBooking" ALTER COLUMN "pricePerMonth" SET NOT NULL;

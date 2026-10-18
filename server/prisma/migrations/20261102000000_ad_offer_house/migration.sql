-- نسبة خصم يدوية لكل حملة (لكل عميل) — بتتحسب بعد خصم كود الهدية
ALTER TABLE "AdCampaign" ADD COLUMN "offerPct" INTEGER NOT NULL DEFAULT 0;

-- إعلان بدون حملة: بيتعرض في المواضع الفاضية بس، وبلا حجز ولا سعر
ALTER TABLE "AdCampaign" ADD COLUMN "isHouse" BOOLEAN NOT NULL DEFAULT false;

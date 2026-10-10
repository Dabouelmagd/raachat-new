ALTER TABLE "AdPlacement" ADD COLUMN "dailyImpressions" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AdCampaign" ADD COLUMN "discount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "AdCampaign" ADD COLUMN "giftCode" TEXT;

CREATE TABLE "AdGift" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "months" INTEGER NOT NULL,
    "days" INTEGER NOT NULL,
    "recipient" TEXT,
    "note" TEXT,
    "placements" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TEXT,
    "usedAt" TIMESTAMP(3),
    "usedByCampaignId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdGift_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdGift_code_key" ON "AdGift"("code");
CREATE INDEX "AdGift_usedByCampaignId_idx" ON "AdGift"("usedByCampaignId");

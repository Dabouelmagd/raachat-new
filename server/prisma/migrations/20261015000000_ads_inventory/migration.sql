CREATE TABLE "AdPlacement" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "slots" INTEGER NOT NULL DEFAULT 1,
    "pricePerDay" DECIMAL(10,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AdPlacement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdPlacement_key_key" ON "AdPlacement"("key");

CREATE TABLE "AdCampaign" (
    "id" TEXT NOT NULL,
    "advertiser" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "cta" TEXT NOT NULL DEFAULT '',
    "link" TEXT NOT NULL,
    "grad" INTEGER NOT NULL DEFAULT 0,
    "audience" TEXT NOT NULL DEFAULT 'كل المستخدمين',
    "priority" INTEGER NOT NULL DEFAULT 2,
    "dailyCap" INTEGER NOT NULL DEFAULT 3,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "total" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AdCampaign_status_startDate_endDate_idx" ON "AdCampaign"("status", "startDate", "endDate");

CREATE TABLE "AdBooking" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "pricePerDay" DECIMAL(10,2) NOT NULL,
    CONSTRAINT "AdBooking_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdBooking_campaignId_placementId_key" ON "AdBooking"("campaignId", "placementId");
CREATE INDEX "AdBooking_placementId_idx" ON "AdBooking"("placementId");
ALTER TABLE "AdBooking" ADD CONSTRAINT "AdBooking_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdBooking" ADD CONSTRAINT "AdBooking_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "AdPlacement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "AdBlock" (
    "id" TEXT NOT NULL,
    "placementId" TEXT NOT NULL,
    "fromDate" TEXT NOT NULL,
    "toDate" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdBlock_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AdBlock_placementId_idx" ON "AdBlock"("placementId");
ALTER TABLE "AdBlock" ADD CONSTRAINT "AdBlock_placementId_fkey" FOREIGN KEY ("placementId") REFERENCES "AdPlacement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

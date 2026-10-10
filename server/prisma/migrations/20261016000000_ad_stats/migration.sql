CREATE TABLE "AdStat" (
    "campaignId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "placement" TEXT NOT NULL,
    "shown" INTEGER NOT NULL DEFAULT 0,
    "clicked" INTEGER NOT NULL DEFAULT 0,
    "closed" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "AdStat_pkey" PRIMARY KEY ("campaignId","day","placement")
);
ALTER TABLE "AdStat" ADD CONSTRAINT "AdStat_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Thread" ADD COLUMN "restrictedAt" TIMESTAMP(3);

CREATE TABLE "Broadcast" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "audience" TEXT NOT NULL,
    "reach" INTEGER NOT NULL,
    "devices" INTEGER NOT NULL DEFAULT 0,
    "sentById" TEXT NOT NULL,
    "sentByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Broadcast_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Broadcast_createdAt_idx" ON "Broadcast"("createdAt");

CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

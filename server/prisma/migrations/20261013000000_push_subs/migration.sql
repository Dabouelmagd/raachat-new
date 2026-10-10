CREATE TABLE "PushSub" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PushSub_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PushSub_endpoint_key" ON "PushSub"("endpoint");
CREATE INDEX "PushSub_userId_idx" ON "PushSub"("userId");
ALTER TABLE "PushSub" ADD CONSTRAINT "PushSub_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

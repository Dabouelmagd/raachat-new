-- تمييز رسالة بنجمة. خاص بصاحبه: المفتاح (userId, messageId) ومفيش عرض لغيره.
CREATE TABLE "Star" (
  "userId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Star_pkey" PRIMARY KEY ("userId","messageId")
);
CREATE INDEX "Star_userId_createdAt_idx" ON "Star"("userId","createdAt");
ALTER TABLE "Star" ADD CONSTRAINT "Star_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Star" ADD CONSTRAINT "Star_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

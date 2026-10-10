CREATE TABLE "AdminHandoff" (
    "hash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdminHandoff_pkey" PRIMARY KEY ("hash")
);
CREATE INDEX "AdminHandoff_expiresAt_idx" ON "AdminHandoff"("expiresAt");

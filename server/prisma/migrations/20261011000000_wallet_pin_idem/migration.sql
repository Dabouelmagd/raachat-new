ALTER TABLE "Wallet" ADD COLUMN "pinFails" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Wallet" ADD COLUMN "pinLockedUntil" TIMESTAMP(3);
ALTER TABLE "WalletTx" ADD COLUMN "idemKey" TEXT;
CREATE UNIQUE INDEX "WalletTx_userId_idemKey_key" ON "WalletTx"("userId", "idemKey");

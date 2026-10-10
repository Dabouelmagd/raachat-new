DELETE FROM "RoomParticipant" WHERE "userId" NOT IN (SELECT id FROM "User");
ALTER TABLE "RoomParticipant" ADD CONSTRAINT "RoomParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "RoomParticipant_userId_idx" ON "RoomParticipant"("userId");

-- وصول الرسالة لجهاز العضو (مش قراءتها). عمود جديد بس.
ALTER TABLE "Membership" ADD COLUMN "lastDeliveredAt" TIMESTAMP(3);

-- تثبيت المحادثة فوق القايمة (خاص بكل مستخدم لوحده). عمود جديد بس.
ALTER TABLE "Membership" ADD COLUMN "pinnedAt" TIMESTAMP(3);

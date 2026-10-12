-- كلمة سر اختيارية للحساب: الحسابات القديمة (ودخول الرقم) تفضل بـ NULL وتدخل بكود لمرة واحدة.
ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;

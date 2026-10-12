-- القنوات: قيمة جديدة في ThreadType وعمود وصف — **مفيش تعديل ولا حذف لأي بيانات**.
-- ملحوظة: ALTER TYPE ADD VALUE مسموح جوه ترانزاكشن من بوستجرس ١٢ (الإنتاج ١٦)،
-- بس القيمة الجديدة مينفعش تُستخدم قبل ما الترانزاكشن تخلص — والـ migration دي
-- مابتستخدمهاش، بتضيفها بس.
ALTER TYPE "ThreadType" ADD VALUE IF NOT EXISTS 'channel';
ALTER TABLE "Thread" ADD COLUMN "about" TEXT;

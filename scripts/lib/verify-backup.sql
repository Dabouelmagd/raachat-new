-- فحوص النسخة الاحتياطية المسترجعة (قراءة فقط).
-- بيستخدمها `scripts/verify-backup.sh` على السيرفر، وبيشغّلها كمان اختبار
-- `server/test/backupSql.test.ts` على مخطط القاعدة الحالي — فلو جدول أو عمود
-- اتغيّر اسمه، الاختبار بيفشل بدل ما فحص النسخ يفضل شغّال وهو مابيفحصش حاجة.
--
-- ملحوظة: فحص `_prisma_migrations` مش هنا، هو في السكربت نفسه — لأن Postgres بيحلّ
-- أسماء الجداول وقت التحليل، فذِكر جدول مش موجود كان بيفشّل الملف كله (قاعدة
-- الاختبارات بتطبّق ملفات الـ migration مباشرة ومفيهاش الجدول ده).

-- عدد الصفوف في الجداول المهمة
SELECT 'users'     AS what, count(*) AS n FROM "User"
UNION ALL SELECT 'threads',   count(*) FROM "Thread"
UNION ALL SELECT 'messages',  count(*) FROM "Message"
UNION ALL SELECT 'wallets',   count(*) FROM "Wallet"
UNION ALL SELECT 'campaigns', count(*) FROM "AdCampaign"
ORDER BY what;

-- أعمدة لازم تكون موجودة: لو النسخة قديمة قبل migration، الرقم هيبقى صفر
SELECT 'col_User.birthDate' AS what, count(*)::text AS n
FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'birthDate';

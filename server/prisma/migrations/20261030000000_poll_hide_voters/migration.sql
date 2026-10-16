-- الأصوات مخفية عن الأعضاء: قرار صاحب الاستطلاع وقت الإنشاء.
-- **عمود جديد بس** وبافتراضي false — فكل استطلاع موجود يفضل علنيًا زي ما هو،
-- ومفيش أي تغيير صامت على بيانات قايمة.
ALTER TABLE "Poll" ADD COLUMN "hideVoters" BOOLEAN NOT NULL DEFAULT false;

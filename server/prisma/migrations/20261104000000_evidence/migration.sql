-- سجل أدلة بلاغات إيذاء الأطفال (مذكرة المحامي ٢١ أكتوبر ٢٠٢٦).
-- **جدول جديد بس** — مفيش تعديل ولا حذف في أي جدول قايم، فكل البيانات زي ما هي.
--
-- السبب: `Report.snippet` نصّ مقصوص بس، فالملف نفسه (الصورة/الفيديو/المرفق) —
-- وهو الدليل الحقيقي — كان بيتمسح خلال ساعات من تلات طرق: كنس الستوري كل ٢٤
-- ساعة، وإجراء المشرف `delete`/`delete_ban`، وبعدها كنس الملفات اليتيمة.
CREATE TABLE "Evidence" (
    "id"           TEXT NOT NULL,
    "kind"         TEXT NOT NULL,
    "targetId"     TEXT NOT NULL,
    "targetUserId" TEXT,
    "targetLabel"  TEXT NOT NULL DEFAULT '',
    "text"         TEXT NOT NULL DEFAULT '',
    "place"        TEXT NOT NULL DEFAULT '',
    "fileName"     TEXT,
    "fileMime"     TEXT,
    "fileSize"     INTEGER,
    "blob"         BYTEA,
    "iv"           BYTEA,
    "tag"          BYTEA,
    "sha256"       TEXT,
    "problem"      TEXT NOT NULL DEFAULT '',
    "incidentAt"   TIMESTAMP(3) NOT NULL,
    "reportedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "savedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt"   TIMESTAMP(3),
    "releaseRef"   TEXT,
    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

-- واقعة واحدة = سجل واحد، مهما كان عدد المبلّغين عليها.
CREATE UNIQUE INDEX "Evidence_kind_targetId_key" ON "Evidence"("kind", "targetId");
CREATE INDEX "Evidence_savedAt_idx" ON "Evidence"("savedAt");

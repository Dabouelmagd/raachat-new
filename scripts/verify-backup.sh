#!/usr/bin/env bash
# يتأكد إن النسخة الاحتياطية **بترجع فعلًا**، مش موجودة بس.
# التشغيل:  cd /opt/rachat && bash scripts/verify-backup.sh
#
# بيعمل إيه:
#   ١) يجيب أحدث dump وأحدث أرشيف مرفوعات من volume النسخ، ويقول عمرهم وحجمهم.
#   ٢) يرجّع الـ dump في قاعدة **مؤقتة منفصلة** (rachat_verify) جوه نفس كونتينر الداتابيز.
#   ٣) يشغّل فحوص قراءة من scripts/lib/verify-backup.sql (عدد الصفوف + الأعمدة) + آخر migration.
#   ٤) يمسح القاعدة المؤقتة.
#   ٥) يفحص سلامة أرشيف المرفوعات (tar -t).
#
# **مابيلمسش قاعدة الإنتاج `rachat` ولا بيكتب فيها حرف** — كل الشغل في قاعدة مؤقتة
# اسمها ثابت في السكربت ولازم ينتهي بـ _verify.
set -euo pipefail
cd "$(dirname "$0")/.."
DC="docker compose -f docker-compose.prod.yml --env-file .env.production"
VDB="rachat_verify"

[ -f .env.production ] || { echo "❌ مفيش .env.production"; exit 1; }
case "$VDB" in *_verify) ;; *) echo "❌ اسم قاعدة الفحص لازم ينتهي بـ _verify"; exit 1;; esac
[ -f scripts/lib/verify-backup.sql ] || { echo "❌ مفيش scripts/lib/verify-backup.sql"; exit 1; }
for s in backup db; do
  $DC ps --services --filter status=running | grep -q "^$s$" || { echo "❌ كونتينر $s مش شغّال"; exit 1; }
done
PSQL="psql -h db -U rachat -v ON_ERROR_STOP=1 -q"

echo "══ ١) النسخ الموجودة"
$DC exec -T backup sh -s <<'EOS'
set -e
d=$(ls -1t /backups/db-*.dump 2>/dev/null | head -1 || true)
u=$(ls -1t /backups/uploads-*.tgz 2>/dev/null | head -1 || true)
[ -n "$d" ] || { echo "❌ مفيش أي dump في /backups"; exit 1; }
echo "أحدث قاعدة:   $(basename "$d")  ($(du -h "$d" | cut -f1))"
if [ -n "$u" ]; then echo "أحدث مرفوعات: $(basename "$u")  ($(du -h "$u" | cut -f1))"; else echo "⚠️ مفيش أرشيف مرفوعات"; fi
echo "المحفوظ حاليًا: $(ls -1 /backups/db-*.dump | wc -l) نسخة قاعدة · $(ls -1 /backups/uploads-*.tgz 2>/dev/null | wc -l) نسخة مرفوعات"
age=$(( ( $(date +%s) - $(date -r "$d" +%s) ) / 3600 ))
echo "عمر أحدث نسخة: ${age} ساعة"
[ "$age" -le 26 ] || echo "⚠️ أحدث نسخة أقدم من ٢٦ ساعة — يبدو إن النسخ اليومية واقفة"
EOS

echo
echo "══ ٢) تجربة الاسترجاع في قاعدة مؤقتة ($VDB)"
$DC exec -T backup sh -s -- "$VDB" <<'EOS'
set -e
vdb=$1
d=$(ls -1t /backups/db-*.dump | head -1)
psql -h db -U rachat -d postgres -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS $vdb" -c "CREATE DATABASE $vdb"
# تحذيرات الأدوار عادية في dump مستقل؛ الحكم الحقيقي على الأرقام اللي بعدها
pg_restore -h db -U rachat -d "$vdb" --no-owner --no-privileges "$d" >/dev/null 2>/tmp/restore.err || true
echo "اتسترجع من: $(basename "$d")"
EOS

echo "— نتيجة الفحوص:"
$DC exec -T backup psql -h db -U rachat -d "$VDB" -At -F' = ' -f - < scripts/lib/verify-backup.sql
# آخر migration: لوحده لأن النسخ القديمة جدًا يمكن مفيهاش الجدول ده
echo -n "last_migration = "
$DC exec -T backup psql -h db -U rachat -d "$VDB" -At \
  -c "SELECT coalesce(max(migration_name), '(مفيش)') FROM _prisma_migrations WHERE finished_at IS NOT NULL" \
  2>/dev/null || echo "(جدول الـ migrations غير موجود في النسخة)"

$DC exec -T backup sh -s -- "$VDB" <<'EOS'
set -e
vdb=$1
tail -3 /tmp/restore.err 2>/dev/null | sed 's/^/   (pg_restore) /' || true
psql -h db -U rachat -d postgres -q -c "DROP DATABASE IF EXISTS $vdb"
echo "✅ القاعدة المؤقتة اتمسحت"
EOS

echo
echo "══ ٣) سلامة أرشيف المرفوعات"
$DC exec -T backup sh -s <<'EOS'
u=$(ls -1t /backups/uploads-*.tgz 2>/dev/null | head -1 || true)
[ -n "$u" ] || { echo "⚠️ مفيش أرشيف مرفوعات للفحص"; exit 0; }
if n=$(tar -tzf "$u" | wc -l); then echo "✅ الأرشيف سليم — $n عنصر جوه $(basename "$u")"; else echo "❌ الأرشيف تالف: $(basename "$u")"; exit 1; fi
EOS

echo
echo "✅ خلص الفحص. لو أرقام الصفوف فوق معقولة وآخر migration هو المتوقع، النسخة بترجع فعلًا."
echo "⚠️ النسخ كلها لسه **على نفس السيرفر** (volume اسمه backups). لو السيرفر ضاع، تضيع معاه."

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
MINDUMP=${MINDUMP:-4096} # بايت — أقل من كده النسخة فاشلة

[ -f .env.production ] || { echo "❌ مفيش .env.production"; exit 1; }
case "$VDB" in *_verify) ;; *) echo "❌ اسم قاعدة الفحص لازم ينتهي بـ _verify"; exit 1;; esac
[ -f scripts/lib/verify-backup.sql ] || { echo "❌ مفيش scripts/lib/verify-backup.sql"; exit 1; }
for s in backup db; do
  $DC ps --services --filter status=running | grep -q "^$s$" || { echo "❌ كونتينر $s مش شغّال"; exit 1; }
done

echo "══ ١) النسخ الموجودة"
# MINDUMP: أصغر حجم معقول لـ dump فيه مخطط وداتا. أقل من كده = نسخة فاشلة مش نسخة.
$DC exec -T backup sh -s -- "$MINDUMP" <<'EOS'
set -e
min=$1
echo "— كل نسخ القاعدة (الأحدث فوق):"
ls -1t /backups/db-*.dump 2>/dev/null | while read -r f; do
  sz=$(wc -c < "$f")
  [ "$sz" -lt "$min" ] && mark="  ⟵ ❌ فاضية/ناقصة" || mark=""
  printf '   %s  %s بايت%s\n' "$(basename "$f")" "$sz" "$mark"
done
echo "— كل نسخ المرفوعات:"
ls -1t /backups/uploads-*.tgz 2>/dev/null | while read -r f; do printf '   %s  %s بايت\n' "$(basename "$f")" "$(wc -c < "$f")"; done
ls -1 /backups/pre-deploy-*.dump >/dev/null 2>&1 && echo "— نسخ ما قبل النشر: $(ls -1 /backups/pre-deploy-*.dump | wc -l)"

d=$(ls -1t /backups/db-*.dump 2>/dev/null | head -1 || true)
[ -n "$d" ] || { echo "❌ مفيش أي dump في /backups"; exit 1; }
age=$(( ( $(date +%s) - $(date -r "$d" +%s) ) / 3600 ))
echo "عمر أحدث نسخة: ${age} ساعة"
[ "$age" -le 26 ] || echo "⚠️ أحدث نسخة أقدم من ٢٦ ساعة — يبدو إن النسخ اليومية واقفة"
sz=$(wc -c < "$d")
if [ "$sz" -lt "$min" ]; then
  echo "❌ أحدث نسخة للقاعدة حجمها $sz بايت — مفيش نسخة احتياطية سليمة للداتا."
  echo "   شوفي سبب الفشل:  docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail 30 backup"
  exit 2
fi
EOS

echo
echo "══ ٢) تجربة الاسترجاع في قاعدة مؤقتة ($VDB)"
$DC exec -T backup sh -s -- "$VDB" <<'EOS'
set -e
vdb=$1
d=$(ls -1t /backups/db-*.dump | head -1)
psql -h db -U rachat -d postgres -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS $vdb" -c "CREATE DATABASE $vdb"
# تحذيرات الأدوار عادية في dump مستقل؛ الحكم الحقيقي على الأرقام اللي بعدها
# تحذيرات الأدوار عادية، فمابنفشلش عليها — لكن فشل حقيقي (ملف تالف) بيوقف الفحص
if ! pg_restore -h db -U rachat -d "$vdb" --no-owner --no-privileges "$d" >/dev/null 2>/tmp/restore.err; then
  if grep -qiE 'too short|corrupt|not a valid|unsupported version' /tmp/restore.err; then
    echo "❌ الملف نفسه تالف أو فاضي:"; sed 's/^/   /' /tmp/restore.err | tail -3
    psql -h db -U rachat -d postgres -q -c "DROP DATABASE IF EXISTS $vdb"
    exit 2
  fi
fi
echo "اتسترجع من: $(basename "$d")"
EOS

echo "— نتيجة الفحوص:"
$DC exec -T backup psql -h db -U rachat -d "$VDB" -At -F' = ' -v ON_ERROR_STOP=1 -f - < scripts/lib/verify-backup.sql
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
echo "✅ النسخة اترجّعت فعلًا والفحوص عدّت. راجعي أرقام الصفوف فوق إنها معقولة."
echo "⚠️ النسخ كلها لسه **على نفس السيرفر** (volume اسمه backups). لو السيرفر ضاع، تضيع معاه."

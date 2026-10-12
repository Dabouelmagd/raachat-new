#!/usr/bin/env bash
# يتأكد إن النسخة الاحتياطية **بترجع فعلًا**، مش موجودة بس.
# التشغيل:  cd /opt/rachat && bash scripts/verify-backup.sh
#
# بيعمل إيه:
#   ١) يجيب أحدث dump وأحدث أرشيف مرفوعات من volume النسخ، ويقول عمرهم وحجمهم.
#   ٢) يرجّع الـ dump في قاعدة **مؤقتة منفصلة** (rachat_verify) جوه نفس كونتينر الداتابيز.
#   ٣) يشغّل فحوص قراءة من scripts/lib/verify-backup.sql، **ويحكم على أرقامها** (مش
#      بيطبعها وخلاص): لازم مستخدم واحد على الأقل، ولازم عمود birthDate موجود.
#   ٤) يمسح القاعدة المؤقتة.
#   ٥) يفحص سلامة أرشيف المرفوعات **وعمره** (tar -t وحجم وتاريخ).
#
# **مابيلمسش قاعدة الإنتاج `rachat` ولا بيكتب فيها حرف** — كل الشغل في قاعدة مؤقتة
# اسمها ثابت في السكربت ولازم ينتهي بـ _verify.
#
# قاعدة الملف ده (اتكسرت مرة وكلّفتنا نسخ فاضية لأيام): **كل ✅ لازم تكون نتيجة فحص
# إيجابي على الحاجة نفسها.** مفيش `|| true` ولا `|| echo` على مسار الحكم، ومفيش رقم
# بيتطبع للمراجعة البشرية بدل ما يتفحص، ومفيش ⚠️ على حاجة معناها إن النسخ واقفة.
set -euo pipefail
cd "$(dirname "$0")/.."
DC="docker compose -f docker-compose.prod.yml --env-file .env.production"
VDB="rachat_verify"
MINDUMP=${MINDUMP:-4096}  # بايت — أقل من كده النسخة فاشلة
MINTGZ=${MINTGZ:-100}     # بايت — أرشيف مرفوعات أصغر من كده مش أرشيف
MAXAGE=${MAXAGE:-26}      # ساعة — أقدم من كده يعني النسخ اليومية واقفة

[ -f .env.production ] || { echo "❌ مفيش .env.production"; exit 1; }
case "$VDB" in *_verify) ;; *) echo "❌ اسم قاعدة الفحص لازم ينتهي بـ _verify"; exit 1;; esac
[ -f scripts/lib/verify-backup.sql ] || { echo "❌ مفيش scripts/lib/verify-backup.sql"; exit 1; }
for s in backup db; do
  $DC ps --services --filter status=running | grep -q "^$s$" || { echo "❌ كونتينر $s مش شغّال"; exit 1; }
done

echo "══ ١) النسخ الموجودة"
# MINDUMP: أصغر حجم معقول لـ dump فيه مخطط وداتا. أقل من كده = نسخة فاشلة مش نسخة.
$DC exec -T backup sh -s -- "$MINDUMP" "$MAXAGE" <<'EOS'
set -e
min=$1; maxage=$2
echo "— كل نسخ القاعدة (الأحدث فوق):"
ls -1t /backups/db-*.dump 2>/dev/null | while read -r f; do
  sz=$(wc -c < "$f")
  [ "$sz" -lt "$min" ] && mark="  ⟵ ❌ فاضية/ناقصة" || mark=""
  printf '   %s  %s بايت%s\n' "$(basename "$f")" "$sz" "$mark"
done
echo "— كل نسخ المرفوعات:"
ls -1t /backups/uploads-*.tgz 2>/dev/null | while read -r f; do printf '   %s  %s بايت\n' "$(basename "$f")" "$(wc -c < "$f")"; done
# نسخ ما قبل النشر: بنعدّ السليمة بس — العدد لوحده كان ممكن يبقى كله ملفات فاضية
pre=0; prebad=0
for f in /backups/pre-deploy-*.dump; do
  [ -e "$f" ] || continue
  if [ "$(wc -c < "$f")" -lt "$min" ]; then prebad=$((prebad+1)); else pre=$((pre+1)); fi
done
[ $((pre+prebad)) -gt 0 ] && echo "— نسخ ما قبل النشر: $pre سليمة، $prebad فاضية"

d=$(ls -1t /backups/db-*.dump 2>/dev/null | head -1 || true)
[ -n "$d" ] || { echo "❌ مفيش أي dump في /backups"; exit 1; }
age=$(( ( $(date +%s) - $(date -r "$d" +%s) ) / 3600 ))
echo "عمر أحدث نسخة: ${age} ساعة"
# ده فشل مش تنبيه: نسخة عمرها يومين معناها إن حلقة النسخ واقفة من يومين.
if [ "$age" -gt "$maxage" ]; then
  echo "❌ أحدث نسخة أقدم من ${maxage} ساعة — النسخ اليومية واقفة."
  echo "   شوفي السبب:  docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail 30 backup"
  exit 2
fi
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
# **أي** فشل في pg_restore بيفشّل الفحص. الاستثناء الوحيد: شكاوى الأدوار/الصلاحيات،
# وهي متوقعة في dump مستقل ومالهاش علاقة بسلامة الداتا. (الطريقة القديمة كانت العكس:
# قايمة كلمات محدودة بتفشّل، وأي فشل تاني — ENOSPC، صلاحيات، نص استرجاع — يعدّي في سكوت.)
if ! pg_restore -h db -U rachat -d "$vdb" --no-owner --no-privileges "$d" >/dev/null 2>/tmp/restore.err; then
  real=$(grep -viE 'role "[^"]*" does not exist|must be owner|no privileges|warning: errors ignored on restore' /tmp/restore.err | grep -v '^[[:space:]]*$' || true)
  if [ -n "$real" ]; then
    echo "❌ الاسترجاع فشل:"; printf '%s\n' "$real" | tail -5 | sed 's/^/   /'
    psql -h db -U rachat -d postgres -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS $vdb"
    exit 2
  fi
  echo "   (تحذيرات أدوار/صلاحيات بس — عادية في dump مستقل)"
fi
echo "اتسترجع من: $(basename "$d")"
EOS

echo "— نتيجة الفحوص:"
# بناخد الناتج ونحكم عليه هنا. الأرقام كانت بتتطبع للمراجعة البشرية — وده نفس
# نوع العطل اللي بنطارده: قاعدة فيها صفر مستخدم كانت بتعدّي بـ ✅.
checks=$($DC exec -T backup psql -h db -U rachat -d "$VDB" -At -F' = ' -v ON_ERROR_STOP=1 -f - < scripts/lib/verify-backup.sql)
printf '%s\n' "$checks" | sed 's/^/   /'
val() { printf '%s\n' "$checks" | awk -F' = ' -v k="$1" '$1==k{print $2+0; found=1} END{if(!found) print -1}'; }
users=$(val users); birth=$(val 'col_User.birthDate')
bad=""
[ "$users" -gt 0 ] || bad="النسخة مفيهاش ولا مستخدم واحد (users = $users)"
[ "$birth" = "1" ] || bad="${bad:+$bad؛ }عمود User.birthDate مش موجود في النسخة (نسخة أقدم من migration المحفظة)"
# آخر migration: لو الجدول مش موجود دي معلومة لنسخة قديمة جدًا، مش فشل — لكن الخطأ
# الحقيقي بيتطبع، مابيتكتمش في /dev/null.
echo -n "   last_migration = "
$DC exec -T backup psql -h db -U rachat -d "$VDB" -At \
  -c "SELECT coalesce(max(migration_name), '(مفيش)') FROM _prisma_migrations WHERE finished_at IS NOT NULL" \
  || echo "(جدول الـ migrations غير موجود في النسخة)"

$DC exec -T backup sh -s -- "$VDB" <<'EOS'
set -e
vdb=$1
tail -3 /tmp/restore.err 2>/dev/null | grep -v '^[[:space:]]*$' | sed 's/^/   (pg_restore) /' || true
psql -h db -U rachat -d postgres -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS $vdb"
echo "✅ القاعدة المؤقتة اتمسحت"
EOS

if [ -n "$bad" ]; then echo "❌ النسخة رجعت بس فحوصها سقطت: $bad"; exit 2; fi

echo
echo "══ ٣) سلامة أرشيف المرفوعات"
$DC exec -T backup sh -s -- "$MINTGZ" "$MAXAGE" <<'EOS'
set -e
mintgz=$1; maxage=$2
u=$(ls -1t /backups/uploads-*.tgz 2>/dev/null | head -1 || true)
# مفيش أرشيف = نسخ المرفوعات فاشلة (الأرشيف بيتعمل كل يوم حتى لو المرفوعات فاضية).
# كان بيطبع ⚠️ ويخرج بنجاح، فالسكربت يكمّل ويقول ✅ في الآخر.
[ -n "$u" ] || { echo "❌ مفيش ولا أرشيف مرفوعات في /backups — نسخ المرفوعات فاشلة"; exit 3; }
sz=$(wc -c < "$u"); age=$(( ( $(date +%s) - $(date -r "$u" +%s) ) / 3600 ))
printf '   أحدث أرشيف: %s — %s بايت، عمره %s ساعة\n' "$(basename "$u")" "$sz" "$age"
[ "$sz" -ge "$mintgz" ] || { echo "❌ الأرشيف حجمه $sz بايت — فاضي/ناقص"; exit 3; }
[ "$age" -le "$maxage" ] || { echo "❌ أحدث أرشيف مرفوعات أقدم من ${maxage} ساعة — نسخ المرفوعات واقفة"; exit 3; }
# الحكم على خرج tar نفسه. كان `n=$(tar -tzf "$u" | wc -l)` — والـ if بيفحص نتيجة
# wc اللي مابتفشلش أبدًا، فأرشيف تالف كان بيطلع "✅ سليم — 0 عنصر".
if ! tar -tzf "$u" > /tmp/tarlist 2>/tmp/tarerr; then
  echo "❌ الأرشيف تالف: $(basename "$u")"; tail -3 /tmp/tarerr | sed 's/^/   /'; exit 3
fi
n=$(wc -l < /tmp/tarlist)
[ "$n" -gt 0 ] || { echo "❌ الأرشيف مفتوح بس فاضي — مفيش ولا ملف جوه"; exit 3; }
echo "✅ الأرشيف سليم — $n عنصر"
EOS

echo
echo "✅ النسخة اترجّعت فعلًا وكل الفحوص عدّت (مستخدمين: $users · المخطط محدّث)."
echo "⚠️ النسخ كلها لسه **على نفس السيرفر** (volume اسمه backups). لو السيرفر ضاع، تضيع معاه."

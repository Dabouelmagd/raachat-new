#!/usr/bin/env bash
# يرفع أحدث نسخة احتياطية (قاعدة + مرفوعات) على جوجل درايف — **مشفّرة قبل ما
# تخرج من السيرفر** — ويتأكد بفحص إيجابي إنها اترفعت سليمة وبترجع فعلًا.
#
#   على السيرفر:  cd /opt/rachat && bash scripts/backup-to-drive.sh
#   اطمّني بس:    bash scripts/backup-to-drive.sh --check   (مابيرفعش حاجة)
#   الإعداد مرة واحدة: docs/backup-offsite.md
#
# 🔴 **التشفير قبل الرفع مش رفاهية:** الـ dump فيه رسايل كل المستخدمين وأرقامهم
# وإيميلاتهم، **وسجل أدلة بلاغات إيذاء الأطفال**. جوجل درايف طرف تالت خارج مصر،
# فاللي بيتخزن هناك لازم يكون شفرة مالهاش معنى من غير المفتاح اللي عندنا.
#
# 🔴 **ومفيش ملف خام بيتكتب على قرص السيرفر**: النسخة بتتقرا من الحاوية وتتشفّر
# وتترفع في مواسير متصلة (`exec | gpg | rclone rcat`). القرص مشترك ومساحته
# محدودة، ونسخة خام متبقية عليه لو السكربت اتقطع = بيانات مكشوفة.
set -euo pipefail
cd "$(dirname "$0")/.."
DC="docker compose -f docker-compose.prod.yml --env-file .env.production"
ENVF=.env.production
REMOTE="${RCLONE_REMOTE:-rachat-drive}"
FOLDER="${DRIVE_FOLDER:-raachat-backups}"
KEEP="${KEEP:-14}"

[ -f "$ENVF" ] || { echo "❌ مفيش $ENVF"; exit 1; }
command -v rclone >/dev/null || { echo "❌ rclone مش مثبّت — الخطوات في docs/backup-offsite.md"; exit 1; }
command -v gpg    >/dev/null || { echo "❌ gpg مش مثبّت — apt-get install -y gnupg"; exit 1; }

KEY="$(sed -n 's/^BACKUP_KEY=//p' "$ENVF" | head -1)"
[ -n "$KEY" ] || { echo "❌ BACKUP_KEY مش متضبط في $ENVF — الخطوات في docs/backup-offsite.md"; exit 1; }

# المفتاح في ملف مؤقت ٦٠٠ بدل سطر الأوامر: `ps` بيعرض الأوامر لكل مستخدمي
# السيرفر المشترك، فمفتاح في الأمر = مفتاح مقروء للكل.
PASS=$(mktemp); chmod 600 "$PASS"; printf '%s' "$KEY" > "$PASS"
trap 'rm -f "$PASS"' EXIT
unset KEY

if ! rclone lsd "$REMOTE:" >/dev/null 2>&1; then
  echo "❌ rclone مش عارف يوصل للريموت '$REMOTE' — راجعي docs/backup-offsite.md"
  exit 1
fi

# 🔴 فحص إن التشفير بيشفّر فعلًا — على نصّ صغير قبل أي رفع.
# من غيره فيه ثقب صامت: لو `gpg` عدّى البيانات زي ما هي (إعداد غلط أو بديل
# مكسور)، فحص البصمة بعد التنزيل **بيعدّي** — لأن الأصل والناتج متطابقين —
# والنتيجة إن قاعدة البيانات كلها بترفع **خام** على درايف و✅ بتتطبع.
PROBE=$(printf 'raachat-crypto-probe' | gpg --batch --yes --quiet --symmetric --cipher-algo AES256 --passphrase-file "$PASS" | base64 | tr -d '\n')
[ -n "$PROBE" ] || { echo "❌ gpg ما طلّعش ناتج — التشفير مش شغّال"; exit 1; }
if [ "$PROBE" = "$(printf 'raachat-crypto-probe' | base64 | tr -d '\n')" ]; then
  echo "❌ ناتج gpg زي المدخل بالظبط — ده مش تشفير، والرفع كان هيطلع خام"
  exit 1
fi
if [ "$(printf '%s' "$PROBE" | base64 -d | gpg --batch --yes --quiet --decrypt --passphrase-file "$PASS" 2>/dev/null)" != "raachat-crypto-probe" ]; then
  echo "❌ الفكّ ما رجّعش الأصل — المفتاح أو gpg فيهم مشكلة"
  exit 1
fi

# ---------- وضع الاطمئنان: بيقول الحالة ومابيرفعش ----------
if [ "${1:-}" = "--check" ]; then
  echo "الريموت: $REMOTE:$FOLDER"
  rclone lsl "$REMOTE:$FOLDER" 2>/dev/null | sort -k2 | tail -8 || echo "   (فاضي)"
  n=$(rclone lsf "$REMOTE:$FOLDER" 2>/dev/null | grep -c . || true)
  echo "عدد الملفات على درايف: ${n:-0}"
  exit 0
fi

newest() { $DC exec -T backup sh -c "ls -1t /backups/$1 2>/dev/null | head -1" | tr -d '\r\n'; }

up_one() { # up_one <مسار جوه الحاوية>
  local src="$1" base dst hash back
  base=$(basename "$src")
  dst="$base.gpg"

  if rclone lsf "$REMOTE:$FOLDER/$dst" >/dev/null 2>&1 && [ -n "$(rclone lsf "$REMOTE:$FOLDER/$dst" 2>/dev/null)" ]; then
    echo "   ⏭  $base مرفوعة قبل كده"
    return 0
  fi

  # بصمة الأصل جوه الحاوية — دي اللي هنقارن بيها بعد التنزيل
  hash=$($DC exec -T backup sha256sum "$src" | awk '{print $1}')
  [ -n "$hash" ] || { echo "   ❌ مش قادر أقرا $base"; return 1; }

  # قراءة ← تشفير ← رفع، في ماسورة واحدة بلا أي ملف وسيط على القرص.
  # `pipefail` شغّال فوق، فأي حلقة تفشل بتفشّل الأمر كله — مش بس آخر واحدة.
  if ! $DC exec -T backup cat "$src" \
      | gpg --batch --yes --quiet --symmetric --cipher-algo AES256 --passphrase-file "$PASS" \
      | rclone rcat "$REMOTE:$FOLDER/$dst"; then
    echo "   ❌ فشل رفع $base"
    rclone deletefile "$REMOTE:$FOLDER/$dst" >/dev/null 2>&1 || true  # مانسيبش نصّ ملف
    return 1
  fi

  # 🔴 الفحص الإيجابي: ننزّلها من درايف ونفكّها ونقارن البصمة بالأصل.
  # «rclone قال تمام» مش دليل — الملف ممكن يكون ناقصًا أو اتشفّر بمفتاح تاني،
  # والاكتشاف ساعتها بيبقى يوم ما نحتاجها فعلًا.
  back=$(rclone cat "$REMOTE:$FOLDER/$dst" \
      | gpg --batch --yes --quiet --decrypt --passphrase-file "$PASS" 2>/dev/null \
      | sha256sum | awk '{print $1}')
  if [ "$back" != "$hash" ]; then
    echo "   ❌ $base اترفعت بس اللي رجع مختلف عن الأصل — اتشالت من درايف"
    rclone deletefile "$REMOTE:$FOLDER/$dst" >/dev/null 2>&1 || true
    return 1
  fi
  echo "   ✅ $dst — متحقَّقة (نزلت واتفكّت وطابقت الأصل)"
}

DB=$(newest 'db-*.dump')
UP=$(newest 'uploads-*.tgz')
[ -n "$DB" ] || { echo "❌ مفيش أي dump في /backups — شوفي scripts/verify-backup.sh"; exit 1; }

# 🔴 التاريخ في أول كل تشغيلة — من غيره اللوج مابيجاوبش على سؤاله الوحيد.
# تشغيلتان مختلفتان بتطلّعا **نفس النصّ بالظبط** لما تتخطّيا نفس النسخة
# (`⏭ مرفوعة قبل كده` + `✅ خلص`)، فـ`tail` على اللوج مابيفرّقش بين تشغيلة
# النهاردة وتشغيلة الأسبوع اللي فات — وده بالظبط اللي حصل في ٢٢ أكتوبر ٢٠٢٦:
# قريت اللوج ومكانش فيه طريق أعرف أي تشغيلة دي، واضطرينا نسأل `stat` على
# وقت تعديل الملف. و**UTC صريحة** لأن السيرفر وكرون الاتنين UTC والمستخدم
# بتوقيت القاهرة (+٢/+٣) — نفس درس `cairo.ts`: أي وقت يُسمّى منطقته.
echo "=== $(date -u '+%F %T') UTC — رفع على $REMOTE:$FOLDER"
ok=1
up_one "$DB" || ok=0
# المرفوعات بتترفع **حتى لو القاعدة فشلت** ولا العكس — نفس درس حلقة النسخ:
# فشل واحدة ماينفعش يمنع التانية (كانت جوّه فرع نجاح القاعدة فضاعت معاها).
if [ -n "$UP" ]; then up_one "$UP" || ok=0; fi

# ---------- تنضيف القديم على درايف ----------
# بنشيل الأقدم من آخر $KEEP لكل نوع. الحذف محدود بمجلدنا وبنوعين الأسماء بس.
#
# 🔴 و`|| true` على `grep` هنا **لازمة**: `pipefail` شغّال، و`grep` بيرجّع ١ لما
# مايلاقيش — فأول مرة (مفيش `uploads-` على درايف لسه) كانت بتقتل السكربت **بعد**
# رفع ناجح، فيخرج بفشل والسطر الأخير مايتطبعش. وde فلتر مش حكم: الحكم في
# `up_one` فوق وفي `ok`.
for pat in 'db-' 'uploads-'; do
  { rclone lsf "$REMOTE:$FOLDER" 2>/dev/null || true; } | { grep "^$pat" || true; } | sort | head -n -"$KEEP" | while read -r f; do
    [ -n "$f" ] || continue
    rclone deletefile "$REMOTE:$FOLDER/$f" >/dev/null 2>&1 && echo "   🧹 اتشالت القديمة $f"
  done
done

[ "$ok" = "1" ] || { echo "❌ فيه نسخة ما اترفعتش"; exit 1; }
echo "✅ خلص — آخر $KEEP نسخة لكل نوع على درايف، كلها مشفّرة."

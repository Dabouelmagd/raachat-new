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
# 🔴 إعادة المحاولة بتراجع زمني — **علاج حدّ الاستعلامات مش علاج الشبكة**.
# العطل الحقيقي اللي حصل مرتين (١٠ و١٤ نوفمبر ٢٠٢٦) كان:
#   Error 403: Quota exceeded ... 'Requests per minute' ... consumer 'project_number:202264815644'
# والرقم ده **مشروع rclone نفسه** مش مشروعنا — يعني إحنا بنتشارك حصة واحدة مع
# كل مستخدمي rclone في العالم (ده الافتراضي لما `rclone authorize` يتشغّل بلا
# `client_id` خاص بينا). فالفشل خارج سيطرتنا تمامًا، وبيضرب **المرفوعات**
# (٨٫٤ ميجا) لأنها بتتنادى بعد القاعدة (٤٦ كيلو) فبتاكل الضربة.
#
# والتراجع بالدقايق مش بالثواني **عن قصد**: الحد في حدّ ذاته «لكل دقيقة»، فإعادة
# محاولة فورية بتضرب نفس الحائط. والحل الجذري `client_id` خاص — شوفي
# docs/backup-offsite.md — وده تخفيف مش بديل.
RETRIES="${UP_RETRIES:-3}"
BACKOFF="${UP_BACKOFF:-60}"
# أقصى عدد نسخ قديمة ناقصة نتداركها في التشغيلة الواحدة (لكل نوع). محدود عشان
# تدارك ١٤ يوم مرة واحدة هو نفسه اللي بيفجّر الحد.
CATCHUP="${CATCHUP_MAX:-2}"
# علامة النجاح اللي المراقبة بتفحص عمرها — من غيرها مفيش أي تنبيه لو الرفع وقف.
# shellcheck source=scripts/lib/drivemark.sh
. scripts/lib/drivemark.sh

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

newest() { $DC exec -T backup sh -c "ls -1t /backups/$1 2>/dev/null | head -1" | tr -d '\r\n'; }
# كل النسخ المحلية من نوع، **الأحدث الأول** — بيتبني عليها التدارك.
locals() { $DC exec -T backup sh -c "ls -1t /backups/$1 2>/dev/null" | tr -d '\r'; }

# 🔴 قايمة درايف **بتتجاب مرة واحدة** وبتتفحص محليًا بعد كده.
# قبل كده كل نسخة كانت بتاخد نداءين `lsf` لمجرد السؤال «هي مرفوعة؟» — وده
# استهلاك من نفس الحصة اللي بتوقّعنا. دلوقتي نداء واحد للتشغيلة كلها، والتنضيف
# بيستخدم نفس القايمة بدل ما يسأل تاني. يعني نداءات أقل = احتمال ضرب الحد أقل،
# وهو جزء من العلاج مش تحسينًا شكليًا.
LIST=""
list_drive() { LIST=$({ rclone lsf "$REMOTE:$FOLDER" 2>/dev/null || true; } | { grep . || true; }); }
# `-F` **لازمة**: اسم الملف فيه نقط، و`.` في grep بتطابق أي حرف — فبدونها
# `db-x.dump.gpg` ممكن تطابق اسمًا تانيًا وتتحسب «مرفوعة» وهي مش موجودة.
on_drive() { printf '%s\n' "$LIST" | grep -Fqx -- "$1"; }

# أسماء النسخ المحلية اللي **مش** على درايف — ثقوب فعلية.
holes() { # holes <النمط>
  local f
  while IFS= read -r f; do
    [ -n "$f" ] || continue
    on_drive "$(basename "$f").gpg" || basename "$f"
  done <<EOF
$(locals "$1")
EOF
}

# ---------- وضع الاطمئنان: بيقول الحالة ومابيرفعش ----------
if [ "${1:-}" = "--check" ]; then
  echo "الريموت: $REMOTE:$FOLDER"
  rclone lsl "$REMOTE:$FOLDER" 2>/dev/null | sort -k2 | tail -8 || echo "   (فاضي)"
  list_drive
  n=$(printf '%s\n' "$LIST" | grep -c . || true)
  echo "عدد الملفات على درايف: ${n:-0}"
  # 🔴 الثقوب: نسخة محلية مالهاش مقابل على درايف. من غير السطر ده مفيش طريق
  # نعرف بيه إن فيه يوم ناقص غير إننا نعدّ الأسماء بالعين — وده بالظبط اللي
  # خلّى `uploads-20261109` و`uploads-20261113` يعيشوا أسابيع في سكوت.
  gaps=$( { holes 'db-*.dump'; holes 'uploads-*.tgz'; } | { grep . || true; } )
  if [ -n "$gaps" ]; then
    echo "⚠️  نسخ محلية مش موجودة على درايف:"
    printf '%s\n' "$gaps" | sed 's/^/   /'
  else
    echo "✅ مفيش ثقوب — كل نسخة محلية ليها مقابل على درايف"
  fi
  age=$(drive_mark_age_h "$DRIVE_MARK")
  case "$age" in
    missing) echo "علامة آخر رفع ناجح: مفيش — الرفع عمره ما نجح من هنا" ;;
    bad)     echo "علامة آخر رفع ناجح: الملف $DRIVE_MARK مبهدل — مش دليل نجاح" ;;
    future)  echo "علامة آخر رفع ناجح: وقتها في المستقبل — ساعة السيرفر أو الملف فيهم مشكلة" ;;
    *)       echo "آخر رفع ناجح: قبل $age ساعة ($(head -1 "$DRIVE_MARK" | cut -d' ' -f2-))" ;;
  esac
  exit 0
fi

# up_one بترجّع: 0 = اترفعت واتحقّقت · 2 = موجودة قبل كده · 1 = فشل
up_one() { # up_one <مسار جوه الحاوية>
  local src="$1" base dst hash back
  base=$(basename "$src")
  dst="$base.gpg"

  if on_drive "$dst"; then
    echo "   ⏭  $base مرفوعة قبل كده"
    return 2
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
  LIST=$(printf '%s\n%s' "$LIST" "$dst")  # عشان التنضيف تحت يشوفها بلا نداء تاني
  echo "   ✅ $dst — متحقَّقة (نزلت واتفكّت وطابقت الأصل)"
}

# up_try: نفس up_one ومعاها إعادة محاولة بتراجع زمني. بترجّع نفس الأكواد.
# **بتعيد تشغيل الماسورة من أولها** (قراءة جديدة من الحاوية) لأن `rclone rcat`
# بيقرا من stdin — والمدخل بيتستهلك مرة واحدة، فـ`--retries` بتاعة rclone
# **مابتنفعش هنا أصلًا**. دي السبب إن فشلة واحدة كانت بتبقى نهائية.
up_try() {
  local src="$1" n=1 wait=$BACKOFF rc=0
  while :; do
    rc=0; up_one "$src" || rc=$?
    case "$rc" in 0 | 2) return "$rc" ;; esac
    [ "$n" -ge "$RETRIES" ] && return 1
    echo "   ⏳ إعادة المحاولة بعد $wait ثانية ($n/$RETRIES)"
    sleep "$wait"
    n=$((n + 1)); wait=$((wait * 2))
  done
}
# نجاح للحارس = اترفعت (0) أو موجودة قبل كده (2)
up_ok() { local rc=0; up_try "$1" || rc=$?; [ "$rc" = 0 ] || [ "$rc" = 2 ]; }

# 🔴 تدارك الثقوب القديمة — ده اللي كان ناقص خالص.
# `newest` بتاخد **أحدث ملف وبس**، فتشغيلة بكرة بتمشي على نسخة أحدث و**عمرها
# ما بترجع** للي فشلت. يعني فشلة عابرة كانت بتتحوّل لثقب **دايم** على درايف،
# والتنبيه بيقفل من نفسه تاني يوم والثقب بيفضل مكانه في سكوت. حصل فعلًا:
# `uploads-20261109` و`uploads-20261113` ناقصتان والقاعدة كاملة ١٤ يوم.
#
# والفشل هنا **مابيفشّلش التشغيلة** عن قصد: ثقب قديم مش انقطاع جاري، ولو
# خلّيناه يقلب العلامة هيفضل تنبيه دائم على ملف ممكن يكون اترجّع محليًا أصلًا.
catch_up() { # catch_up <النمط> <مسار الأحدث — اتعمل فوق>
  local pat="$1" skip="$2" n=0 f rc
  while IFS= read -r f; do
    [ -n "$f" ] && [ "$f" != "$skip" ] || continue
    on_drive "$(basename "$f").gpg" && continue
    [ "$n" -ge "$CATCHUP" ] && { echo "   … فيه نسخ ناقصة تانية، هتتدارك في التشغيلة الجاية"; break; }
    n=$((n + 1))
    echo "   ↩️  تدارك نسخة ناقصة: $(basename "$f")"
    rc=0; up_try "$f" || rc=$?
    [ "$rc" = 0 ] || echo "   ⚠️  التدارك ما نجحش دلوقتي — التشغيلة الجاية تحاول تاني"
  done <<EOF
$(locals "$pat")
EOF
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
list_drive
ok=1
up_ok "$DB" || ok=0
# المرفوعات بتترفع **حتى لو القاعدة فشلت** ولا العكس — نفس درس حلقة النسخ:
# فشل واحدة ماينفعش يمنع التانية (كانت جوّه فرع نجاح القاعدة فضاعت معاها).
if [ -n "$UP" ]; then up_ok "$UP" || ok=0; fi

# التدارك **بعد** الأحدث عن قصد: لو الحصة ضيّقة، أهم نسخة توصل الأول.
catch_up 'db-*.dump' "$DB"
if [ -n "$UP" ]; then catch_up 'uploads-*.tgz' "$UP"; fi

# ---------- تنضيف القديم على درايف ----------
# بنشيل الأقدم من آخر $KEEP لكل نوع. الحذف محدود بمجلدنا وبنوعين الأسماء بس.
#
# 🔴 و`|| true` على `grep` هنا **لازمة**: `pipefail` شغّال، و`grep` بيرجّع ١ لما
# مايلاقيش — فأول مرة (مفيش `uploads-` على درايف لسه) كانت بتقتل السكربت **بعد**
# رفع ناجح، فيخرج بفشل والسطر الأخير مايتطبعش. وde فلتر مش حكم: الحكم في
# `up_one` فوق وفي `ok`.
for pat in 'db-' 'uploads-'; do
  printf '%s\n' "$LIST" | { grep "^$pat" || true; } | sort | head -n -"$KEEP" | while read -r f; do
    [ -n "$f" ] || continue
    rclone deletefile "$REMOTE:$FOLDER/$f" >/dev/null 2>&1 && echo "   🧹 اتشالت القديمة $f"
  done
done

[ "$ok" = "1" ] || { echo "❌ فيه نسخة ما اترفعتش"; exit 1; }

# 🔴 العلامة **بعد** الحارس فوق، فمابتتكتبش إلا لو كل نسخة اترفعت واتحقّقت.
# ولو اتكتبت فوق الحارس، أي فشل رفع كان بيسيب علامة طازة والمراقبة تقول تمام.
#
# **وبتتكتب كمان لما مفيش جديد يترفع** (`⏭ مرفوعة قبل كده`) عن قصد: الوصول
# لدرايف متحقَّق في أول السكربت (`rclone lsd`)، وأحدث نسخة محلية موجودة هناك
# فعلًا — فالرفع مش واقف. ولو كتبناها على الرفع الجديد وحده، أي يوم النسخة
# المحلية ما اتجدّدتش فيه (وده عطل **فحص ٧** بيقوله) كان هيطلّع تنبيهًا تانيًا
# على نفس السبب: ضجيج بيدرّب الواحد إنه يتجاهل التنبيه.
drive_mark_write "$(basename "$DB")${UP:+ $(basename "$UP")}"
echo "✅ خلص — آخر $KEEP نسخة لكل نوع على درايف، كلها مشفّرة."

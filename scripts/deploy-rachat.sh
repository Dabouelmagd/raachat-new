#!/usr/bin/env bash
# نشر رع شات على السيرفر. التشغيل:  cd /opt/rachat && bash scripts/deploy-rachat.sh
# FORCE=1 → يعيد البناء حتى لو مفيش تغيير.   BACKUP=0 → يتخطّى النسخة الاحتياطية قبل migration.
set -euo pipefail
cd "$(dirname "$0")/.."
DC="docker compose -f docker-compose.prod.yml --env-file .env.production"
[ -f .env.production ] || { echo "❌ مفيش .env.production (انسخي .env.production.example واملئيه)"; exit 1; }

# أي تعديل يدوي على السيرفر بيكسر pull — نرجّع lock files بس، وغيرها نوقف ونقول
if [ -n "$(git status --porcelain --untracked-files=no | grep -v 'package-lock.json' || true)" ]; then
  echo "❌ فيه تعديلات محلية على السيرفر (مينفعش). ابعتي ناتج git status لـ Claude:"; git status --short; exit 1
fi
git checkout -- '*package-lock.json' 2>/dev/null || true

# المقارنة بآخر نسخة **اتنشرت فعلًا**، مش بالـ HEAD قبل الـ pull — عشان لو عملتي git pull
# بإيدك قبل السكربت، يفضل يعرف إن فيه جديد لسه ما اتبناش.
STATE=.deploy-state
if [ -s "$STATE" ]; then OLD=$(cat "$STATE"); KNOWN=1; else OLD=""; KNOWN=0; fi
git pull --ff-only
NEW=$(git rev-parse HEAD)
if [ "$KNOWN" = 1 ]; then echo "آخر نسخة منشورة: ${OLD:0:7} → النسخة الحالية: ${NEW:0:7}";
else echo "النسخة الحالية: ${NEW:0:7} (مش معروف إيه اللي اتنشر قبل كده — هيتبني كل حاجة)"; fi

if [ "$KNOWN" = 1 ] && [ "$OLD" = "$NEW" ] && [ "${FORCE:-0}" != "1" ]; then echo "✅ مفيش جديد (استخدمي FORCE=1 لإعادة البناء)"; exit 0; fi
CHANGED=""
if [ "$KNOWN" = 1 ]; then
  # كان `|| true`. ولو المقارنة فشلت (force-push أو git gc أو clone جديد) كانت
  # CHANGED تطلع **فاضية**، وكل القرارات مبنية عليها: الـ API مايتبنيش، والنسخة
  # الاحتياطية قبل الـ migration تتخطّى، والسكربت يطبع ✅ باسم النسخة الجديدة وهو
  # شغّال صورة قديمة. فمفيش تخمين: مش عارفين = نبني كل حاجة ونعمل نسخة.
  if ! CHANGED=$(git diff --name-only "$OLD" "$NEW" 2>/dev/null); then
    echo "⚠️ مش قادر أقارن بالنسخة المنشورة (${OLD:0:7}) — هتعامل معاها كنشرة أول مرة:"
    echo "   بناء كامل + نسخة احتياطية قبل أي migration."
    KNOWN=0; CHANGED=""
  fi
fi

# السكربت ده بيحدّث نفسه بالـ pull وهو شغّال، وbash بيقرا الملف على دفعات —
# فالباقي بيتنفّذ من النسخة القديمة (أو أسوأ: من موضع مقطوع في الجديدة).
# فلو السكربت نفسه اتغيّر، نعيد تشغيل نفسه من النسخة الجديدة مرة واحدة بس.
if [ "${RACHAT_REEXEC:-0}" != "1" ] && { [ "$KNOWN" = 0 ] || echo "$CHANGED" | grep -q '^scripts/deploy-rachat\.sh$'; }; then
  echo "↻ سكربت النشر نفسه اتحدّث — إعادة تشغيله من النسخة الجديدة"
  RACHAT_REEXEC=1 exec bash "$0" "$@"
fi

# نسخة احتياطية قبل أي migration جديد
if { [ "$KNOWN" = 0 ] || echo "$CHANGED" | grep -q '^server/prisma/migrations/'; } && [ "${BACKUP:-1}" = "1" ] && $DC ps --services --filter status=running | grep -q '^backup$'; then
  echo "↪ فيه migration جديد: نسخة احتياطية للقاعدة أولًا"
  $DC exec -T backup sh -c 'pg_dump -h db -U rachat -Fc rachat > /backups/pre-deploy-$(date +%F-%H%M).dump'
fi

# بناء اللازم بس: server/ → api ، باقي المشروع (src/public/admin/…) → caddy (الواجهة)
SVC=""
if [ "${FORCE:-0}" = "1" ] || [ "$KNOWN" = 0 ]; then SVC="api caddy"; else
  echo "$CHANGED" | grep -q '^server/' && SVC="$SVC api"
  echo "$CHANGED" | grep -qvE '^(server/|docs/|.*\.md$)' && SVC="$SVC caddy"
fi
[ -z "$SVC" ] && { echo "✅ تغييرات وثائق بس — مفيش حاجة تتبني"; echo "$NEW" > "$STATE"; exit 0; }
echo "↪ بناء وتشغيل:$SVC"
$DC up -d --build $SVC
# باقي الخدمات (db / backup) لازم تفضل شغّالة: بدون بناء
$DC up -d

# تأكد إن الخدمة قامت
sleep 6
$DC ps
DOMAIN=$(grep -E '^DOMAIN=' .env.production | cut -d= -f2)
if curl -fsS -H "Host: api.${DOMAIN}" http://127.0.0.1:8085/health >/dev/null; then echo "$NEW" > "$STATE"; echo "✅ الـ API شغّال (127.0.0.1:8085) — النسخة ${NEW:0:7}"; else
  echo "❌ الـ API مش بيرد. آخر لوج:"; $DC logs --tail 50 api; exit 1; fi

# تنضيف صور رع شات المعلّقة (كل بناء بيسيب الصورة القديمة من غير وسم، والمساحة بتزحف
# لحد ما القرص يمتلي والداتابيز تقف). **محدود على صور رع شات** بالوسم project=rachat —
# السيرفر مشترك ومش من حقنا نمسح صور مشاريع تانية. ومابيلمسش كونتينرات ولا volumes
# (يعني النسخ الاحتياطية والداتا في أمان). بعد فحص الصحة عشان لو النشر فشل نقدر نرجع.
# PRUNE=0 لتخطّيه.
if [ "${PRUNE:-1}" = "1" ]; then
  freed=$(docker image prune -f --filter label=project=rachat 2>/dev/null | tail -1)
  echo "🧹 تنضيف صور رع شات المعلّقة: ${freed:-مفيش}"

  # **وكاش البناء — ده هو اللي بياكل القرص فعلًا، مش الصور** (متقاس ١٥ أكتوبر ٢٠٢٦):
  # الصور القديمة بتتنضّف بالسطر اللي فوق وبتطلع `0B` بصدق، إنما كل نشرة فيها
  # `npm ci` و`npx vite build` بتزوّد طبقات كاش والقديمة بتقعد. وصلت ٣١٦ مدخل /
  # ٢٦٫٨٦ جيجا، والتنضيف فضّى ١٨٫٥ منهم والقرص نزل من ٧٤٪ لـ ٥٠٪.
  #
  # **`--filter until=168h` مقصود**: السيرفر مشترك، فمانضّفش غير الكاش الأقدم من
  # أسبوع — الكاش الحديث بتاع المشاريع التانية يفضل مكانه وبناؤها مايبطّأش.
  # و**من غير `-a`**: `-a` بيشيل الكاش المستخدَم كمان فكل بناء بعده يبدأ من الصفر.
  #
  # ومابيفشّلش النشر أبدًا: `0B` نتيجة **صحيحة** (مفيش كاش قديم)، وفشل الأمر نفسه
  # مشكلة نظافة مش حكم على النشرة — والـ `|| true` هنا مقصود وبرّه مسار الحكم،
  # لأن الحكم خلص في فحص الصحة فوق.
  bfreed=$(docker builder prune -f --filter until=168h 2>/dev/null | grep -i 'reclaimed' | tail -1 || true)
  echo "🧹 تنضيف كاش البناء الأقدم من أسبوع: ${bfreed:-مفيش}"

  echo "   مساحة القرص: $(df -Ph / | awk 'NR==2{print $5" مستخدم ("$4" فاضي)"}')"
fi

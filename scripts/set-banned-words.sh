#!/usr/bin/env bash
# يضبط فلتر الكلمات الممنوعة ويتأكد **بفحص حقيقي جوه الكونتينر** إنه بقى شغّال.
#
#   على السيرفر:  cd /opt/rachat && bash scripts/set-banned-words.sh /root/banned.txt
#   اطمّني بس:    bash scripts/set-banned-words.sh --check   (مابيغيّرش حاجة)
#   للإيقاف:      bash scripts/set-banned-words.sh --off
#
# الملف: كل سطر كلمة (أو مفصولة بفاصلة)، والأسطر اللي تبدأ بـ # تعليق.
# القايمة نفسها مابتتطبعش على الشاشة. والملف **مايتحطّش في الريبو** (كلام مسيء).
set -euo pipefail
cd "$(dirname "$0")/.."
DC="docker compose -f docker-compose.prod.yml --env-file .env.production"
ENVF=.env.production
[ -f "$ENVF" ] || { echo "❌ مفيش $ENVF"; exit 1; }

put() { # put KEY VALUE — من غير ما يطبع القيمة
  python3 - "$1" "$2" <<'PY'
import sys,re
k,v=sys.argv[1],sys.argv[2]; p='.env.production'; s=open(p).read()
s = re.sub(rf'^{k}=.*$', lambda m: f"{k}={v}", s, flags=re.M) if re.search(rf'^{k}=', s, re.M) else s+("" if s.endswith("\n") or not s else "\n")+f"{k}={v}\n"
open(p,'w').write(s)
PY
  chmod 600 "$ENVF"
}

# وضع القراءة: بيقول الحالة الحقيقية جوه الكونتينر الشغّال ومابيكتبش حاجة
if [ "${1:-}" = "--check" ]; then
  $DC exec -T api node --input-type=module - < scripts/lib/bannedprobe.mjs || true
  exit 0
fi

if [ "${1:-}" = "--off" ]; then
  echo "⚠️ إيقاف الفلتر معناه إن أي كلام بيعدّي — وسياسة الخصوصية (بند ١١) بتوعد العميل بمرشّح آلي."
  read -rp "متأكدة؟ (yes/no): " OK
  case "$OK" in y|Y|yes|YES|نعم|ايوه|أيوه) ;; *) echo "تمام، مفيش حاجة اتغيّرت."; exit 0;; esac
  put BANNED_WORDS ""
  $DC up -d api >/dev/null
  echo "✅ الفلتر اتوقف."
  exit 0
fi

FILE="${1:-}"
[ -n "$FILE" ] || { echo "❌ الاستخدام: bash scripts/set-banned-words.sh <ملف القايمة>   (أو --off)"; exit 1; }
[ -f "$FILE" ] || { echo "❌ مفيش ملف على المسار ده: $FILE"; exit 1; }

# فحص قبلي: الطول والتكرار والتداخل، والأهم إنها مابتحجبش كلامًا سليمًا
echo "↪ فحص القايمة…"
LIST=$(node scripts/lib/bannedcheck.mjs "$FILE") || { echo "❌ القايمة ما عدّتش الفحص — **مفيش حاجة اتكتبت**."; exit 1; }

# كلمة واحدة للفحص الحقيقي بعد التشغيل (أول كلمة في القايمة)
PROBE=${LIST%%,*}

put BANNED_WORDS "$LIST"
echo "↪ إعادة تشغيل الـ API…"
$DC up -d api >/dev/null
sleep 5

if ! $DC exec -T -e RC_PROBE="$PROBE" api node --input-type=module - < scripts/lib/bannedprobe.mjs; then
  echo "❌ الفحص جوه الكونتينر فشل — **القايمة اتكتبت بس الفلتر مش مؤكَّد**. راجعي السبب فوق."
  exit 1
fi
echo "   (القايمة في .env.production بصلاحية 600، وماتتحطّش في الريبو.)"

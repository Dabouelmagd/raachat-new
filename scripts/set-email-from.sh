#!/usr/bin/env bash
# يبدّل عنوان مرسِل إيميلات التطبيق (`EMAIL_FROM`) — بأمان.
#
#   على السيرفر:  cd /opt/rachat && bash scripts/set-email-from.sh
#   لمرسِل معيّن: bash scripts/set-email-from.sh 'Raa Chat <no-reply@raachateg.com>'
#   اطمّني بس:    bash scripts/set-email-from.sh --check      (مابيكتبش حاجة)
#
# 🔴 ليه سكربت مخصوص بدل تعديل السطر بالإيد: Resend بترفض أي إيميل من دومين
# **غير متحقَّق** بـ٤٠٣، فتبديل المرسِل لدومين لسه `pending` بيوقّف **كل أكواد
# التحقق لكل المستخدمين** (والتسجيل معاها — SMS موقوف أصلًا) **وتنبيهات
# `monitor.sh`** كمان، لأنها بتستخدم نفس `EMAIL_FROM`. والعطل **صامت**: مفيش
# خطأ عند المستخدم غير «تعذّر إرسال الكود الآن».
#
# فالترتيب هنا: فحص الدومين ← كتابة ← إعادة تشغيل ← **إيميل حقيقي** ← تأكيدك
# إنه وصل ← و**تراجع تلقائي** لو ماوصلش. فأسوأ حالة دقيقة وترجع زي ما كانت.
set -euo pipefail
cd "$(dirname "$0")/.."
DC="docker compose -f docker-compose.prod.yml --env-file .env.production"
ENVF=.env.production
[ -f "$ENVF" ] || { echo "❌ مفيش $ENVF"; exit 1; }

set_kv() {
  python3 - "$1" "$2" <<'PY'
import sys, re
k, v = sys.argv[1], sys.argv[2]
p = ".env.production"; s = open(p).read()
s = re.sub(rf'^{re.escape(k)}=.*$', lambda m: f"{k}={v}", s, flags=re.M) if re.search(rf'^{re.escape(k)}=', s, re.M) \
    else s + ("\n" if s and not s.endswith("\n") else "") + f"{k}={v}\n"
open(p, "w").write(s)
PY
}
cfg() { sed -n "s/^$1=//p" "$ENVF" | head -1; }
yes_or_die() { # السؤال بالعربي فالإجابة العربية مقبولة (درس orphan-files)
  case "$1" in
    yes|YES|Yes|نعم|أيوه|ايوه|ايوة|أيوة) return 0 ;;
    *) return 1 ;;
  esac
}

MODE=set
if [ "${1:-}" = "--check" ]; then MODE=check; shift; fi

CUR="$(cfg EMAIL_FROM)"
DOMAIN="$(cfg DOMAIN)"
NEW="${1:-Raa Chat <no-reply@${DOMAIN}>}"

# عنوان الإيميل جوه <> لو موجود، وإلا النصّ كله
ADDR="$(printf '%s' "$NEW" | sed -n 's/.*<\(.*\)>.*/\1/p')"
[ -n "$ADDR" ] || ADDR="$NEW"
case "$ADDR" in
  ""|*[[:space:]]*) echo "❌ عنوان المرسِل مش صالح: '$ADDR'"; exit 1 ;;
  *@*@*) echo "❌ فيه أكتر من @ في '$ADDR'"; exit 1 ;;
  *@*) ;;
  *) echo "❌ مفيش @ في '$ADDR'"; exit 1 ;;
esac
DOM="${ADDR#*@}"
case "$DOM" in *.*) ;; *) echo "❌ دومين مش صالح: '$DOM'"; exit 1 ;; esac

echo "المرسِل الحالي: ${CUR:-(مش متضبط)}"
[ "$MODE" = "check" ] || echo "المرسِل الجديد: $NEW"
echo
echo "— حالة الدومين عند Resend —"
set +e
$DC exec -T -e RC_DOMAIN="$DOM" api node --input-type=module - < scripts/lib/resendomain.mjs
RC=$?
set -e

if [ "$MODE" = "check" ]; then exit 0; fi

case "$RC" in
  0) ;; # متحقَّق — نكمّل
  3)
    # 🔴 مفتاح «الإرسال فقط» مش بيقدر يفحص — فمانفترضش إنه تمام ومانرفضش للأبد.
    # الحكم بيتحوّل لإقرار بشري من اللوحة (نفس نمط `owner-entered` في
    # set-birthdate.sh: اللي مانقدرش نتحقق منه بنفسنا يُسمّى إقرارًا مش تحقّقًا)،
    # والضمان الحقيقي يفضل في إيميل التجربة والتراجع التلقائي تحت.
    echo
    echo "⚠️ مش قادرين نفحص الدومين بالمفتاح ده. افتحي https://resend.com/domains بعينك"
    echo "   وشوفي حالة $DOM. ولو مش Verified، التبديل دلوقتي بيوقّف التسجيل بالإيميل."
    read -rp "اللوحة بتقول إن $DOM حالته Verified؟ (yes/نعم): " A
    yes_or_die "$A" || { echo "⏹ وقفنا بلا أي تغيير."; exit 2; }
    echo "📝 التحقق هنا **بإقرارك** من اللوحة مش بفحص آلي."
    ;;
  2) echo; echo "⏹ وقفنا بلا أي تغيير — حقّقي الدومين في Resend الأول."; exit 2 ;;
  *) echo; echo "⏹ وقفنا بلا أي تغيير — مش قادرين نحكم على حالة الدومين."; exit 1 ;;
esac

if [ "$NEW" = "$CUR" ]; then
  echo
  echo "✅ المرسِل ده مضبوط أصلًا — مفيش حاجة تتغيّر."
  exit 0
fi

rollback() {
  echo
  echo "↩️ بنرجّع المرسِل القديم..."
  set_kv EMAIL_FROM "$CUR"
  chmod 600 "$ENVF"
  $DC up -d api >/dev/null
  sleep 3
  BACK="$($DC exec -T api printenv EMAIL_FROM 2>/dev/null | tr -d '\r' | head -1 || true)"
  if [ "$BACK" = "$CUR" ]; then
    echo "✅ رجعنا للمرسِل القديم ومتحقَّق جوه الحاوية: ${CUR:-(فاضي)}"
  else
    echo "❌ التراجع مش متأكَّد — اللي جوه الحاوية دلوقتي: '${BACK}'"
    echo "   صلّحي السطر بإيدك في .env.production وشغّلي: $DC up -d api"
  fi
  exit 2
}

echo
echo "— كتابة وإعادة تشغيل —"
set_kv EMAIL_FROM "$NEW"
chmod 600 "$ENVF"
$DC up -d api
sleep 3

# 🔴 الحكم على اللي جوه **العملية** مش على السطر في الملف (درس RETENTION):
# من غير السطر في `environment:` بتاعة الـ api القيمة مابتوصلش خالص.
GOT="$($DC exec -T api printenv EMAIL_FROM 2>/dev/null | tr -d '\r' | head -1 || true)"
if [ "$GOT" != "$NEW" ]; then
  echo "❌ القيمة ما وصلتش للعملية — اللي جوه الحاوية: '$GOT'"
  rollback
fi
echo "✅ وصلت للعملية جوه الحاوية"

echo
echo "— إيميل تجربة حقيقي —"
read -rp "عنوان إيميل نبعتله كود تجربة: " TESTTO
set +e
$DC exec -T -e RC_TEST_TO="$TESTTO" api node --input-type=module - < scripts/lib/emailsend.mjs
SENT=$?
set -e
if [ "$SENT" != "0" ]; then
  echo "❌ الإرسال فشل من المرسِل الجديد."
  rollback
fi

echo
# ⚠️ «Resend قبلت» مش «الإيميل وصل» — نفس درس `queued` في Twilio. فالحكم النهائي
# هو وصول الإيميل، واللي يقوله المستخدم مش رد الـAPI.
echo "⚠️ Resend قبلته — بس ده مش معناه إنه وصل. بصّي في الوارد **والـSpam**."
read -rp "وصلك الإيميل على $TESTTO فعلًا؟ (yes/نعم): " GOT2
yes_or_die "$GOT2" || rollback

echo
echo "✅ EMAIL_FROM بقى: $NEW"
echo "   وتنبيهات monitor.sh بتستخدم نفس المرسِل، فهي كمان بقت من الدومين ده."

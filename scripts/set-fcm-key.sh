#!/usr/bin/env bash
# يشغّل الإشعارات **الأصلية** (FCM) للتطبيق المثبَّت.
#
#   على السيرفر:  cd /opt/rachat && bash scripts/set-fcm-key.sh
#   اطمّني بس:    bash scripts/set-fcm-key.sh --check     (مابيكتبش حاجة)
#   الإيقاف:      bash scripts/set-fcm-key.sh --off
#
# 🔴 **ليه ده لازم:** Web Push مابيشتغلش جوه WebView — لا في الـAPK على أندرويد
# ولا جوه WKWebView على iOS. فالتطبيق المثبَّت من المتجر **مايوصلوش ولا إشعار**
# مهما كان VAPID متضبطًا، والمستخدم مايعرفش إن فيه رسالة. والمتصفح مابيتأثرش
# بالملف ده خالص (Web Push شغّال بمفاتيحه).
#
# 🔴 **والقيمة base64 عن قصد:** ملف حساب الخدمة فيه `private_key` بأسطر و`$`،
# والقيمة بتعدّي من `.env.production` لـcompose للحاوية — وcompose بيفسّر
# `${…}` وقارئات `.env` بتقطع عند `#`. نفس سبب `SMS_HTTP`.
#
# 🔴 **والمفتاح مابيتعرضش على الشاشة ولا بيتلزق في أي شات:** بيتلزق في خانة
# مخفية (`read -rs < /dev/tty`) وناتج السكربت كله كلمات (`FCM-OK` · اسم
# المشروع). ده درس توكن rclone و`EVIDENCE_KEY`: تحذير «متبعتهولي» جنب ناتج فيه
# سر **مابيكفيش** — الغلط في التصميم مش في اللي بيشغّل.
set -euo pipefail
cd "$(dirname "$0")/.."
DC="docker compose -f docker-compose.prod.yml --env-file .env.production"
ENVF=.env.production
[ -f "$ENVF" ] || { echo "❌ مفيش $ENVF"; exit 1; }

probe() { $DC exec -T api node --input-type=module - < scripts/lib/fcmcheck.mjs; }

# ── الفحص القبلي: هل compose بيمرّر المفتاح أصلًا؟ ────────────────────────────
# درس RETENTION: المفتاح ممكن يكون في الملف ومايوصلش للعملية خالص، لأن compose
# بيمرّر المتغيرات **واحد واحد بالاسم**. ولو كتبنا من غير السطر ده، السكربت
# يقول ✅ والإشعارات متوقفة — فالوقوف هنا أحسن من نجاح كاذب.
if ! grep -qE '^\s*FCM_SERVICE_ACCOUNT:' docker-compose.prod.yml; then
  echo "❌ docker-compose.prod.yml مافيهوش سطر FCM_SERVICE_ACCOUNT في environment: بتاعة الـ api."
  echo "   من غيره المفتاح **مايوصلش للعملية** والإشعارات تفضل متوقفة وإحنا فاكرينها شغّالة."
  echo "   السطر المطلوب مكتوب في docs/mobile-push.md — وتعديل compose قرارك."
  exit 1
fi

# ── --check: الحالة الحقيقية بلا كتابة ───────────────────────────────────────
if [ "${1:-}" = "--check" ]; then
  if ! grep -qE '^FCM_SERVICE_ACCOUNT=.+' "$ENVF"; then
    echo "⚠️ FCM مش متضبط — التطبيق المثبَّت مايستلمش إشعارات (حالة معروفة مش عطل)."
    echo "   التشغيل:  bash scripts/set-fcm-key.sh"; exit 2
  fi
  echo "↪ فحص حساب الخدمة جوه الكونتينر الشغّال…"
  probe
  echo "ℹ️ ده بيثبّت إن جوجل قبلت حساب الخدمة — **مش** إن جهازًا استلم إشعارًا."
  echo "   ده محتاج توكن جهاز حقيقي، وبيتجرّب من الـAPK نفسه."
  exit 0
fi

# ── --off: إيقاف صريح ────────────────────────────────────────────────────────
if [ "${1:-}" = "--off" ]; then
  python3 - <<'PY'
import re
p='.env.production'; s=open(p).read()
open(p,'w').write(re.sub(r'^FCM_SERVICE_ACCOUNT=.*\n?', '', s, flags=re.M))
PY
  chmod 600 "$ENVF"
  $DC up -d api >/dev/null; sleep 5
  echo "✅ اتوقفت الإشعارات الأصلية. (المتصفح مابيتأثرش — Web Push بمفاتيحه.)"
  exit 0
fi

# ── الضبط ────────────────────────────────────────────────────────────────────
echo "من Firebase Console ← Project settings ← Service accounts ← Generate new private key"
echo "بيتنزّل ملف JSON. حوّليه base64 **على جهازك** والصقيه هنا (مش هيظهر):"
echo "  macOS:  base64 -i key.json | tr -d '\\n' | pbcopy"
echo "  لينكس:  base64 -w0 key.json | xclip -selection clipboard"
echo
printf 'الصقي قيمة base64: '
read -rs SA < /dev/tty
echo
[ -n "$SA" ] || { echo "❌ مفيش قيمة"; exit 1; }

CUR=$(grep -E '^FCM_SERVICE_ACCOUNT=' "$ENVF" | head -1 | cut -d= -f2- || true)
[ "$SA" = "$CUR" ] && { echo "ℹ️ نفس القيمة الحالية — مفيش حاجة اتغيّرت."; exit 0; }

# 🔴 فحص **قبل** الكتابة: حاوية مؤقتة بنفس كود السيرفر. والقيمة بتعدّي في
# **بيئة** العملية مش في سطر الأوامر — `ps` بيعرض الأوامر لكل مستخدمي السيرفر
# المشترك، فسر في أمر = سر مقروء للكل.
echo "↪ فحص حساب الخدمة مع جوجل قبل أي كتابة…"
if ! FCM_SERVICE_ACCOUNT="$SA" $DC run --rm --no-deps -T -e FCM_SERVICE_ACCOUNT \
     --entrypoint node api --input-type=module - < scripts/lib/fcmcheck.mjs; then
  echo "❌ الفحص فشل — **مفيش حاجة اتغيّرت** والإشعارات زي ما كانت."
  exit 1
fi

cp "$ENVF" "$ENVF.fcm.bak"
FCM_SERVICE_ACCOUNT="$SA" python3 - <<'PY'
import os, re
p='.env.production'; s=open(p).read(); v=os.environ['FCM_SERVICE_ACCOUNT']
line=f"FCM_SERVICE_ACCOUNT={v}"
if re.search(r'^FCM_SERVICE_ACCOUNT=', s, re.M):
    s = re.sub(r'^FCM_SERVICE_ACCOUNT=.*$', lambda m: line, s, flags=re.M)
else:
    s = s + ("" if s.endswith("\n") else "\n") + line + "\n"
open(p,'w').write(s)
PY
chmod 600 "$ENVF"

echo "↪ إعادة تشغيل الـ API…"
$DC up -d api >/dev/null; sleep 6

# فحص بعدي **جوه الكونتينر الشغّال** — الحكم إن المفتاح وصل للعملية فعلًا،
# مش إن السطر موجود في ملف.
if ! probe; then
  echo "❌ الكونتينر الشغّال ما عدّاش الفحص — بنرجّع القيمة القديمة."
  mv "$ENVF.fcm.bak" "$ENVF"; chmod 600 "$ENVF"
  $DC up -d api >/dev/null
  exit 1
fi
rm -f "$ENVF.fcm.bak"
echo "✅ الإشعارات الأصلية اتفعّلت."
echo "ℹ️ الفحص بيثبّت إن جوجل قبلت حساب الخدمة — **مش** إن جهازًا استلم."
echo "   التجربة الحقيقية: APK جديد ← تسجيل دخول ← اقفلي التطبيق ← خلّي حد يبعتلك."

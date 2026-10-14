#!/usr/bin/env bash
# يشغّل إشعارات Push: يولّد مفتاحي VAPID مرة واحدة ويحطّهم في .env.production ويعيد تشغيل الـ API والواجهة.
# المفاتيح بتتولّد على السيرفر وماتظهرش على الشاشة. التشغيل:  cd /opt/rachat && bash scripts/set-vapid.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DC="docker compose -f docker-compose.prod.yml --env-file .env.production"
[ -f .env.production ] || { echo "❌ مفيش .env.production"; exit 1; }
cfg() { grep -E "^$1=" .env.production | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d "\r"; }

# ── bash scripts/set-vapid.sh --check ──────────────────────────────────────
# بيقول الحالة الحقيقية **من غير ما يكتب ولا يولّد حاجة**. فحصان إيجابيان:
#  ١) جوه الكونتينر الشغّال: المفتاح العام مشتق من الخاص، والتوقيع (ES256)
#     متحقَّق. ده اللي بيكشف الزوج غير المتطابق — واللي **مافيهوش أي خطأ
#     عندنا**: web-push بيبعت عادي وخدمة الدفع ترفض بـ 403 في سكوت.
#  ٢) اللي `/push/key` بيرجّعه فعلًا: بننادي `createWebPush` بتاعة السيرفر
#     بإعداداته (`scripts/lib/pushprobe.mjs`) ونتأكد إنها رجّعت مُرسِلًا بمفتاح
#     **مش null** و**نفس** المضبوط. المتصفح بيشترك بالمفتاح ده.
#     **مش بـ curl على المسار** — المسار ورا التوكن وبيرجّع 401 لأي سكربت.
if [ "${1:-}" = "--check" ]; then
  prv=$(cfg VAPID_PRIVATE); pub=$(cfg VAPID_PUBLIC)
  if [ -z "$prv" ] && [ -z "$pub" ]; then
    echo "⚠️ VAPID مش متضبط — مفيش إشعارات Push خالص (حالة معروفة مش عطل)."
    echo "   التشغيل:  bash scripts/set-vapid.sh"; exit 2
  fi
  [ -n "$prv" ] && [ -n "$pub" ] || { echo "❌ مفتاح واحد بس متضبط — createWebPush بيرجّع undefined و/push/key بيرجّع null، والواجهة تقول «غير متاح». الإصلاح: FORCE=1 bash scripts/set-vapid.sh"; exit 1; }
  echo "↪ فحص المفاتيح جوه الكونتينر الشغّال…"
  $DC exec -T api node --input-type=module - < scripts/lib/vapidcheck.mjs \
    || { echo "❌ الزوج اللي جوه الـ API مش سليم — كل إشعار بيترفض بـ 403 في سكوت. الإصلاح: FORCE=1 bash scripts/set-vapid.sh"; exit 1; }
  echo "↪ فحص المفتاح اللي /push/key بيوزّعه على المتصفحات…"
  $DC exec -T api node --input-type=module - < scripts/lib/pushprobe.mjs || exit 1
  echo "✅ إشعارات Push شغّالة: الزوج متطابق جوه الـ API، والمفتاح العام بيتوزّع على المتصفحات."
  exit 0
fi

# ── bash scripts/set-vapid.sh --subject mailto:you@example.com ─────────────
# بيغيّر **الموضوع بس** (الـ `sub` في الـ JWT) ومابيلمسش المفاتيح — فمفيش ولا
# اشتراك بيضيع. الاشتراك مربوط بالمفتاح العام مش بالموضوع.
if [ "${1:-}" = "--subject" ]; then
  new=${2:-}
  [ -n "$new" ] || { echo "❌ اكتبي الموضوع:  bash scripts/set-vapid.sh --subject mailto:someone@yourdomain.tld"; exit 1; }
  pub=$(cfg VAPID_PUBLIC); prv=$(cfg VAPID_PRIVATE)
  [ -n "$pub" ] && [ -n "$prv" ] || { echo "❌ VAPID مش متضبط — شغّلي bash scripts/set-vapid.sh الأول"; exit 1; }
  # فحص **قبل** الكتابة: نفس شرط web-push (وإلا الـ API مش هيقوم)
  $DC run --rm --no-deps -T -e VAPID_PUBLIC="$pub" -e VAPID_PRIVATE="$prv" -e VAPID_SUBJECT="$new" \
    --entrypoint node api --input-type=module - < scripts/lib/vapidcheck.mjs \
    || { echo "❌ الموضوع ده ما عدّاش الفحص — مفيش حاجة اتغيّرت"; exit 1; }
  python3 - "$new" <<'PY'
import sys,re
p='.env.production'; s=open(p).read(); v=sys.argv[1]
s = re.sub(r'^VAPID_SUBJECT=.*$', lambda m: f"VAPID_SUBJECT={v}", s, flags=re.M) if re.search(r'^VAPID_SUBJECT=', s, re.M) else s+("\n" if not s.endswith("\n") else "")+f"VAPID_SUBJECT={v}\n"
open(p,'w').write(s)
PY
  chmod 600 .env.production
  echo "↪ إعادة تشغيل الـ API…"
  $DC up -d api >/dev/null; sleep 5
  $DC exec -T api node --input-type=module - < scripts/lib/vapidcheck.mjs || { echo "❌ الكونتينر الشغّال ما عدّاش الفحص بعد التغيير"; exit 1; }
  $DC exec -T api node --input-type=module - < scripts/lib/pushprobe.mjs || exit 1
  echo "✅ الموضوع اتغيّر لـ $new — والمفاتيح زي ما هي فمفيش اشتراك اتأثر."
  exit 0
fi

if grep -qE '^VAPID_PRIVATE=.+' .env.production && [ "${FORCE:-0}" != "1" ]; then
  echo "⚠️ VAPID متضبط بالفعل. تغييره بيلغي كل اشتراكات الإشعارات الحالية."
  echo "   الحالة الحقيقية (بلا كتابة):  bash scripts/set-vapid.sh --check"
  echo "   لو متأكدة:  FORCE=1 bash scripts/set-vapid.sh"; exit 1
fi
EMAIL=$(grep -E '^LETSENCRYPT_EMAIL=' .env.production | cut -d= -f2- || true)
SUBJ=$(grep -E '^VAPID_SUBJECT=.+' .env.production | cut -d= -f2- || true)
[ -n "$SUBJ" ] || SUBJ="mailto:${EMAIL:-admin@$(grep -E '^DOMAIN=' .env.production | cut -d= -f2)}"

# التوليد جوه حاوية الـ API (فيها node) — من غير تثبيت أي حاجة على السيرفر
KEYS=$($DC run --rm --no-deps -T api node < scripts/lib/vapidgen.js)
KEYS=$(echo "$KEYS" | tr -d '\r' | tail -n 1)
PUB=${KEYS%% *}; PRV=${KEYS##* }
[ ${#PUB} -gt 80 ] && [ ${#PRV} -gt 40 ] || { echo "❌ التوليد فشل"; exit 1; }

# فحص إيجابي **قبل** الكتابة: المفتاح العام مشتق من الخاص، والتوقيع (ES256) متحقَّق.
# لو الزوج غلط، كل إشعار بيترفض 403 في سكوت — فالكتابة مابتحصلش أصلًا.
echo "↪ فحص المفاتيح…"
$DC run --rm --no-deps -T -e VAPID_PUBLIC="$PUB" -e VAPID_PRIVATE="$PRV" -e VAPID_SUBJECT="$SUBJ" \
  --entrypoint node api --input-type=module - < scripts/lib/vapidcheck.mjs \
  || { echo "❌ المفاتيح المولّدة ما عدّتش الفحص — مفيش حاجة اتكتبت في .env.production"; exit 1; }

python3 - "$PUB" "$PRV" "$SUBJ" <<'PY'
import sys,re
p='.env.production'; s=open(p).read()
for k,v in zip(("VAPID_PUBLIC","VAPID_PRIVATE","VAPID_SUBJECT"), sys.argv[1:4]):
    s = re.sub(rf'^{k}=.*$', lambda m: f"{k}={v}", s, flags=re.M) if re.search(rf'^{k}=', s, re.M) else s+("\n" if not s.endswith("\n") else "")+f"{k}={v}\n"
open(p,'w').write(s)
PY
chmod 600 .env.production

# الواجهة بتجيب المفتاح العام من /push/key وقت التشغيل، فإعادة تشغيل الـ API كفاية
echo "↪ إعادة تشغيل الـ API…"
$DC up -d api
sleep 5
$DC logs --tail 5 api
echo
# فحص إيجابي جوه الكونتينر الشغّال نفسه: بيثبّت إن المفاتيح **وصلت للعملية**
# (درس RETENTION: المفتاح في الملف ومش في `environment:` = مابيوصلش خالص)
# وإنها متطابقة — مش «التحذير اختفى من اللوج».
if ! $DC exec -T api node --input-type=module - < scripts/lib/vapidcheck.mjs; then
  echo "❌ الكونتينر الشغّال مش شايف مفاتيح VAPID سليمة — ابعتي ناتج الأمر ده لـ Claude:"
  echo "   docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail 20 api"; exit 1
fi
echo "✅ VAPID اتضبط ومتحقَّق جوه الكونتينر (الموضوع: $SUBJ). افتحي التطبيق واسمحي بالإشعارات من المتصفح."

#!/usr/bin/env bash
# يشغّل إشعارات Push: يولّد مفتاحي VAPID مرة واحدة ويحطّهم في .env.production ويعيد تشغيل الـ API والواجهة.
# المفاتيح بتتولّد على السيرفر وماتظهرش على الشاشة. التشغيل:  cd /opt/rachat && bash scripts/set-vapid.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DC="docker compose -f docker-compose.prod.yml --env-file .env.production"
[ -f .env.production ] || { echo "❌ مفيش .env.production"; exit 1; }
if grep -qE '^VAPID_PRIVATE=.+' .env.production && [ "${FORCE:-0}" != "1" ]; then
  echo "⚠️ VAPID متضبط بالفعل. تغييره بيلغي كل اشتراكات الإشعارات الحالية."
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

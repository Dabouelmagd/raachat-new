#!/usr/bin/env bash
# يضبط مفتاح الترجمة **المدفوعة** (Google Cloud Translation v2) في .env.production،
# وبيفحصه بنداء حقيقي قبل ما يسيبه مضبوط.
#
# ⚠️ من ٣٠ أكتوبر ٢٠٢٦ المزوّد الافتراضي هو LibreTranslate المجاني (خدمة جوه
# compose، وليها الأولوية على المفتاح ده) — فالمفتاح هنا احتياطي بس، ومش هيتستخدم
# إلا لو LIBRETRANSLATE_URL اتوقّف صراحةً (قيمة فاضية في .env.production).
# المفتاح مابيظهرش على الشاشة ولا بيتسجّل في history.
# التشغيل:  cd /opt/rachat && bash scripts/set-translate-key.sh
#
# للإلغاء (إيقاف الترجمة المدفوعة): bash scripts/set-translate-key.sh --off
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.production ] || { echo "❌ مفيش .env.production"; exit 1; }

set_kv() {
  python3 - "$1" "$2" <<'PY'
import sys,re
k,v=sys.argv[1],sys.argv[2]
p='.env.production'; s=open(p).read()
s=re.sub(rf'^{re.escape(k)}=.*$', lambda m: f"{k}={v}", s, flags=re.M) if re.search(rf'^{re.escape(k)}=', s, re.M) else s+("\n" if not s.endswith("\n") else "")+f"{k}={v}\n"
open(p,'w').write(s)
PY
}
restart() {
  echo "— إعادة تشغيل الـ API (من غير إعادة بناء) —"
  docker compose -f docker-compose.prod.yml --env-file .env.production up -d api
  sleep 5
  docker compose -f docker-compose.prod.yml --env-file .env.production ps api
}

if [ "${1:-}" = "--off" ]; then
  set_kv GOOGLE_TRANSLATE_KEY ""
  chmod 600 .env.production
  echo "✅ الترجمة المدفوعة اتوقفت (التطبيق هيرجع لقاموس العبارات)"
  restart
  exit 0
fi

read -r -s -p "GOOGLE_TRANSLATE_KEY (بيبدأ بـ AIza — مش هيظهر وانتي بتكتبي): " k; echo
[ -n "$k" ] || { echo "❌ مادخلتيش حاجة — مفيش تغيير"; exit 1; }

# **بنجرّبه قبل ما نثق فيه.** مفتاح غلط أو API مش مفعّلة كانت هتبقى 502 لكل
# مستخدم، والقاعدة في المشروع إن كل ✅ لازم تكون نتيجة فحص إيجابي.
echo "— بنجرّب المفتاح بنداء حقيقي (٤ حروف، تكلفة صفر عمليًا) —"
code=$(curl -sS -o /tmp/tr.json -w '%{http_code}' --max-time 20 \
  "https://translation.googleapis.com/language/translate/v2?key=$k" \
  -H 'Content-Type: application/json' \
  -d '{"q":"مرحبا","target":"en","format":"text"}' || echo 000)
if [ "$code" != "200" ]; then
  echo "❌ المفتاح مارضيش يشتغل (HTTP $code). السبب من جوجل:"
  python3 - <<'PY'
import json
try:
    j=json.load(open('/tmp/tr.json'))
    e=j.get('error',{})
    print("   " + (e.get('message') or str(j))[:300])
    if 'has not been used' in (e.get('message') or '') or 'disabled' in (e.get('message') or ''):
        print("   ← يعني Cloud Translation API نفسها مش مفعّلة في المشروع. فعّليها وجرّبي تاني.")
except Exception:
    print("   (مفيش رد مفهوم)")
PY
  rm -f /tmp/tr.json
  echo "   **مفيش حاجة اتغيّرت** في .env.production."
  exit 2
fi
got=$(python3 -c "import json;print(json.load(open('/tmp/tr.json'))['data']['translations'][0]['translatedText'])" 2>/dev/null || echo "")
rm -f /tmp/tr.json
echo "✅ المفتاح شغّال — «مرحبا» رجعت: $got"

set_kv GOOGLE_TRANSLATE_KEY "$k"
chmod 600 .env.production
restart
echo
echo "المضبوط دلوقتي:"
grep -qE '^GOOGLE_TRANSLATE_KEY=.+' .env.production && echo "  GOOGLE_TRANSLATE_KEY: ✅" || echo "  GOOGLE_TRANSLATE_KEY: —"
echo "  السقف اليومي للكل: ${TRANSLATE_DAILY_CHARS:-15000} حرف (الافتراضي = جوّا الحد المجاني من جوجل)"
echo "  السقف اليومي للمستخدم: ${TRANSLATE_USER_DAILY_CHARS:-3000} حرف"
echo
echo "⚠️ السقوف دي من الكود. لو عايزة تغيّريها، لازم تتضاف في environment بتاعة"
echo "   الـ api في docker-compose.prod.yml كمان (متغيّر مش مذكور هناك مابيوصلش للكونتينر)."

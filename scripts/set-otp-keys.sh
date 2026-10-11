#!/usr/bin/env bash
# يضبط مفاتيح إرسال كود التحقق (Resend للإيميل و/أو Twilio للرسائل) في .env.production
# القيم بتتكتب على السيرفر وماتظهرش على الشاشة ولا بتتسجّل في history.
# التشغيل:  cd /opt/rachat && bash scripts/set-otp-keys.sh
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.production ] || { echo "❌ مفيش .env.production — شغّلي scripts/setup-env.sh الأول"; exit 1; }
DOMAIN=$(grep -E '^DOMAIN=' .env.production | cut -d= -f2)
set_kv() {
  python3 - "$1" "$2" <<'PY'
import sys,re
k,v=sys.argv[1],sys.argv[2]
p='.env.production'; s=open(p).read()
s=re.sub(rf'^{re.escape(k)}=.*$', lambda m: f"{k}={v}", s, flags=re.M) if re.search(rf'^{re.escape(k)}=', s, re.M) else s+("\n" if not s.endswith("\n") else "")+f"{k}={v}\n"
open(p,'w').write(s)
PY
}
ask()  { local v; read -r -p "$1: " v; echo "$v"; }
asks() { local v; read -r -s -p "$1 (مش هيظهر وانتي بتكتبي، Enter لتخطّيه): " v; echo >&2; echo "$v"; }

echo "— Resend (إيميل) —"
r=$(asks 'RESEND_KEY (بيبدأ بـ re_)')
if [ -n "$r" ]; then
  set_kv RESEND_KEY "$r"
  f=$(ask "EMAIL_FROM (Enter للافتراضي: Raa Chat <no-reply@$DOMAIN>)")
  set_kv EMAIL_FROM "${f:-Raa Chat <no-reply@$DOMAIN>}"
  echo "✅ Resend اتضبط"
fi

echo "— Twilio (رسائل SMS) —"
t=$(asks 'TWILIO_SID (بيبدأ بـ AC)')
if [ -n "$t" ]; then
  set_kv TWILIO_SID "$t"
  set_kv TWILIO_TOKEN "$(asks 'TWILIO_TOKEN')"
  set_kv TWILIO_FROM "$(ask 'TWILIO_FROM (رقم بصيغة +1… أو Messaging Service SID بيبدأ بـ MG)')"
  echo "✅ Twilio اتضبط"
fi

chmod 600 .env.production
echo "— إعادة تشغيل الـ API (من غير إعادة بناء) —"
docker compose -f docker-compose.prod.yml --env-file .env.production up -d api
sleep 5
docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail 6 api | sed 's/\(re_\|AC\)[A-Za-z0-9]\{6\}[A-Za-z0-9]*/\1••••••/g'
echo
echo "المضبوط دلوقتي:"
for k in RESEND_KEY EMAIL_FROM TWILIO_SID TWILIO_TOKEN TWILIO_FROM; do
  grep -qE "^$k=.+" .env.production && echo "  $k: ✅" || echo "  $k: —"
done

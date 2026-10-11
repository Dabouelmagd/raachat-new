#!/usr/bin/env bash
# يجهّز .env.production على السيرفر: الأسرار بتتولّد هنا (openssl) ومابتتطبعش، والباقي بيسألك عنه.
# التشغيل:  cd /opt/rachat && bash scripts/setup-env.sh
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env.production ] && { echo "❌ .env.production موجود بالفعل (امسحيه أو عدّليه بإيدك لو عايزة تبدئي من الأول)"; exit 1; }
cp .env.production.example .env.production
chmod 600 .env.production
set_kv() { # set_kv KEY VALUE  — بدون sed عشان القيم ممكن فيها رموز
  python3 - "$1" "$2" <<'PY'
import sys,re
k,v=sys.argv[1],sys.argv[2]
p='.env.production'; s=open(p).read()
line=f"{k}={v}"
s=re.sub(rf'^{re.escape(k)}=.*$', lambda m: line, s, flags=re.M) if re.search(rf'^{re.escape(k)}=', s, re.M) else s+("\n" if not s.endswith("\n") else "")+line+"\n"
open(p,'w').write(s)
PY
}
ask() { local v; read -r -p "$1: " v; echo "$v"; }
asks() { local v; read -r -s -p "$1 (مش هيظهر وانتي بتكتبي، Enter لو هتسيبيه فاضي): " v; echo >&2; echo "$v"; }

set_kv DOMAIN "${DOMAIN:-kenoz.org}"
set_kv POSTGRES_PASSWORD "$(openssl rand -hex 24)"
set_kv JWT_SECRET "$(openssl rand -hex 32)"
set_kv TURN_SECRET "$(openssl rand -hex 24)"
set_kv OWNER_CONTACTS "$(ask 'رقمك أو إيميلك (مالك التطبيق، مثلًا 01012345678)')"
set_kv LETSENCRYPT_EMAIL "$(ask 'إيميلك لشهادات HTTPS')"
echo "— رمز التحقق (OTP): لازم واحد على الأقل (Twilio أو Resend) —"
t=$(asks 'TWILIO_SID'); if [ -n "$t" ]; then set_kv TWILIO_SID "$t"; set_kv TWILIO_TOKEN "$(asks 'TWILIO_TOKEN')"; set_kv TWILIO_FROM "$(ask 'TWILIO_FROM (رقم أو Messaging Service)')"; fi
r=$(asks 'RESEND_KEY'); if [ -n "$r" ]; then set_kv RESEND_KEY "$r"; set_kv EMAIL_FROM "$(ask 'EMAIL_FROM (مثلًا Raa Chat <no-reply@kenoz.org>)')"; fi
if ! grep -qE '^(TWILIO_SID|RESEND_KEY)=.+' .env.production; then echo "⚠️ مفيش Twilio ولا Resend: محدش هيقدر يسجّل دخول لحد ما تضيفيهم."; fi
echo "✅ اتكتب .env.production (الأسماء بس):"; sed 's/=.*/=…/' .env.production

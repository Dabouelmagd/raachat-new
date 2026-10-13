#!/usr/bin/env bash
# يشغّل TURN للمكالمات (coturn): يضبط السر والعناوين في .env.production، يقوّم الخدمة،
# **ويتحقق بمصادقة حقيقية** إن الترحيل شغّال فعلًا — مش بس إن الحاوية قامت.
# التشغيل:  cd /opt/rachat && bash scripts/set-turn.sh
#
# ليه محتاجين TURN: STUN لوحده بيفشل مع نسبة كبيرة من المستخدمين على شبكات
# الموبايل (Symmetric NAT / CGNAT) — المكالمة ترن وتتقفل من غير صوت.
#
# السر مابيتطبعش. و`TURN_URLS`/`TURN_SECRET` موجودين أصلًا في `environment:`
# بتاعة الـ api في compose، فمفيش تعديل على compose هنا.
set -euo pipefail
cd "$(dirname "$0")/.."
DC="docker compose -f docker-compose.prod.yml --env-file .env.production"
[ -f .env.production ] || { echo "❌ مفيش .env.production"; exit 1; }

DOMAIN=$(grep -E '^DOMAIN=' .env.production | cut -d= -f2- || true)
[ -n "$DOMAIN" ] || { echo "❌ مفيش DOMAIN في .env.production"; exit 1; }

set_kv() { # set_kv KEY VALUE — بدون sed عشان القيم فيها رموز
  python3 - "$1" "$2" <<'PY'
import sys,re
k,v=sys.argv[1],sys.argv[2]
p='.env.production'; s=open(p).read()
s = re.sub(rf'^{re.escape(k)}=.*$', lambda m: f"{k}={v}", s, flags=re.M) if re.search(rf'^{re.escape(k)}=', s, re.M) else s+("\n" if not s.endswith("\n") else "")+f"{k}={v}\n"
open(p,'w').write(s)
PY
}

# ١) السر: موجود؟ نستخدمه. مش موجود؟ نولّده (تغييره بيقطع المكالمات الجارية بس)
if ! grep -qE '^TURN_SECRET=.+' .env.production || [ "${FORCE_SECRET:-0}" = "1" ]; then
  set_kv TURN_SECRET "$(openssl rand -hex 24)"
  echo "↪ اتولّد TURN_SECRET جديد (مش هيتطبع)"
fi
SECRET=$(grep -E '^TURN_SECRET=' .env.production | cut -d= -f2-)
[ ${#SECRET} -ge 24 ] || { echo "❌ TURN_SECRET قصير أو فاضي"; exit 1; }

# ٢) العناوين: udp وtcp على نفس المنفذ (tcp بيعدّي شبكات بتحجب udp)
set_kv TURN_URLS "turn:${DOMAIN}:3478?transport=udp,turn:${DOMAIN}:3478?transport=tcp"
chmod 600 .env.production

# ٣) تشغيل coturn + إعادة تشغيل الـ API عشان يقرا المتغيرات الجديدة
echo "↪ تشغيل coturn…"
$DC --profile turn up -d turn
$DC up -d api
sleep 4

# ٤) التحقق — **فحص إيجابي على الحاجة نفسها**: Allocate حقيقي على TURN ببيانات
#    مؤقتة محسوبة بنفس طريقة السيرفر. الفاحص (`scripts/lib/turncheck.mjs`)
#    مجرَّب على coturn حقيقي: بينجح بالسر الصح، وبيفشل بسر غلط وبمنفذ مقفول.
CID=$($DC ps -q turn | tr -d '\r')
[ -n "$CID" ] || { echo "❌ حاوية turn مش شغّالة"; exit 1; }

# الفاحص بيشتغل جوه حاوية الـ api (فيها node) — من غير تثبيت أي حاجة على السيرفر.
# بنجرّب **العنوان العام الأول**: ده بيعدّي على نفس طريق المستخدم الحقيقي
# (DNS + جدار ناري)، فنجاحه معناه الدنيا تمام فعلًا.
run_check() { # run_check HOST
  $DC run --rm --no-deps -T \
    -e TURN_HOST="$1" -e TURN_PORT=3478 -e TURN_SECRET="$SECRET" -e TURN_USER=setup \
    api node < scripts/lib/turncheck.mjs
}
echo "↪ فحص TURN على العنوان العام ($DOMAIN)…"
if run_check "$DOMAIN"; then
  PUBLIC_OK=1
else
  PUBLIC_OK=0
  echo "↪ العام مارضيش — نجرّب من جوه السيرفر عشان نفرّق بين «coturn غلط» و«الجدار الناري مقفول»…"
  GW=$(docker network inspect bridge -f '{{(index .IPAM.Config 0).Gateway}}' 2>/dev/null || true)
  [ -n "$GW" ] || { echo "❌ مش قادر أعرف عنوان المضيف للفحص الداخلي"; exit 1; }
  if run_check "$GW"; then
    echo "❌ coturn والمصادقة تمام من **جوه** السيرفر، بس العنوان العام مش شغّال."
    echo "   يعني المشكلة في الجدار الناري أو الـ DNS، مش في coturn:"
    echo "   • افتحي 3478/udp و3478/tcp و49160-49200/udp (ufw + جدار Hetzner لو مفعّل)"
    echo "   • واتأكدي إن $DOMAIN بيشاور على IP السيرفر"
    exit 1
  fi
  echo "❌ الفحص فشل من جوه السيرفر كمان — لوج coturn:"; $DC logs --tail 25 turn; exit 1
fi

# (ب) الـ API شايف المتغيرات جوه الحاوية (درس RETENTION: compose بيمرّر بالاسم)
if ! $DC exec -T api node -e '
  if (!process.env.TURN_URLS || !process.env.TURN_SECRET) { console.error("missing"); process.exit(1); }
  console.log("ok");
' >/tmp/turnapi.log 2>&1; then
  echo "❌ الـ API مش شايف TURN_URLS/TURN_SECRET جوه الحاوية:"; cat /tmp/turnapi.log; exit 1
fi

echo "✅ TURN شغّال ومتحقَّق (مصادقة + ترحيل من جوه السيرفر) — العناوين: turn:${DOMAIN}:3478 (udp+tcp)"
echo
echo "⚠️ اللي لسه ما اتجرّبش: **مكالمة حقيقية** بين موبايل على بيانات الشبكة"
echo "   وجهاز على واي فاي تاني — ده اللي بيثبت إن الترحيل بيخدم المستخدم فعلًا."
echo "   ولو احتاجتي تفتحي منافذ: 3478/udp و3478/tcp و49160-49200/udp"

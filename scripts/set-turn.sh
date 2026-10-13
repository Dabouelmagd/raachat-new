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

# set_kv لازم تتعرّف قبل أي استخدام — و--off بيستخدمها
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

# --off: إلغاء TURN بنظافة (بيشيل العناوين ويوقّف الخدمة — السر بيفضل مكانه)
if [ "${1:-}" = "--off" ]; then
  set_kv TURN_URLS ""
  $DC stop turn >/dev/null 2>&1 || true   # الخدمة يمكن مش شغّالة من الأساس
  $DC up -d api
  echo "✅ TURN اتوقف والعناوين اتشالت — التطبيق رجع على STUN لوحده."
  exit 0
fi

# ٠) **تنضيف فوري لعنوان مش بيتحلّ**: لو .env.production فيه TURN_URLS باسم
#    مالوش DNS، كل متصفح بيحاول يحلّه ويفشل = تأخير في بداية كل مكالمة بلا فايدة.
#    فبنشيله على طول قبل أي حاجة تانية.
EXIST_URLS=$(grep -E '^TURN_URLS=.+' .env.production | cut -d= -f2- || true)
if [ -n "$EXIST_URLS" ]; then
  EXIST_HOST=$(printf '%s' "$EXIST_URLS" | sed -E 's|^turn:||; s|[:?].*$||' | head -1)
fi

# ١) السر: موجود؟ نستخدمه. مش موجود؟ نولّده (تغييره بيقطع المكالمات الجارية بس)
if ! grep -qE '^TURN_SECRET=.+' .env.production || [ "${FORCE_SECRET:-0}" = "1" ]; then
  set_kv TURN_SECRET "$(openssl rand -hex 24)"
  echo "↪ اتولّد TURN_SECRET جديد (مش هيتطبع)"
fi
SECRET=$(grep -E '^TURN_SECRET=' .env.production | cut -d= -f2-)
[ ${#SECRET} -ge 24 ] || { echo "❌ TURN_SECRET قصير أو فاضي"; exit 1; }

# ٢) **الترتيب مهم: نتحقق قبل ما نعلن.** الإصدار الأول كان بيكتب `TURN_URLS`
#    الأول وبعدين يفحص — فلو الاسم مش بيتحلّ، الإنتاج يفضل بيوزّع على المتصفحات
#    عنوان TURN مستحيل يوصله (حصل فعلًا: `kenoz.org` المجرّد مالوش سجل A،
#    السجلات على `app.`/`admin.`/`api.` بس). دلوقتي: نختار اسم **بيتحلّ**،
#    نشغّل coturn، نتحقق بـ Allocate حقيقي، **وبعدين** نكتب العناوين.
PREV_URLS=$(grep -E '^TURN_URLS=' .env.production | cut -d= -f2- || true)

# الفاحص بيشتغل جوه حاوية الـ api (فيها node) — نفس بيئة الـ DNS بتاعة التطبيق
in_api() { $DC run --rm --no-deps -T "$@"; }

resolves() { # resolves HOST — بيستخدم DNS بتاع الحاوية زي المستخدم بالظبط
  in_api -e H="$1" api node -e '
    require("dns").promises.lookup(process.env.H).then((r) => { console.log(r.address); })
      .catch(() => process.exit(1));' >/dev/null 2>&1
}

if [ -n "${EXIST_HOST:-}" ] && ! resolves "$EXIST_HOST"; then
  echo "⚠️ TURN_URLS الحالي على «$EXIST_HOST» وهو مالوش DNS — بنشيله فورًا (كان بيأخّر كل مكالمة بلا فايدة)."
  set_kv TURN_URLS ""
  $DC up -d api >/dev/null
fi

echo "↪ بندوّر على اسم بيتحلّ لـ TURN…"
TURN_HOST=""
for cand in "turn.$DOMAIN" "$DOMAIN" "api.$DOMAIN"; do
  if resolves "$cand"; then TURN_HOST=$cand; echo "   ✔ $cand بيتحلّ"; break; fi
  echo "   ✗ $cand مالوش سجل DNS"
done
if [ -z "$TURN_HOST" ]; then
  # آخر حل: عنوان السيرفر العام نفسه (TURN مابيحتاجش شهادة على tcp/udp العادي)
  IP=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}')
  [ -n "$IP" ] || { echo "❌ مفيش اسم بيتحلّ ومش قادر أعرف IP السيرفر — اعملي سجل A لـ turn.$DOMAIN وجرّبي تاني"; exit 1; }
  TURN_HOST=$IP
  echo "   ⚠️ مفيش اسم بيتحلّ — هنستخدم IP السيرفر ($IP) مؤقتًا."
  echo "      الأفضل سجل A لـ turn.$DOMAIN عشان لو الـ IP اتغيّر مايتكسرش."
fi

# ٣) تشغيل coturn
echo "↪ تشغيل coturn…"
$DC --profile turn up -d turn

# ٤) **الانتظار لحد ما يبقى جاهز فعلًا**: coturn بيكتشف عناوين الترحيل وبيجهّز
#    منافذها، وده بياخد أكتر من ثانيتين. النسخة الأولى كانت بتنام ٤ ثواني وتفحص،
#    فتطلع ❌ على سيرفر سليم لسه بيقوم.
GW=$(docker network inspect bridge -f '{{(index .IPAM.Config 0).Gateway}}' 2>/dev/null || true)
check() { # check HOST
  in_api -e TURN_HOST="$1" -e TURN_PORT=3478 -e TURN_SECRET="$SECRET" -e TURN_USER=setup \
    api node < scripts/lib/turncheck.mjs
}
ready=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  if [ -n "$GW" ] && check "$GW" >/tmp/turnlocal.log 2>&1; then ready=1; break; fi
  sleep 4
done
if [ "$ready" != "1" ]; then
  echo "❌ coturn مارضيش يرد من جوه السيرفر بعد ٤٠ ثانية. آخر ناتج فحص:"; tail -n 5 /tmp/turnlocal.log
  echo "   ولوج coturn:"; $DC logs --tail 25 turn; exit 1
fi
echo "✔ coturn بيصادق ويرحّل من جوه السيرفر"

# ٥) الفحص من **العنوان اللي المستخدم هيستخدمه** (DNS + جدار ناري)
echo "↪ فحص TURN على $TURN_HOST…"
if ! check "$TURN_HOST" >/tmp/turnpublic.log 2>&1; then
  echo "❌ coturn سليم من جوه، بس $TURN_HOST:3478 مش شغّال من بره:"; tail -n 4 /tmp/turnpublic.log
  echo "   يعني المشكلة **الجدار الناري** (أو الـ DNS)، مش coturn:"
  echo "   • افتحي 3478/udp و3478/tcp و49160-49200/udp (ufw + جدار Hetzner لو مفعّل)"
  echo "   • واتأكدي إن $TURN_HOST بيشاور على IP السيرفر"
  echo "   ومابنكتبش TURN_URLS طالما الفحص فشل — الإنتاج يفضل على STUN زي ما هو."
  [ -n "$PREV_URLS" ] && echo "   (TURN_URLS الحالي في .env.production: $PREV_URLS)"
  exit 1
fi

# ٦) اتحقق فعلًا → دلوقتي بس نكتب العناوين ونعيد تشغيل الـ api
set_kv TURN_URLS "turn:${TURN_HOST}:3478?transport=udp,turn:${TURN_HOST}:3478?transport=tcp"
chmod 600 .env.production
$DC up -d api
sleep 4

# (ب) الـ API شايف المتغيرات جوه الحاوية (درس RETENTION: compose بيمرّر بالاسم)
if ! $DC exec -T api node -e '
  if (!process.env.TURN_URLS || !process.env.TURN_SECRET) { console.error("missing"); process.exit(1); }
  console.log("ok");
' >/tmp/turnapi.log 2>&1; then
  echo "❌ الـ API مش شايف TURN_URLS/TURN_SECRET جوه الحاوية:"; cat /tmp/turnapi.log; exit 1
fi

echo "✅ TURN شغّال ومتحقَّق بـ Allocate حقيقي على turn:${TURN_HOST}:3478 (udp+tcp)"
echo
echo "⚠️ اللي لسه ما اتجرّبش: **مكالمة حقيقية** بين موبايل على بيانات الشبكة"
echo "   وجهاز على واي فاي تاني — ده اللي بيثبت إن الترحيل بيخدم المستخدم فعلًا."
echo "   ولو احتاجتي تفتحي منافذ: 3478/udp و3478/tcp و49160-49200/udp"

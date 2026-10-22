#!/usr/bin/env bash
# يضبط مفتاح تشفير سجل أدلة بلاغات إيذاء الأطفال، ويتأكد **بفحص حقيقي جوه
# الكونتينر** إنه بقى شغّال (تشفير ← فتح ← والمفتاح الغلط بيترفض).
#
#   على السيرفر:  cd /opt/rachat && bash scripts/set-evidence-key.sh
#   اطمّني بس:    bash scripts/set-evidence-key.sh --check   (مابيغيّرش حاجة)
#   تبديل مفتاح:  bash scripts/set-evidence-key.sh --rotate  (الخزنة لازم تكون فاضية)
#
# 🔴 المفتاح **مابيتطبعش على الشاشة ولا بيدخل git** — بيتولّد هنا ويتكتب في
# `.env.production` (600) وخلاص. وضياعه معناه إن الأدلة المحفوظة **ماتتفتحش
# تاني أبدًا** — فلازم نسخة منه في مدير كلمات السر جنب نسخة `.env.production`
# (نفس قاعدة `docs/runbook-restore.md`).
#
# ⚠️ ومابيبدّلش مفتاحًا موجودًا: التبديل بيخلّي كل دليل محفوظ غير قابل للفتح،
# وده بالظبط «إتلاف أدلة» اللي السجل موجود عشان يمنعه.
set -euo pipefail
cd "$(dirname "$0")/.."
DC="docker compose -f docker-compose.prod.yml --env-file .env.production"
ENVF=.env.production
[ -f "$ENVF" ] || { echo "❌ مفيش $ENVF"; exit 1; }

probe() { $DC exec -T api node --input-type=module - < scripts/lib/evidenceprobe.mjs; }

if [ "${1:-}" = "--check" ]; then
  probe || true
  exit 0
fi

# ---------- تبديل المفتاح ----------
# 🔴 ليه وضع مخصوص بدل «امسحي السطر وشغّلي السكربت»: التبديل آمن **بس** لو
# الخزنة فاضية، والمسح اليدوي للسطر بيتخطّى الحارس في الحالتين — فيوم ما يبقى
# فيه أدلة نفس الحركة بتحرقها. فالحارس هنا **بيعدّ الصفوف بنفسه** بدل ما يسيب
# الحكم لذاكرة اللي بيشغّل.
# (الحاجة له ظهرت ٢٢ أكتوبر ٢٠٢٦: المفتاح اتعرض في محادثة فاتكشف، والخزنة
#  كانت فاضية فالتبديل كان بلا خسارة — إنما لازم الأداة تتأكد مش إحنا.)
ROTATE=0
if [ "${1:-}" = "--rotate" ]; then
  grep -q '^EVIDENCE_KEY=.\+' "$ENVF" || {
    echo "❌ مفيش مفتاح متضبط أصلًا — شغّلي السكربت بلا --rotate."; exit 1; }

  # الحكم من القاعدة. و**فشل مقفول** على أي ناتج مش رقم: استعلام بايظ أو جدول
  # مش موجود بيرجّع فاضي، ومن الفاضي مفيش طريق نفرّق بين «صفر» و«مش عارفين»
  # — ودي نفس حالة orphan-files (ملفات موجودة + صفر مرجع = وقوف بلا مسح).
  n=$($DC exec -T backup psql -h db -U rachat -d rachat -At \
        -c 'SELECT count(*) FROM "Evidence"' 2>/dev/null | tr -d '\r' | head -1 || true)
  case "$n" in
    ''|*[!0-9]*)
      echo "❌ مش قادر أعدّ صفوف Evidence (الناتج: '$n') — وقوف بلا تبديل."
      echo "   جرّبي: $DC ps   وبعدها نفس الاستعلام بإيدك."
      exit 2 ;;
  esac
  if [ "$n" != "0" ]; then
    echo "❌ فيه $n دليل محفوظ في الخزنة — التبديل بيخلّيهم **مستحيل يتفتحوا**."
    echo "   ده إتلاف أدلة، واللي السجل موجود عشان يمنعه. مفيش تبديل."
    exit 2
  fi
  echo "✅ الخزنة فاضية (صفر دليل) — فالتبديل بلا أي خسارة."
  ROTATE=1
fi

# ١) فحص قبلي: compose لازم يمرّر المفتاح، وإلا الكتابة بلا أي أثر.
if ! grep -q '^ *EVIDENCE_KEY:' docker-compose.prod.yml; then
  echo "❌ compose مش بيمرّر EVIDENCE_KEY للـ api — ضيفي السطر في environment: الأول،"
  echo "   وإلا المفتاح هيتكتب في .env.production ومايوصلش للعملية (درس RETENTION)."
  exit 1
fi

# ٢) مفتاح موجود؟ مانلمسوش — إلا في وضع التبديل اللي فحص الخزنة فوق.
if [ "$ROTATE" != "1" ] && grep -q '^EVIDENCE_KEY=.\+' "$ENVF"; then
  echo "⚠️ فيه مفتاح متضبط بالفعل — مش هنبدّله."
  echo "   التبديل بيخلّي كل دليل محفوظ **مستحيل يتفتح** (إتلاف أدلة)."
  echo "   للاطمئنان على الحالة:  bash scripts/set-evidence-key.sh --check"
  exit 0
fi

# ٣) توليد وكتابة — القيمة مابتتطبعش
KEY="$(openssl rand -base64 48 | tr -d '\n=' | tr '+/' '-_')"
python3 - "$KEY" <<'PY'
import sys, re
v = sys.argv[1]; p = ".env.production"; s = open(p).read()
s = re.sub(r'^EVIDENCE_KEY=.*$', f"EVIDENCE_KEY={v}", s, flags=re.M) if re.search(r'^EVIDENCE_KEY=', s, re.M) \
    else s + ("" if s.endswith("\n") or not s else "\n") + f"EVIDENCE_KEY={v}\n"
open(p, "w").write(s)
PY
unset KEY
chmod 600 "$ENVF"
echo "✅ المفتاح اتولّد واتكتب في .env.production (مش متطبوع)"

# ٤) إعادة تشغيل — و`Started` معناها إعادة إنشاء فعلية، `Running` معناها
#    الإعداد ما اتغيّرش يعني المفتاح **ما وصلش** (درس RETENTION).
$DC up -d api
echo
echo "— فحص إيجابي جوه الحاوية —"
sleep 3
probe

cat <<'NOTE'

🔐 خدي نسخة من المفتاح في مدير كلمات السر دلوقتي:
   grep '^EVIDENCE_KEY=' .env.production
   (انسخيها بالعين من الشاشة — ومتلزقيهاش في أي مكان تاني على الشِل.)
   ضياعه = الأدلة المحفوظة ماتتفتحش تاني أبدًا.
NOTE

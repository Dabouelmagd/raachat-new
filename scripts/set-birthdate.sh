#!/usr/bin/env bash
# يحدّد تاريخ ميلاد لحساب **قديم** (منشأ قبل ١٣ أكتوبر ٢٠٢٦، لما الحقل كان اختياري).
#
# التشغيل:  cd /opt/rachat && bash scripts/set-birthdate.sh 01000000000 1990-11-06
#
# ⚠️ القيم **مابتتكتبش في git ولا في أي ملف** — بتتمرّر للأمر وخلاص.
# والنتيجة بتتسجّل في سجل الإجراءات بـ source=owner-entered، لأن الشروط
# والخصوصية بيقولوا إن تاريخ الميلاد «إقرار من المستخدم» — فلو المالك أدخله
# نيابةً عن حد، السجل لازم يقول كده بدل ما ننسب للمستخدم كلامًا ما قالوش.
#
# الحوارس (في `server/src/lib/setBirthDate.ts`، ومتفحوصة باختبارات):
#   • مابيكتبش فوق تاريخ موجود — إقرار المستخدم نفسه هو الأصل.
#   • بيرفض أي تاريخ أقل من ١٨ سنة، وأي تاريخ غير صالح.
set -euo pipefail
cd "$(dirname "$0")/.."
DC="docker compose -f docker-compose.prod.yml --env-file .env.production"
[ -f .env.production ] || { echo "❌ مفيش .env.production"; exit 1; }

CONTACT=${1:-}; BIRTH=${2:-}
if [ -z "$CONTACT" ] || [ -z "$BIRTH" ]; then
  echo "الاستخدام:  bash scripts/set-birthdate.sh <رقم أو إيميل> <YYYY-MM-DD>"; exit 1
fi

$DC exec -T -e RC_CONTACT="$CONTACT" -e RC_BIRTH="$BIRTH" -e RC_BY="المالك" \
  api node --input-type=module - < scripts/lib/setbirth.mjs

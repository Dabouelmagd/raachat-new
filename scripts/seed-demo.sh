#!/usr/bin/env bash
# يملا قاعدة البيانات ببيانات تجريبية (نفس شخصيات الديمو ومحادثاتهم) عشان تقدري تجرّبي التطبيق.
#   bash scripts/seed-demo.sh                      → يزرع البيانات
#   ME=dalia@example.com bash scripts/seed-demo.sh → ويربط حسابك بيهم (محادثة + جروب الشغل)
#   bash scripts/seed-demo.sh --check              → يقول إيه اللي المسح هيشيله (قراءة بس)
#   REMOVE=1 bash scripts/seed-demo.sh             → يمسح البيانات التجريبية (بعد ما يعرض النطاق)
#
# ⚠️ المسح **مابيرجعش**، ونطاقه أوسع من الحسابات: `unseedDemo` بيمسح **كل محادثة
# أي حساب تجريبي عضو فيها** ورسايلها — ومن ضمنها الجروبات العامة الأربعة اللي
# الديمو بيعملها، فأي مستخدم حقيقي انضم لواحدة منها بتتمسح **ورسايله فيها معاها**.
# عشان كده المسح بيعرض النطاق الحقيقي من `demoprobe.mjs` **قبل** ما يسأل.
set -euo pipefail
cd "$(dirname "$0")/.."
DC="docker compose -f docker-compose.prod.yml --env-file .env.production"
[ -f .env.production ] || { echo "❌ مفيش .env.production"; exit 1; }
if ! $DC exec -T api test -f dist/seed-demo.js 2>/dev/null; then
  echo "❌ نسخة الـ API القديمة مفيهاش السكربت. شغّلي الأول:"
  echo "   cd /opt/rachat && git pull && bash scripts/deploy-rachat.sh"; exit 1
fi

# يطبع نطاق المسح الحقيقي. بيرجّع 3 لو فيه حسابات حقيقية متأثرة، 0 لو لأ.
scope() {
  if ! $DC exec -T api test -f dist/lib/demoScope.js 2>/dev/null; then
    echo "❌ نسخة الـ API مفيهاش فحص النطاق. شغّلي النشر الأول:"
    echo "   cd /opt/rachat && bash scripts/deploy-rachat.sh"; exit 1
  fi
  set +e
  $DC exec -T api node --input-type=module - < scripts/lib/demoprobe.mjs
  local rc=$?
  set -e
  return $rc
}

if [ "${1:-}" = "--check" ]; then
  scope || true
  echo
  echo "ℹ️ تقرير بس — مفيش حاجة اتمسحت. للمسح:  REMOVE=1 bash scripts/seed-demo.sh"
  exit 0
fi

if [ "${REMOVE:-0}" = "1" ]; then
  echo "⚠️ هيتمسح: الحسابات التجريبية (010000000x) **وكل محادثة هي عضوة فيها** ورسايلها."
  echo "   حسابك الحقيقي نفسه مابيتمسحش — إنما رسايله جوه المحادثات دي بتتمسح معاها."
  echo
  scope && shared=0 || shared=$?
  echo
  if [ "$shared" = "3" ]; then
    echo "🔴 فيه حسابات حقيقية متأثرة (فوق) — اقري القايمة قبل ما تكملي."
  fi
  read -r -p "اكتبي: امسح   للتأكيد: " ok < /dev/tty
  case "$ok" in
    امسح|امسحي) ;;
    *) echo "اتلغى — مفيش حاجة اتمسحت."; exit 1;;
  esac
  $DC exec -T -e REMOVE=1 api node dist/seed-demo.js
  echo
  echo "— الحالة بعد المسح —"
  scope || true
else
  $DC exec -T -e ME="${ME:-}" api node dist/seed-demo.js
  echo "✅ اتزرعت. سجّلي خروج ودخول تاني من التطبيق عشان البيانات تتحمّل."
  [ -n "${ME:-}" ] || echo "ℹ️ عشان يبقى عندك محادثات جاهزة: ME=<إيميلك أو رقمك> bash scripts/seed-demo.sh"
fi

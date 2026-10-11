#!/usr/bin/env bash
# يملا قاعدة البيانات ببيانات تجريبية (نفس شخصيات الديمو ومحادثاتهم) عشان تقدري تجرّبي التطبيق.
#   bash scripts/seed-demo.sh                      → يزرع البيانات
#   ME=dalia@example.com bash scripts/seed-demo.sh → ويربط حسابك بيهم (محادثة + جروب الشغل)
#   REMOVE=1 bash scripts/seed-demo.sh             → يمسح البيانات التجريبية (الحسابات الحقيقية ما بتتمسّش)
set -euo pipefail
cd "$(dirname "$0")/.."
DC="docker compose -f docker-compose.prod.yml --env-file .env.production"
[ -f .env.production ] || { echo "❌ مفيش .env.production"; exit 1; }
if ! $DC exec -T api test -f dist/seed-demo.js 2>/dev/null; then
  echo "❌ نسخة الـ API القديمة مفيهاش السكربت. شغّلي الأول:"
  echo "   cd /opt/rachat && git pull && bash scripts/deploy-rachat.sh"; exit 1
fi
if [ "${REMOVE:-0}" = "1" ]; then
  echo "⚠️ هيتمسح: الحسابات التجريبية (010000000x) وكل محادثاتها. حساباتك الحقيقية مش هتتأثر."
  read -r -p "اكتبي: امسح   للتأكيد: " ok
  [ "$ok" = "امسح" ] || { echo "اتلغى."; exit 1; }
  $DC exec -T -e REMOVE=1 api node dist/seed-demo.js
else
  $DC exec -T -e ME="${ME:-}" api node dist/seed-demo.js
  echo "✅ اتزرعت. سجّلي خروج ودخول تاني من التطبيق عشان البيانات تتحمّل."
  [ -n "${ME:-}" ] || echo "ℹ️ عشان يبقى عندك محادثات جاهزة: ME=<إيميلك أو رقمك> bash scripts/seed-demo.sh"
fi

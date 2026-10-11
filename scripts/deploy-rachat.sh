#!/usr/bin/env bash
# نشر رع شات على السيرفر. التشغيل:  cd /opt/rachat && bash scripts/deploy-rachat.sh
# FORCE=1 → يعيد البناء حتى لو مفيش تغيير.   BACKUP=0 → يتخطّى النسخة الاحتياطية قبل migration.
set -euo pipefail
cd "$(dirname "$0")/.."
DC="docker compose -f docker-compose.prod.yml --env-file .env.production"
[ -f .env.production ] || { echo "❌ مفيش .env.production (انسخي .env.production.example واملئيه)"; exit 1; }

# أي تعديل يدوي على السيرفر بيكسر pull — نرجّع lock files بس، وغيرها نوقف ونقول
if [ -n "$(git status --porcelain --untracked-files=no | grep -v 'package-lock.json' || true)" ]; then
  echo "❌ فيه تعديلات محلية على السيرفر (مينفعش). ابعتي ناتج git status لـ Claude:"; git status --short; exit 1
fi
git checkout -- '*package-lock.json' 2>/dev/null || true

OLD=$(git rev-parse HEAD)
git pull --ff-only
NEW=$(git rev-parse HEAD)
echo "النسخة: ${OLD:0:7} → ${NEW:0:7}"

CHANGED=$(git diff --name-only "$OLD" "$NEW" || true)
if [ "$OLD" = "$NEW" ] && [ "${FORCE:-0}" != "1" ]; then echo "✅ مفيش جديد (استخدمي FORCE=1 لإعادة البناء)"; exit 0; fi

# نسخة احتياطية قبل أي migration جديد
if echo "$CHANGED" | grep -q '^server/prisma/migrations/' && [ "${BACKUP:-1}" = "1" ]; then
  echo "↪ فيه migration جديد: نسخة احتياطية للقاعدة أولًا"
  $DC exec -T backup sh -c 'pg_dump -h db -U rachat -Fc rachat > /backups/pre-deploy-$(date +%F-%H%M).dump'
fi

# بناء اللازم بس: server/ → api ، باقي المشروع (src/public/admin/…) → caddy (الواجهة)
SVC=""
if [ "${FORCE:-0}" = "1" ]; then SVC="api caddy"; else
  echo "$CHANGED" | grep -q '^server/' && SVC="$SVC api"
  echo "$CHANGED" | grep -qvE '^(server/|docs/|.*\.md$)' && SVC="$SVC caddy"
fi
[ -z "$SVC" ] && { echo "✅ تغييرات وثائق بس — مفيش حاجة تتبني"; exit 0; }
echo "↪ بناء وتشغيل:$SVC"
$DC up -d --build $SVC
# باقي الخدمات (db / backup) لازم تفضل شغّالة: بدون بناء
$DC up -d

# تأكد إن الخدمة قامت
sleep 6
$DC ps
DOMAIN=$(grep -E '^DOMAIN=' .env.production | cut -d= -f2)
if curl -fsS -H "Host: api.${DOMAIN}" http://127.0.0.1:8085/health >/dev/null; then echo "✅ الـ API شغّال (127.0.0.1:8085) — النسخة ${NEW:0:7}"; else
  echo "❌ الـ API مش بيرد. آخر لوج:"; $DC logs --tail 50 api; exit 1; fi

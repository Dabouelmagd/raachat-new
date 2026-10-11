#!/usr/bin/env bash
# يضيف مواقع رع شات في نجنكس ويطلب شهادات HTTPS. بيعمل nginx -t قبل أي reload عشان مايوقعش باقي المواقع.
# التشغيل (على السيرفر):  sudo bash scripts/add-nginx-site.sh   — بيقرا DOMAIN و ACME_EMAIL من .env.production
set -euo pipefail
cd "$(dirname "$0")/.."
DOMAIN=$(grep -E '^DOMAIN=' .env.production | cut -d= -f2)
EMAIL=$(grep -E '^LETSENCRYPT_EMAIL=' .env.production | cut -d= -f2 || true)
[ -n "$DOMAIN" ] || { echo "❌ DOMAIN فاضي في .env.production"; exit 1; }
for h in app api admin; do
  getent hosts "$h.$DOMAIN" >/dev/null || { echo "❌ $h.$DOMAIN مالوش A record لسه (DNS الأول)"; exit 1; }
done
CONF=/etc/nginx/sites-available/rachat
# $connection_upgrade لازم map مرة واحدة في http{} — نضيفه لو مش موجود
if ! grep -rqs 'connection_upgrade' /etc/nginx/nginx.conf /etc/nginx/conf.d /etc/nginx/sites-enabled; then
  printf 'map $http_upgrade $connection_upgrade { default upgrade; "" close; }\n' > /etc/nginx/conf.d/rachat-upgrade-map.conf
fi
[ -f "$CONF" ] && cp "$CONF" "$CONF.bak.$(date +%s)"
sed "s/__DOMAIN__/$DOMAIN/g" deploy/nginx-rachat.conf.template > "$CONF"
ln -sf "$CONF" /etc/nginx/sites-enabled/rachat
if ! nginx -t; then echo "❌ nginx -t فشل — رجّعت كل حاجة"; rm -f /etc/nginx/sites-enabled/rachat; exit 1; fi
systemctl reload nginx
CB=(certbot --nginx -d "app.$DOMAIN" -d "api.$DOMAIN" -d "admin.$DOMAIN" --redirect --non-interactive --agree-tos)
if [ -n "$EMAIL" ]; then CB+=(-m "$EMAIL"); else CB+=(--register-unsafely-without-email); fi
"${CB[@]}"
nginx -t && systemctl reload nginx
echo "✅ https://app.$DOMAIN  https://api.$DOMAIN/health  https://admin.$DOMAIN"

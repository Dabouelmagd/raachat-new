#!/usr/bin/env bash
# يضيف مواقع رع شات في نجنكس ويطلب شهادات HTTPS. بيعمل nginx -t قبل أي reload عشان مايوقعش باقي المواقع.
# التشغيل (على السيرفر):  sudo bash scripts/add-nginx-site.sh   — بيقرا DOMAIN و OLD_DOMAIN و LETSENCRYPT_EMAIL من .env.production
#
# OLD_DOMAIN اختياري: لو مضبوط، الدومين القديم يفضل **شغّالًا جنب الجديد** أثناء
# الانتقال (نفس التطبيق، بتحويل الـ Host — التفاصيل في deploy/nginx-rachat-old.conf.template).
# ولو فاضي أو مش موجود، السلوك زي ما كان بالظبط: الدومين الجديد وحده.
set -euo pipefail
cd "$(dirname "$0")/.."
# المسارات دي قابلة للتعويض عشان الاختبار يشغّل السكربت فعلًا على مجلدات مؤقتة
ENV_FILE="${RACHAT_ENV_FILE:-.env.production}"
CONF="${RACHAT_NGINX_CONF:-/etc/nginx/sites-available/rachat}"
ENABLED_DIR="${RACHAT_NGINX_ENABLED:-/etc/nginx/sites-enabled}"
CONFD_DIR="${RACHAT_NGINX_CONFD:-/etc/nginx/conf.d}"
NGINX_CONF="${RACHAT_NGINX_MAIN:-/etc/nginx/nginx.conf}"
DOMAIN=$(grep -E '^DOMAIN=' "$ENV_FILE" | cut -d= -f2)
OLD_DOMAIN=$(grep -E '^OLD_DOMAIN=' "$ENV_FILE" | cut -d= -f2 || true)
EMAIL=$(grep -E '^LETSENCRYPT_EMAIL=' "$ENV_FILE" | cut -d= -f2 || true)
[ -n "$DOMAIN" ] || { echo "❌ DOMAIN فاضي في $ENV_FILE"; exit 1; }
[ "$OLD_DOMAIN" != "$DOMAIN" ] || { echo "❌ OLD_DOMAIN نفس DOMAIN — شيليه من $ENV_FILE"; exit 1; }
for h in app api admin; do
  getent hosts "$h.$DOMAIN" >/dev/null || { echo "❌ $h.$DOMAIN مالوش A record لسه (DNS الأول)"; exit 1; }
done
# لو الدومين القديم مضبوط، أسماؤه لازم تتحلّ هي كمان — certbot بيفشل على اسم مابيتحلّش
if [ -n "$OLD_DOMAIN" ]; then
  for h in app api admin; do
    getent hosts "$h.$OLD_DOMAIN" >/dev/null || { echo "❌ $h.$OLD_DOMAIN مالوش A record — شيلي OLD_DOMAIN أو ظبّطي الـ DNS"; exit 1; }
  done
fi
# $connection_upgrade لازم map مرة واحدة في http{} — نضيفه لو مش موجود
if ! grep -rqs 'connection_upgrade' "$NGINX_CONF" "$CONFD_DIR" "$ENABLED_DIR"; then
  printf 'map $http_upgrade $connection_upgrade { default upgrade; "" close; }\n' > "$CONFD_DIR/rachat-upgrade-map.conf"
fi
[ -f "$CONF" ] && cp "$CONF" "$CONF.bak.$(date +%s)"
sed "s/__DOMAIN__/$DOMAIN/g" deploy/nginx-rachat.conf.template > "$CONF"
if [ -n "$OLD_DOMAIN" ]; then
  sed -e "s/__OLD_DOMAIN__/$OLD_DOMAIN/g" -e "s/__DOMAIN__/$DOMAIN/g" deploy/nginx-rachat-old.conf.template >> "$CONF"
fi
ln -sf "$CONF" "$ENABLED_DIR/rachat"
if ! nginx -t; then echo "❌ nginx -t فشل — رجّعت كل حاجة"; rm -f "$ENABLED_DIR/rachat"; exit 1; fi
systemctl reload nginx
CB=(certbot --nginx -d "app.$DOMAIN" -d "api.$DOMAIN" -d "admin.$DOMAIN")
if [ -n "$OLD_DOMAIN" ]; then
  CB+=(-d "app.$OLD_DOMAIN" -d "api.$OLD_DOMAIN" -d "admin.$OLD_DOMAIN")
  # لازم --expand: فيه شهادة قايمة للدومين القديم، وبدونها certbot بيفشل في
  # الوضع غير التفاعلي بـ«you have an existing certificate that contains a
  # portion of the domains you requested»
  CB+=(--expand)
fi
CB+=(--redirect --non-interactive --agree-tos)
if [ -n "$EMAIL" ]; then CB+=(-m "$EMAIL"); else CB+=(--register-unsafely-without-email); fi
"${CB[@]}"
nginx -t && systemctl reload nginx
echo "✅ https://app.$DOMAIN  https://api.$DOMAIN/health  https://admin.$DOMAIN"
[ -n "$OLD_DOMAIN" ] && echo "✅ والدومين القديم لسه شغّال: https://app.$OLD_DOMAIN"
exit 0

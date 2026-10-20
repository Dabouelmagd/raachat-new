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
# ⚠️ Caddy الداخلي بيوجّه بالاسم و`DOMAIN` بيوصله من compose، فلو الحاوية الشغّالة
# لسه على الدومين القديم والسكربت ده ظبّط نجنكس على الجديد، Caddy مايلاقيش أي موقع
# والموقع ينزل لحد ما النشرة تشتغل. فالترتيب الصح: نشرة **الأول** ثم السكربت ده على
# طول. تحذير مش رفض — أول تنصيب مفيهوش حاويات أصلًا.
RUNNING_DOMAIN=$(docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" exec -T caddy printenv DOMAIN 2>/dev/null | tr -d '\r\n' || true)
if [ -n "$RUNNING_DOMAIN" ] && [ "$RUNNING_DOMAIN" != "$DOMAIN" ]; then
  echo "⚠️  Caddy الشغّال على $RUNNING_DOMAIN والإعداد بقى $DOMAIN"
  echo "⚠️  الترتيب الصح: bash scripts/deploy-rachat.sh الأول ثم السكربت ده على طول — وإلا الموقع ينزل لحد النشرة"
fi
# $connection_upgrade لازم map مرة واحدة في http{} — نضيفه لو مش موجود
if ! grep -rqs 'connection_upgrade' "$NGINX_CONF" "$CONFD_DIR" "$ENABLED_DIR"; then
  printf 'map $http_upgrade $connection_upgrade { default upgrade; "" close; }\n' > "$CONFD_DIR/rachat-upgrade-map.conf"
fi
# ——— الموقع التعريفي على الدومين المجرّد ———
# بيتضاف لوحده لو ملفاته موجودة في الريبو والاسم بيتحلّ. مفيش مفتاح جديد في
# .env.production عن قصد — مفتاح بيتنسى في compose درس اتكرر عندنا كتير.
SITE_ROOT="$PWD/site"
SITE_NAMES=""
if [ -f "$SITE_ROOT/index.html" ]; then
  if getent hosts "$DOMAIN" >/dev/null; then
    SITE_NAMES="$DOMAIN"
    if getent hosts "www.$DOMAIN" >/dev/null; then
      SITE_NAMES="$SITE_NAMES www.$DOMAIN"
    else
      echo "ℹ️  www.$DOMAIN مالوش A record — الموقع هيشتغل على $DOMAIN وحده"
    fi
    # 🔴 مشروع تاني على نفس السيرفر ممكن يكون حاجز الاسم ده. نجنكس في الحالة
    # دي بيحذّر بس ومابيفشلش، وواحد منهم بيكسب — فالوقوف هنا أأمن من إننا
    # نكتشف بعدين إننا خطفنا موقع حد.
    for n in $SITE_NAMES; do
      CLASH=$(grep -rls "server_name.*[[:space:]]$n[[:space:];]" "$ENABLED_DIR" 2>/dev/null | grep -v '/rachat$' || true)
      [ -z "$CLASH" ] || { echo "❌ $n محجوز في موقع نجنكس تاني: $CLASH — مالمستهوش"; exit 1; }
    done
  else
    echo "ℹ️  $DOMAIN المجرّد مالوش A record — الموقع التعريفي مش هيتضاف"
  fi
fi

[ -f "$CONF" ] && cp "$CONF" "$CONF.bak.$(date +%s)"
sed "s/__DOMAIN__/$DOMAIN/g" deploy/nginx-rachat.conf.template > "$CONF"
if [ -n "$OLD_DOMAIN" ]; then
  sed -e "s/__OLD_DOMAIN__/$OLD_DOMAIN/g" -e "s/__DOMAIN__/$DOMAIN/g" deploy/nginx-rachat-old.conf.template >> "$CONF"
fi
if [ -n "$SITE_NAMES" ]; then
  sed -e "s|__SITE_NAMES__|$SITE_NAMES|g" -e "s|__SITE_ROOT__|$SITE_ROOT|g" deploy/nginx-rachat-site.conf.template >> "$CONF"
fi
ln -sf "$CONF" "$ENABLED_DIR/rachat"
if ! nginx -t; then echo "❌ nginx -t فشل — رجّعت كل حاجة"; rm -f "$ENABLED_DIR/rachat"; exit 1; fi
systemctl reload nginx
CB=(certbot --nginx -d "app.$DOMAIN" -d "api.$DOMAIN" -d "admin.$DOMAIN")
if [ -n "$OLD_DOMAIN" ]; then
  CB+=(-d "app.$OLD_DOMAIN" -d "api.$OLD_DOMAIN" -d "admin.$OLD_DOMAIN")
fi
for n in $SITE_NAMES; do CB+=(-d "$n"); done
# 🔴 `--expand` دايمًا، مش بس مع OLD_DOMAIN: أي إضافة اسم لشهادة قايمة بتفشل
# في الوضع غير التفاعلي بـ«you have an existing certificate that contains a
# portion of the domains you requested». وهو بلا أثر لو مفيش شهادة أصلًا،
# فالشرط كان بيضيّق الحارس على حالة واحدة من تلاتة.
CB+=(--expand --redirect --non-interactive --agree-tos)
if [ -n "$EMAIL" ]; then CB+=(-m "$EMAIL"); else CB+=(--register-unsafely-without-email); fi
"${CB[@]}"
nginx -t && systemctl reload nginx
echo "✅ https://app.$DOMAIN  https://api.$DOMAIN/health  https://admin.$DOMAIN"
[ -n "$OLD_DOMAIN" ] && echo "✅ والدومين القديم لسه شغّال: https://app.$OLD_DOMAIN"

# ——— فحص إيجابي للموقع التعريفي ———
# 🔴 `nginx -t` بيقول إن الإعداد **صحيح نحويًا** — مابيقولش إن نجنكس قادر يقرا
# الملفات فعلًا. وأرجح عطل هنا إن مجلد الريبو مش مقروء لمستخدم نجنكس فيرجّع
# **403 والإعداد سليم**. فالحكم على صفحة حقيقية رجعت من الدومين نفسه.
if [ -n "$SITE_NAMES" ]; then
  BODY=$(mktemp)
  CODE=$(curl -s -o "$BODY" -w '%{http_code}' "https://$DOMAIN/" || echo 000)
  if [ "$CODE" != "200" ]; then
    echo "❌ الموقع التعريفي رجّع $CODE على https://$DOMAIN/"
    [ "$CODE" = "403" ] && echo "   ٤٠٣ = نجنكس مش قادر يقرا $SITE_ROOT (صلاحيات المجلد)"
    rm -f "$BODY"; exit 1
  fi
  grep -q 'رع شات' "$BODY" || { echo "❌ $DOMAIN ردّ ٢٠٠ بصفحة مش بتاعتنا"; rm -f "$BODY"; exit 1; }
  rm -f "$BODY"
  echo "✅ الموقع التعريفي: https://$DOMAIN/ (200)"
fi
exit 0

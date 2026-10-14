#!/usr/bin/env bash
# مراقبة رع شات: يفحص كل حاجة مهمة، وبيبعت إيميل **لما الحالة تتغير بس**
# (مش كل مرة) عشان مايبقاش ضجيج يتجاهله الواحد بعد يومين.
#
# التشغيل اليدوي:   cd /opt/rachat && bash scripts/monitor.sh
# تجربة الإيميل:    cd /opt/rachat && bash scripts/monitor.sh --test
# كل ١٠ دقايق (مرة واحدة بس تتضاف):
#   (crontab -l 2>/dev/null; echo '*/10 * * * * cd /opt/rachat && bash scripts/monitor.sh >> /var/log/rachat-monitor.log 2>&1') | crontab -
#
# بيفحص: الـ API من بره وجوه · الواجهة واللوحة · الداتابيز · الكونتينرات ·
#        مساحة القرص · عمر وحجم أحدث نسخة احتياطية · صلاحية الشهادة.
# الإيميل عبر Resend (نفس مفتاح كود التحقق). مفيش أي سر بيتطبع على الشاشة.
set -uo pipefail
cd "$(dirname "$0")/.."
DC="docker compose -f docker-compose.prod.yml --env-file .env.production"
STATE=.monitor-state
REMIND_HOURS=${REMIND_HOURS:-12}   # إعادة التنبيه على نفس المشكلة بعد كام ساعة
MIN_DUMP=${MIN_DUMP:-4096}         # بايت — أقل من كده النسخة فاشلة
MAX_DUMP_AGE_H=${MAX_DUMP_AGE_H:-26}
MAX_DISK_PCT=${MAX_DISK_PCT:-85}
MIN_CERT_DAYS=${MIN_CERT_DAYS:-20}

[ -f .env.production ] || { echo "❌ مفيش .env.production"; exit 1; }
# القيمة من .env.production: أول سطر بالمفتاح، وبنشيل علامات التنصيص و\r لو موجودين
cfg() { grep -E "^$1=" .env.production | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d "\r"; }
DOMAIN=$(cfg DOMAIN); RESEND_KEY=$(cfg RESEND_KEY); EMAIL_FROM=$(cfg EMAIL_FROM)
ALERT_TO=$(cfg ALERT_EMAIL); [ -n "$ALERT_TO" ] || ALERT_TO=$(cfg LETSENCRYPT_EMAIL)
[ -n "$DOMAIN" ] || { echo "❌ DOMAIN مش متحدد في .env.production"; exit 1; }

# ── إرسال الإيميل (الموضوع، المتن) ─────────────────────────────────────────
send_mail() {
  local subject=$1 body=$2
  if [ -z "$RESEND_KEY" ] || [ -z "$ALERT_TO" ]; then
    echo "⚠️ مفيش RESEND_KEY أو إيميل تنبيه — التنبيه ما اتبعتش"; return 1
  fi
  # بايثون بتبني الـ JSON بس (نص عربي وأسطر وعلامات تنصيص = تهريب مظبوط)،
  # والإرسال بـ curl. **مهم:** مكتبة urllib بتاعة بايثون بترجع 403 من Cloudflare
  # (error code: 1010 — حجب على أساس بصمة العميل) لأن Resend قاعد وراه.
  local tmpd json cfgfile out code
  tmpd=$(mktemp -d); json=$tmpd/mail.json; cfgfile=$tmpd/curl.cfg
  trap 'rm -rf "$tmpd"' RETURN
  python3 - "$subject" "$body" "$json" <<'PY'
import json, os, sys
to = os.environ["ALERT_TO"]
frm = os.environ.get("EMAIL_FROM") or f"Raa Chat <no-reply@{os.environ['DOMAIN']}>"
sub, body, out = sys.argv[1], sys.argv[2], sys.argv[3]
html = ('<pre style="font:14px/1.7 -apple-system,Segoe UI,Tahoma,sans-serif;white-space:pre-wrap">'
        + body.replace("&", "&amp;").replace("<", "&lt;") + "</pre>")
with open(out, "w", encoding="utf-8") as f:
    json.dump({"from": frm, "to": to, "subject": sub, "text": body, "html": html}, f, ensure_ascii=False)
PY
  # المفتاح في ملف إعدادات بصلاحية 600 — مش في سطر الأوامر، عشان مايبانش في ps
  umask 177; printf 'header = "Authorization: Bearer %s"\n' "$RESEND_KEY" > "$cfgfile"; umask 022
  out=$(curl -sS -K "$cfgfile" --max-time 25 \
        -H "Content-Type: application/json" -H "Accept: application/json" \
        -X POST https://api.resend.com/emails --data-binary "@$json" \
        -w '\n%{http_code}' 2>&1)
  code=$(printf '%s' "$out" | tail -n1)
  if [ "$code" = "200" ]; then
    echo "📧 التنبيه اتبعت لـ $ALERT_TO"
  else
    echo "⚠️ إرسال التنبيه فشل (HTTP $code)"
    printf '%s' "$out" | head -c 400 | tr '\n' ' ' | sed 's/^/   رد الخدمة: /'; echo
    echo "   المرسِل: ${EMAIL_FROM:-(من DOMAIN)} · المستلم: $ALERT_TO · طول المفتاح: ${#RESEND_KEY}"
    return 1
  fi
}
export RESEND_KEY ALERT_TO EMAIL_FROM DOMAIN

# --to someone@example.com : يغيّر المستلم لهذه المرة بس (للتجربة)
if [ "${1:-}" = "--to" ] && [ -n "${2:-}" ]; then ALERT_TO=$2; export ALERT_TO; shift 2; fi
if [ "${1:-}" = "--test" ]; then
  send_mail "رع شات — تجربة تنبيه" "ده إيميل تجربة من scripts/monitor.sh على $DOMAIN.
لو وصلك، يبقى التنبيهات شغالة."
  exit $?
fi

# ── الفحوص ────────────────────────────────────────────────────────────────
FAILED=""   # أسماء الفحوص اللي فشلت
DETAIL=""   # تفاصيل للإيميل
fail() { FAILED="$FAILED $1"; DETAIL="$DETAIL
❌ $2"; echo "❌ $1: $2"; }
ok()   { echo "✅ $1: $2"; }

# ١) الـ API من بره (بيختبر نجنكس والشهادة والتطبيق مع بعض)
if out=$(curl -fsS --max-time 15 "https://api.$DOMAIN/health" 2>&1) && echo "$out" | grep -q '"ok":true'; then
  ok "api" "https://api.$DOMAIN/health"
else
  fail "api" "الـ API مش بيرد من بره: https://api.$DOMAIN/health — $out"
fi

# ٢) الواجهة واللوحة
for h in "app" "admin"; do
  c=$(curl -so /dev/null -w '%{http_code}' --max-time 15 "https://$h.$DOMAIN/" 2>/dev/null)
  [ "$c" = "200" ] && ok "$h" "HTTP 200" || fail "$h" "https://$h.$DOMAIN بيرجّع HTTP $c"
done

# ٣) الـ API من جوه (يفرّق بين «التطبيق واقع» و«نجنكس/الشهادة»)
# بـ Host صريح: Caddyfile كله مواقع مربوطة باسم المضيف، وطلب بدون Host مابيطابقش
# ولا موقع — يعني الفحص كان بيقيس «Caddy سامع» مش «الواجهة بتتقدّم فعلًا».
c=$(curl -so /dev/null -w '%{http_code}' --max-time 10 -H "Host: app.$DOMAIN" http://127.0.0.1:8085/ 2>/dev/null)
[ "$c" = "200" ] && ok "caddy" "127.0.0.1:8085 (Host: app.$DOMAIN) → 200" || fail "caddy" "الواجهة الداخلية بترجّع HTTP $c"

# ٤) الكونتينرات: كلها شغالة
running=$(timeout 30 $DC ps --services --filter status=running 2>/dev/null | sort | tr '\n' ' ')
for s in db api caddy backup; do
  echo "$running" | grep -qw "$s" && ok "container:$s" "شغّال" || fail "container:$s" "كونتينر $s مش شغّال (الشغّال: $running)"
done

# ٥) الداتابيز بترد فعلًا
if timeout 30 $DC exec -T backup pg_isready -h db -U rachat -q >/dev/null 2>&1; then
  n=$(timeout 30 $DC exec -T backup psql -h db -U rachat -d rachat -At -c 'SELECT count(*) FROM "User"' 2>/dev/null | tr -d '\r')
  # **لازم مستخدم واحد على الأقل.** الفحص كان `[ -n "$n" ]`، و"0" نص مش فاضي —
  # يعني قاعدة اتمسحت أو migration غلط كانت بتطلع «✅ db: بترد — 0 مستخدم».
  case "${n:-}" in
    ""|*[!0-9]*) fail "db" "pg_isready تمام بس الاستعلام فشل" ;;
    0) fail "db" "الداتابيز بترد بس **فاضية — صفر مستخدم**. ده مش وضع طبيعي للإنتاج" ;;
    *) ok "db" "بترد — $n مستخدم" ;;
  esac
else
  fail "db" "الداتابيز مش بترد على pg_isready"
fi

# ٦) مساحة القرص
pct=$(df -P / | awk 'NR==2{print $5}' | tr -d '%')
if [ "${pct:-100}" -lt "$MAX_DISK_PCT" ]; then
  ok "disk" "${pct}% مستخدم"
else
  # مع التنبيه بنبعت تفصيل Docker عشان القرار يبقى على أساس أرقام، مش تخمين.
  # **عمدًا** مابنمسحش حاجة تلقائيًا: السيرفر مشترك مع مشاريع تانية ومش قرارنا.
  dfd=$(docker system df 2>/dev/null | sed 's/^/     /')
  fail "disk" "القرص ${pct}% مستخدم (الحد $MAX_DISK_PCT%) — الداتابيز واللوجات بيكتبوا على نفس القرص
$dfd
     آمن: docker builder prune -f  (كاش البناء) · docker image prune -f  (صور بلا وسم)
     خطر على السيرفر المشترك: image prune -a · volume prune · container prune"
fi

# ٧) النسخة الاحتياطية: موجودة وحديثة وحجمها معقول
bk=$(timeout 30 $DC exec -T backup sh -c '
  d=$(ls -1t /backups/db-*.dump 2>/dev/null | head -1 || true)
  [ -n "$d" ] || { echo "none 0 0"; exit 0; }
  echo "$(basename "$d") $(wc -c < "$d") $(( ( $(date +%s) - $(date -r "$d" +%s) ) / 3600 ))"' 2>/dev/null | tr -d '\r')
set -- ${bk:-none 0 0}; bname=$1; bsize=$2; bage=$3
if [ "$bname" = "none" ]; then fail "backup" "مفيش أي نسخة احتياطية في /backups"
elif [ "${bsize:-0}" -lt "$MIN_DUMP" ]; then fail "backup" "أحدث نسخة ($bname) حجمها $bsize بايت — فاشلة"
elif [ "${bage:-99}" -gt "$MAX_DUMP_AGE_H" ]; then fail "backup" "أحدث نسخة ($bname) عمرها $bage ساعة — النسخ اليومية واقفة"
else ok "backup" "$bname · $bsize بايت · عمرها $bage ساعة"; fi

# ٧ب) أرشيف المرفوعات: نص النسخة الاحتياطية، ومكانش متفحوص خالص.
# (حلقة النسخ بتعمل الأرشيف بـ `tar > الاسم النهائي` من غير ملف مؤقت، فأرشيف
#  فاشل بياخد الاسم النهائي ويزقّ نسخة سليمة برّه الـ١٤.)
up=$(timeout 30 $DC exec -T backup sh -c '
  u=$(ls -1t /backups/uploads-*.tgz 2>/dev/null | head -1 || true)
  [ -n "$u" ] || { echo "none 0 0"; exit 0; }
  echo "$(basename "$u") $(wc -c < "$u") $(( ( $(date +%s) - $(date -r "$u" +%s) ) / 3600 ))"' 2>/dev/null | tr -d '\r')
set -- ${up:-none 0 0}; uname=$1; usize=$2; uage=$3
if [ "$uname" = "none" ]; then fail "backup:uploads" "مفيش أي أرشيف مرفوعات في /backups — نسخ المرفوعات فاشلة"
elif [ "${usize:-0}" -lt 100 ]; then fail "backup:uploads" "أحدث أرشيف ($uname) حجمه $usize بايت — فاضي/ناقص"
elif [ "${uage:-99}" -gt "$MAX_DUMP_AGE_H" ]; then fail "backup:uploads" "أحدث أرشيف ($uname) عمره $uage ساعة — نسخ المرفوعات واقفة"
else ok "backup:uploads" "$uname · $usize بايت · عمره $uage ساعة"; fi

# ٨) TURN للمكالمات — **بس لو متضبط** (مش متضبط = مش فحص فاشل، دي حالة معروفة)
if grep -qE '^TURN_URLS=.+' .env.production 2>/dev/null && grep -qE '^TURN_SECRET=.+' .env.production 2>/dev/null; then
  tsec=$(grep -E '^TURN_SECRET=' .env.production | cut -d= -f2-)
  tcid=$(timeout 30 $DC ps -q turn 2>/dev/null | tr -d '\r')
  if [ -z "$tcid" ]; then
    fail "turn" "TURN متضبط في .env.production بس حاوية coturn مش شغّالة — المكالمات هتفشل لكل اللي ورا CGNAT"
  else
    # **Allocate حقيقي** على العنوان العام (نفس طريق المستخدم: DNS + جدار ناري)،
    # بنفس حساب كلمة السر بتاع السيرفر. الفاحص مجرَّب على coturn حقيقي.
    if tout=$(timeout 40 $DC run --rm --no-deps -T \
        -e TURN_HOST="$DOMAIN" -e TURN_PORT=3478 -e TURN_SECRET="$tsec" -e TURN_USER=monitor \
        api node < scripts/lib/turncheck.mjs 2>&1) && echo "$tout" | grep -q "allocate ok"; then
      ok "turn" "Allocate ناجح على turn:$DOMAIN:3478"
    else
      fail "turn" "TURN مش بيرحّل من بره — المكالمات هتفشل للي ورا CGNAT. الناتج: $(echo "$tout" | tail -n 2)"
    fi
  fi
fi

# ٩) إشعارات Push (VAPID) — **بس لو متضبطة** (مش متضبطة = حالة معروفة مش عطل)
# فحص إيجابي **جوه الكونتينر الشغّال**: بيشتق المفتاح العام من الخاص ويقارنه،
# ويوقّع JWT (ES256) ويتحقق منه. ليه: الزوج غير المتطابق **مافيهوش أي خطأ
# عندنا** — web-push بيبعت عادي وخدمة الدفع ترفض بـ 403، فالمستخدم مايوصلوش
# إشعار من غير ما حد يعرف. ومابيكلّفش حاجة (حساب محلي، بلا شبكة).
# ومعاه المفتاح اللي `/push/key` بيوزّعه: الزوج المتطابق مش كفاية — لو مفتاح
# من الزوج ناقص، `createWebPush` بترجّع undefined والمسار يرجّع null والواجهة
# تقول «غير متاح». الفحص بـ `pushprobe.mjs` **جوه الحاوية** مش بـ curl، لأن
# المسار ورا التوكن وبيرجّع 401 لأي نداء من سكربت.
if grep -qE '^VAPID_PRIVATE=.+' .env.production 2>/dev/null; then
  if ! vout=$(timeout 30 $DC exec -T api node --input-type=module - < scripts/lib/vapidcheck.mjs 2>&1); then
    fail "push" "مفاتيح VAPID مش سليمة جوه الـ API — كل إشعار هيترفض في سكوت. الناتج: $(echo "$vout" | tail -n 2)"
  elif ! pout=$(timeout 30 $DC exec -T api node --input-type=module - < scripts/lib/pushprobe.mjs 2>&1); then
    fail "push" "المفتاح العام مابيوصلش للمتصفحات — الواجهة تقول «الإشعارات غير متاحة». الناتج: $(echo "$pout" | tail -n 2)"
  else
    ok "push" "$(echo "$vout" | tail -n 1) · $(echo "$pout" | tail -n 1)"
  fi
fi

# ١٠) الشهادة
days=$(echo | openssl s_client -servername "api.$DOMAIN" -connect "api.$DOMAIN:443" 2>/dev/null \
  | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -n "$days" ]; then
  left=$(( ( $(date -d "$days" +%s) - $(date +%s) ) / 86400 ))
  [ "$left" -ge "$MIN_CERT_DAYS" ] && ok "cert" "باقي $left يوم" || fail "cert" "الشهادة باقي لها $left يوم بس — certbot يمكن واقف"
else
  fail "cert" "مش قادر أقرا تاريخ انتهاء الشهادة"
fi

# ── التنبيه: على التغيّر بس ────────────────────────────────────────────────
NOW=$(date +%s)
PREV=""; PREV_AT=0
[ -f "$STATE" ] && { PREV=$(sed -n 1p "$STATE"); PREV_AT=$(sed -n 2p "$STATE"); }
CUR=$(echo $FAILED | tr ' ' '\n' | sort | tr '\n' ' ' | sed 's/ *$//')
PREV=$(echo $PREV | sed 's/ *$//')

if [ -n "$CUR" ]; then
  since_h=$(( (NOW - ${PREV_AT:-0}) / 3600 ))
  if [ "$CUR" != "$PREV" ] || [ "$since_h" -ge "$REMIND_HOURS" ]; then
    # الحالة بتتسجّل **بس لو الإيميل خرج فعلًا** — لو Resend وقع، الفحصة الجاية تحاول تاني
    if send_mail "⚠️ رع شات: $(echo $CUR | wc -w) مشكلة — $CUR" "وقت الفحص: $(date '+%F %H:%M %Z')
السيرفر: $DOMAIN
$DETAIL

الفحوص الناجحة اتجاهلت في الرسالة دي.
للتفاصيل الكاملة:  cd /opt/rachat && bash scripts/monitor.sh"; then
      printf '%s\n%s\n' "$CUR" "$NOW" > "$STATE"
    fi
  else
    echo "(نفس المشكلة متبلّغة قبل كده — مفيش إيميل تاني قبل $REMIND_HOURS ساعة)"
  fi
  exit 1
fi

if [ -n "$PREV" ]; then
  # نفس القاعدة: ما نمسحش الحالة إلا لما إيميل «رجع يشتغل» يخرج فعلًا
  send_mail "✅ رع شات: رجع يشتغل" "كل الفحوص بقت تمام الساعة $(date '+%F %H:%M %Z').
اللي كان واقع قبل كده: $PREV" && : > "$STATE"
else
  : > "$STATE"
fi
echo "✅ كل الفحوص تمام"

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
  local out code
  out=$(python3 - "$subject" "$body" <<'PY'
import json, os, sys, urllib.request
key = os.environ["RESEND_KEY"]; to = os.environ["ALERT_TO"]
frm = os.environ.get("EMAIL_FROM") or f"Raa Chat <no-reply@{os.environ['DOMAIN']}>"
sub, body = sys.argv[1], sys.argv[2]
data = json.dumps({"from": frm, "to": to, "subject": sub,
                   "text": body,
                   "html": "<pre style=\"font:14px/1.7 -apple-system,Segoe UI,Tahoma,sans-serif;white-space:pre-wrap\">"
                           + body.replace("&","&amp;").replace("<","&lt;") + "</pre>"}).encode()
req = urllib.request.Request("https://api.resend.com/emails", data=data,
      headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
try:
    with urllib.request.urlopen(req, timeout=20) as r:
        print(r.status)
except Exception as e:
    print(getattr(e, "code", 0))
    # رسالة Resend هي اللي بتقول السبب بالظبط — بنطبعها (مفيش فيها أي سر)
    try:
        print(e.read().decode()[:400].replace("\n", " "))
    except Exception:
        print(str(e)[:200])
PY
  ) || out=0
  code=$(printf '%s' "$out" | sed -n 1p)
  if [ "$code" = "200" ]; then
    echo "📧 التنبيه اتبعت لـ $ALERT_TO"
  else
    echo "⚠️ إرسال التنبيه فشل (HTTP $code)"
    printf '%s' "$out" | sed -n '2,3p' | sed 's/^/   رد Resend: /'
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
c=$(curl -so /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:8085/ 2>/dev/null)
[ "$c" = "200" ] && ok "caddy" "127.0.0.1:8085 → 200" || fail "caddy" "الواجهة الداخلية بترجّع HTTP $c"

# ٤) الكونتينرات: كلها شغالة
running=$($DC ps --services --filter status=running 2>/dev/null | sort | tr '\n' ' ')
for s in db api caddy backup; do
  echo "$running" | grep -qw "$s" && ok "container:$s" "شغّال" || fail "container:$s" "كونتينر $s مش شغّال (الشغّال: $running)"
done

# ٥) الداتابيز بترد فعلًا
if $DC exec -T backup pg_isready -h db -U rachat -q >/dev/null 2>&1; then
  n=$($DC exec -T backup psql -h db -U rachat -d rachat -At -c 'SELECT count(*) FROM "User"' 2>/dev/null | tr -d '\r')
  [ -n "$n" ] && ok "db" "بترد — $n مستخدم" || fail "db" "pg_isready تمام بس الاستعلام فشل"
else
  fail "db" "الداتابيز مش بترد على pg_isready"
fi

# ٦) مساحة القرص
pct=$(df -P / | awk 'NR==2{print $5}' | tr -d '%')
[ "${pct:-100}" -lt "$MAX_DISK_PCT" ] && ok "disk" "${pct}% مستخدم" || fail "disk" "القرص ${pct}% مستخدم (الحد $MAX_DISK_PCT%) — الداتابيز واللوجات بيكتبوا على نفس القرص"

# ٧) النسخة الاحتياطية: موجودة وحديثة وحجمها معقول
bk=$($DC exec -T backup sh -c '
  d=$(ls -1t /backups/db-*.dump 2>/dev/null | head -1 || true)
  [ -n "$d" ] || { echo "none 0 0"; exit 0; }
  echo "$(basename "$d") $(wc -c < "$d") $(( ( $(date +%s) - $(date -r "$d" +%s) ) / 3600 ))"' 2>/dev/null | tr -d '\r')
set -- ${bk:-none 0 0}; bname=$1; bsize=$2; bage=$3
if [ "$bname" = "none" ]; then fail "backup" "مفيش أي نسخة احتياطية في /backups"
elif [ "${bsize:-0}" -lt "$MIN_DUMP" ]; then fail "backup" "أحدث نسخة ($bname) حجمها $bsize بايت — فاشلة"
elif [ "${bage:-99}" -gt "$MAX_DUMP_AGE_H" ]; then fail "backup" "أحدث نسخة ($bname) عمرها $bage ساعة — النسخ اليومية واقفة"
else ok "backup" "$bname · $bsize بايت · عمرها $bage ساعة"; fi

# ٨) الشهادة
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

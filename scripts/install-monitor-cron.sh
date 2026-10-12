#!/usr/bin/env bash
# يثبّت المراقبة في الـ cron (كل ١٠ دقايق) في ملف مخصّص.
# التشغيل:  cd /opt/rachat && bash scripts/install-monitor-cron.sh
# الإلغاء:  rm /etc/cron.d/rachat-monitor
#
# ليه ملف في /etc/cron.d بدل `crontab -`؟ عشان مايلمسش crontab بتاع المشاريع
# التانية على السيرفر المشترك، وعشان الإلغاء يبقى بمسح ملف واحد.
set -euo pipefail
cd "$(dirname "$0")/.."
HERE=$(pwd)
DEST=/etc/cron.d/rachat-monitor
LOG=/var/log/rachat-monitor.log
EVERY=${EVERY:-10}   # كل كام دقيقة

[ -f scripts/monitor.sh ] || { echo "❌ مفيش scripts/monitor.sh — شغّلي الأمر من /opt/rachat"; exit 1; }
[ "$(id -u)" = "0" ] || { echo "❌ محتاج root (الكتابة في $DEST)"; exit 1; }

# PATH مهم: cron بيشتغل بـ PATH مختصر، وdocker موجود في /usr/bin
{
  echo "# مراقبة رع شات — بيتولّد من scripts/install-monitor-cron.sh"
  echo "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
  echo "*/$EVERY * * * * root bash $HERE/scripts/monitor.sh >> $LOG 2>&1"
} > "$DEST"
chmod 644 "$DEST"
touch "$LOG"; chmod 640 "$LOG"

echo "✅ اتثبّت في $DEST — كل $EVERY دقيقة:"
sed 's/^/   /' "$DEST"
echo
echo "اللوج:        tail -f $LOG"
echo "للإلغاء:      rm $DEST"
echo "تشغيل فوري:   bash scripts/monitor.sh"

# لو systemd-cron أو cron مش شغّال، الملف مش هيفيد — نقول بصراحة
if command -v systemctl >/dev/null && ! systemctl is-active --quiet cron 2>/dev/null && ! systemctl is-active --quiet crond 2>/dev/null; then
  echo "⚠️ خدمة cron مش شغالة على السيرفر — شغّليها:  systemctl enable --now cron"
fi

#!/usr/bin/env bash
# يثبّت رفع النسخ الاحتياطية على جوجل درايف في الـ cron (مرة كل يوم).
# التشغيل:  cd /opt/rachat && bash scripts/install-backup-cron.sh
# الإلغاء:  rm /etc/cron.d/rachat-backup-drive
#
# ملف في /etc/cron.d بدل `crontab -` عشان مايلمسش crontab المشاريع التانية على
# السيرفر المشترك — نفس نمط install-monitor-cron.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
HERE=$(pwd)
DEST=/etc/cron.d/rachat-backup-drive
LOG=/var/log/rachat-backup-drive.log
# ٤:٤٠ فجرًا: حلقة النسخ جوه compose بتدمب أول ما الحاوية تقوم وكل ٢٤ ساعة،
# والساعة دي بعيدة عن ذروة الاستخدام وعن نافذة النشر المعتادة.
AT="${AT:-40 4}"

[ -f scripts/backup-to-drive.sh ] || { echo "❌ مفيش scripts/backup-to-drive.sh — شغّلي الأمر من /opt/rachat"; exit 1; }
[ "$(id -u)" = "0" ] || { echo "❌ محتاج root (الكتابة في $DEST)"; exit 1; }

# فحص قبلي: مفيش معنى لتثبيت كرون على إعداد ناقص — يفضل يفشل كل يوم في لوج
# محدش بيقراه. الفحص ده بيشغّل --check اللي بيتأكد من rclone والمفتاح والريموت.
if ! bash scripts/backup-to-drive.sh --check >/dev/null 2>&1; then
  echo "❌ الإعداد مش تمام لسه — شغّلي ده الأول وشوفي الرسالة:"
  echo "   bash scripts/backup-to-drive.sh --check"
  exit 1
fi

{
  echo "# رفع نسخ رع شات على درايف — بيتولّد من scripts/install-backup-cron.sh"
  echo "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
  echo "$AT * * * root bash $HERE/scripts/backup-to-drive.sh >> $LOG 2>&1"
} > "$DEST"
chmod 644 "$DEST"
touch "$LOG"; chmod 640 "$LOG"

echo "✅ اتثبّت في $DEST:"
sed 's/^/   /' "$DEST"
echo
echo "اللوج:        tail -f $LOG"
echo "للإلغاء:      rm $DEST"
echo "تشغيل فوري:   bash scripts/backup-to-drive.sh"

if command -v systemctl >/dev/null && ! systemctl is-active --quiet cron 2>/dev/null && ! systemctl is-active --quiet crond 2>/dev/null; then
  echo "⚠️ خدمة cron مش شغالة على السيرفر — شغّليها:  systemctl enable --now cron"
fi

#!/usr/bin/env bash
# عنوان TURN **اللي بيوصل للمتصفح فعلًا** — مصدر واحد للاستخراج من `TURN_URLS`.
#
# ليه موجود: المراقبة كانت بتفحص `$DOMAIN` (`kenoz.org`) وهو **مالوش سجل DNS**
# (السجلات على `app.`/`admin.`/`api.` بس)، والعنوان المنشور فعلًا هو
# `turn:api.kenoz.org:3478`. فالفحص كان بيطلّع `getaddrinfo ENOTFOUND kenoz.org`
# **دايمًا** — تنبيه كاذب كل ١٠ دقايق على TURN شغّال، وفي نفس الوقت **مابيشوفش**
# عطلًا حقيقيًا لو حصل، لأنه أحمر على طول. (اتبلّغ بإيميل تنبيه ١٤ أكتوبر ٢٠٢٦.)
#
# الشكل: turn:host:port?transport=udp,turn:host:port?transport=tcp
# بناخد أول عنوان — ده اللي المتصفح بيجرّبه الأول.

# turn_host_of "<TURN_URLS>" → اسم المضيف (أو فاضي لو القيمة فاضية/غلط)
turn_host_of() {
  printf '%s' "${1:-}" | tr ',' '\n' | head -1 | tr -d ' \r' \
    | sed -E 's#^turns?:##; s#\?.*$##; s#:[0-9]+$##'
}

# turn_port_of "<TURN_URLS>" → المنفذ، والافتراضي 3478
turn_port_of() {
  local p
  p=$(printf '%s' "${1:-}" | tr ',' '\n' | head -1 | tr -d ' \r' \
    | sed -E 's#\?.*$##' | sed -nE 's#.*:([0-9]+)$#\1#p')
  printf '%s' "${p:-3478}"
}

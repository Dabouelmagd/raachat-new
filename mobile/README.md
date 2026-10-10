# رع شات — لفّة الموبايل (Capacitor)

> ما تقدرش تبني APK/AAB أو IPA من السيرفر ده. محتاج: Android Studio (Android) و Mac + Xcode 26 (iOS).

```bash
cd mobile && npm install
export VITE_API_URL=https://api.YOUR-DOMAIN VITE_SITE_URL=https://YOUR-DOMAIN
npm run add:android && npm run add:ios      # مرة واحدة
npm run sync                                  # يبني الويب ويزامن
npm run open:android   # → Build > Generate Signed Bundle (AAB)
npm run open:ios       # → Product > Archive
```

بعد `add:*` طبّق `android-manifest-snippet.xml` و `ios-infoplist-snippet.xml`.

## الإشعارات (مهم)
Web Push مش شغال داخل WKWebView على iOS. لازم إشعارات أصلية:
`@capacitor/push-notifications` + FCM (أندرويد) + APNs (iOS)، والسيرفر يبعت عبر FCM HTTP v1.
السيرفر حاليًا بيبعت Web Push بس (`server/src/lib/push.ts`) — محتاج إضافة جدول `DeviceToken` ومرسل FCM.

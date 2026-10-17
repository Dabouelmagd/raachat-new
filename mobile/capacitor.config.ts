import type { CapacitorConfig } from "@capacitor/cli";

// ⚠️ appId مشتق من دومين الشركة (datalifeai.com). **مينفعش يتغيّر بعد أول رفع للمتجر**
// — فلو عايزة اسمًا تانيًا، ده وقته. والـ APK التجريبي مايتأثرش بالتغيير.
const config: CapacitorConfig = {
  appId: "com.datalifeai.raachat",
  appName: "رع شات",
  webDir: "../dist",
  server: { androidScheme: "https" },
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: "#14100F" },
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
  },
};
export default config;

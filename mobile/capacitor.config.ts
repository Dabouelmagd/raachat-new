import type { CapacitorConfig } from "@capacitor/cli";

// appId: غيّره لاسم نطاقك المعكوس قبل أول رفع — مينفعش يتغير بعد النشر على المتجر.
const config: CapacitorConfig = {
  appId: "com.YOURCOMPANY.raachat",
  appName: "رع شات",
  webDir: "../dist",
  server: { androidScheme: "https" },
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: "#14100F" },
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
  },
};
export default config;

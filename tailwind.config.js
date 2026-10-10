/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // لوحة الألوان مستخلصة من شعار «رع شات» — راجع src/theme/colors.ts
        rachat: {
          black: "rgb(var(--rc-black) / <alpha-value>)", // خلفية الصفحة (تتبدل مع الثيم)
          card: "rgb(var(--rc-card) / <alpha-value>)", // الأسطح
          red: "#E1523E", // أحمر رع الفرعوني
          coral: "#F2795C", // مرجاني الغروب
          maroon: "rgb(var(--rc-maroon) / <alpha-value>)", // حدود وأسطح ثانوية
          gold: "#C9A227", // ذهبي الملوك
          papyrus: "rgb(var(--rc-papyrus) / <alpha-value>)", // لون النص الأساسي (يتبدل مع الثيم)
          ink: "#14100F", // حبر ثابت للنص فوق الأسطح الفاتحة
          cream: "#F5EFE6", // بردية ثابتة للأزرار الفاتحة
        },
      },
      fontFamily: {
        arabic: ["Cairo", "IBM Plex Sans Arabic", "Segoe UI", "Tahoma", "sans-serif"],
      },
    },
  },
  plugins: [],
};

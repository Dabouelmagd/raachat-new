// لوحة الإدارة متكتوبة بـ CSS عادي (مفيش Tailwind) — شوف src/styles.css.
// الملف ده موجود عشان Vite يتوقف عنده وما يطلعش يدوّر على postcss.config.js بتاع
// الجذر، اللي بيطلب tailwindcss وautoprefixer. من غيره البناء بيفشل في أي مكان
// فيه ملفات الجذر بدون الـ node_modules بتاعها (زي الـ CI).
export default { plugins: {} };

import { useEffect } from "react";

/**
 * قفل النافذة بزرار Escape.
 *
 * ليه موجود: النوافذ المنبثقة بتغطّي الشاشة كلها (`fixed inset-0`)، فلو زرار
 * الإغلاق اختفى لأي سبب (سكرول، شاشة صغيرة، قايمة طويلة) المستخدم بيبقى **محبوس**
 * — مش بس مش قادر يقفل النافذة، ده كمان كل ضغطة في التطبيق بتروح للطبقة دي بدل
 * ما توصل لصندوق الكتابة أو أي حاجة تحتها. حصل فعلًا في الإنتاج (١٢ أكتوبر).
 * فكل نافذة لازم يبقى ليها **تلات طرق للخروج**: الزرار، واللمس برّه، وEscape.
 */
export function useCloseOnEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

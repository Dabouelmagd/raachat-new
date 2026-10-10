import type { SVGProps } from "react";

/**
 * أيقونات فرعونية بنفس أسلوب lucide (خط 24×24) عشان تتبدل مكانها مباشرة.
 * نفس الواجهة: size, strokeWidth, className.
 */
interface IconProps extends Omit<SVGProps<SVGSVGElement>, "size"> {
  size?: number;
  strokeWidth?: number;
}

function Base({ size = 24, strokeWidth = 1.8, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** عنخ — مفتاح الحياة */
export const Ankh = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 11.5c-3.2 0-4.3-2.1-4.3-4.2S9.1 3 12 3s4.3 2.1 4.3 4.3-1.1 4.2-4.3 4.2z" />
    <path d="M12 11.5V21.5M6.5 15h11" />
  </Base>
);

/** خرطوش — اسم الملك، بديل فقاعة الدردشة */
export const Cartouche = (p: IconProps) => (
  <Base {...p}>
    <rect x="2.5" y="6" width="16.5" height="12" rx="6" />
    <path d="M21.5 8.5v7" />
    <path d="M7.5 10.5h7M7.5 13.5h4.5" />
  </Base>
);

/** أهرامات — الجروبات */
export const Pyramids = (p: IconProps) => (
  <Base {...p}>
    <path d="M2 19.5 10 6l8 13.5" />
    <path d="M13.5 19.5 18 12l4 7.5" />
    <path d="M10 6v13.5M1.5 19.5h21" />
  </Base>
);

/** لوتس — الغرف */
export const Lotus = (p: IconProps) => (
  <Base {...p}>
    <path d="M12 3.5c2.6 2.6 3.1 6.3 0 10.5-3.1-4.2-2.6-7.9 0-10.5z" />
    <path d="M12 14c-.9-3.7-4.2-5.6-8.5-5.2.3 4.2 3 7.2 8.5 8.2" />
    <path d="M12 14c.9-3.7 4.2-5.6 8.5-5.2-.3 4.2-3 7.2-8.5 8.2" />
    <path d="M7 20.5h10" />
  </Base>
);

/** جعران — الخدمات والمحفظة (الحظ والثروة) */
export const Scarab = (p: IconProps) => (
  <Base {...p}>
    <ellipse cx="12" cy="13.5" rx="4.6" ry="6" />
    <path d="M12 7.5v12" />
    <path d="M9.6 7.2c.4-2.2 4.4-2.2 4.8 0" />
    <path d="M7.5 11 3 8.8M7.5 14.5l-4.5 1M16.5 11 21 8.8M16.5 14.5l4.5 1" />
  </Base>
);

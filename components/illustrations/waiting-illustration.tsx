interface WaitingIllustrationProps {
  /** 控制插画尺寸的类名（保持宽高比，建议用 h-* + w-auto）。 */
  className?: string;
  /** 无障碍描述，默认为「坐着等待的小人」。 */
  label?: string;
}

/**
 * 坐着等待的小人：单色线稿 + 柔粉/薄荷/蜜桃点缀。
 * 用于答题页与新建页的加载/等待态；纯内联 SVG，不依赖外部资源。
 */
export function WaitingIllustration({
  className,
  label = '坐着等待的小人',
}: WaitingIllustrationProps) {
  return (
    <svg
      viewBox="0 0 160 120"
      role="img"
      aria-label={label}
      focusable="false"
      className={className}
      fill="none"
    >
      {/* 地面柔影 */}
      <ellipse cx="80" cy="109" rx="52" ry="6" fill="#F3ECE7" />

      {/* 凳子 */}
      <rect
        x="46"
        y="83"
        width="50"
        height="8"
        rx="4"
        fill="#FFE3E9"
        stroke="#4A3F3A"
        strokeWidth="1.6"
      />
      <path
        d="M54 91v13M88 91v13"
        stroke="#4A3F3A"
        strokeWidth="1.6"
        strokeLinecap="round"
      />

      {/* 小人：腿 → 身体 → 手臂 → 头 */}
      <path
        d="M66 84v10h9M78 84v10h9"
        stroke="#4A3F3A"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M62 44c-7 1-10 7-10 14v26h20v-26c0-7-3-13-10-14z"
        fill="#FFFDFB"
        stroke="#4A3F3A"
        strokeWidth="1.8"
      />
      <path
        d="M70 54c5 2 8 6 9 11"
        stroke="#4A3F3A"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle
        cx="62"
        cy="33"
        r="11"
        fill="#FFFDFB"
        stroke="#4A3F3A"
        strokeWidth="1.8"
      />
      <path
        d="M52 31c1-8 5-12 10-12s10 4 11 12c-6-3-15-3-21 0z"
        fill="#FFD3B6"
        stroke="#4A3F3A"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="58" cy="35" r="1.6" fill="#4A3F3A" />
      <circle cx="66" cy="35" r="1.6" fill="#4A3F3A" />
      <path
        d="M58 40c2 2.2 6 2.2 8 0"
        stroke="#4A3F3A"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="54.5" cy="39" r="2" fill="#FFB6C1" opacity="0.7" />
      <circle cx="69.5" cy="39" r="2" fill="#FFB6C1" opacity="0.7" />

      {/* 小盆栽 */}
      <rect
        x="108"
        y="95"
        width="24"
        height="14"
        rx="6"
        fill="#FFD3B6"
        stroke="#4A3F3A"
        strokeWidth="1.6"
      />
      <path
        d="M120 95c0-8 2-12 6-16M120 91c-6-2-9-6-9-10M120 89c5-2 7-6 7-9"
        stroke="#247054"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <ellipse cx="113" cy="84" rx="4" ry="2.4" fill="#A8E6CF" />
      <ellipse cx="128" cy="82" rx="4" ry="2.4" fill="#A8E6CF" />

      {/* 等待的小星星 */}
      <path
        d="M134 44l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"
        fill="#FFB6C1"
        stroke="#94304B"
        strokeWidth="1"
      />
      <path
        d="M34 54l1.4 3.4 3.4 1.4-3.4 1.4-1.4 3.4-1.4-3.4-3.4-1.4 3.4-1.4z"
        fill="#FFD3B6"
        stroke="#713C19"
        strokeWidth="1"
      />
      <circle cx="112" cy="52" r="2" fill="#A8E6CF" />
      <circle cx="24" cy="80" r="1.6" fill="#FFB6C1" />
    </svg>
  );
}

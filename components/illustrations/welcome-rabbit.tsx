import { RABBIT_COLORS } from '@/components/illustrations/rabbit-palette';

interface WelcomeRabbitProps {
  /** 控制尺寸的类名（保持比例，建议 h-* w-*）。 */
  className?: string;
  /** 无障碍描述，默认为「挥手欢迎的小兔子」。 */
  label?: string;
}

/**
 * 挥手欢迎的小兔子：坐姿，渐变表现的体积感，浅褐灰细线勾勒。
 * 只有一只前爪从肩部带动挥手（CSS transform，±12°，2.6s 循环）；
 * `motion-reduce` 下动画停止，保留抬爪造型。
 */
export function WelcomeRabbit({
  className,
  label = '挥手欢迎的小兔子',
}: WelcomeRabbitProps) {
  return (
    <svg
      viewBox="0 -16 140 156"
      role="img"
      aria-label={label}
      focusable="false"
      className={className}
    >
      <defs>
        <linearGradient id="rabbit-fur" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={RABBIT_COLORS.furLight} />
          <stop offset="1" stopColor={RABBIT_COLORS.furShade} />
        </linearGradient>
        <linearGradient id="rabbit-ear-inner" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={RABBIT_COLORS.earInnerLight} />
          <stop offset="1" stopColor={RABBIT_COLORS.earInner} />
        </linearGradient>
        <radialGradient id="rabbit-cheek" cx="0.5" cy="0.5" r="0.5">
          <stop
            offset="0"
            stopColor={RABBIT_COLORS.cheek}
            stopOpacity="0.55"
          />
          <stop offset="1" stopColor={RABBIT_COLORS.cheek} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="rabbit-shade" cx="0.5" cy="0.35" r="0.65">
          <stop offset="0" stopColor="#D8BFB0" stopOpacity="0" />
          <stop offset="1" stopColor="#D8BFB0" stopOpacity="0.35" />
        </radialGradient>
        <radialGradient id="rabbit-belly" cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stopColor="#FFFDFB" stopOpacity="0.85" />
          <stop offset="0.7" stopColor="#FFFDFB" stopOpacity="0.35" />
          <stop offset="1" stopColor="#FFFDFB" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="rabbit-sheen" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 地面柔影 */}
      <ellipse cx="70" cy="136" rx="40" ry="3.5" fill="#EDE3DC" />

      {/* 尾巴（藏在身后） */}
      <circle
        cx="112"
        cy="112"
        r="9"
        fill="#FFFDFB"
        stroke="#C9B4A6"
        strokeWidth="1.1"
      />

      {/* 长耳：向后外侧张开，内耳柔粉 */}
      <g transform="rotate(-14 58 44)">
        <ellipse
          cx="58"
          cy="18"
          rx="10.5"
          ry="27"
          fill="url(#rabbit-fur)"
          stroke="#C9B4A6"
          strokeWidth="1.1"
        />
        <ellipse cx="58" cy="20" rx="5" ry="17" fill="url(#rabbit-ear-inner)" />
      </g>
      <g transform="rotate(14 82 44)">
        <ellipse
          cx="82"
          cy="18"
          rx="10.5"
          ry="27"
          fill="url(#rabbit-fur)"
          stroke="#C9B4A6"
          strokeWidth="1.1"
        />
        <ellipse cx="82" cy="20" rx="5" ry="17" fill="url(#rabbit-ear-inner)" />
      </g>

      {/* 后腿与坐姿身体 */}
      <ellipse
        cx="46"
        cy="120"
        rx="17"
        ry="14"
        fill="url(#rabbit-fur)"
        stroke="#C9B4A6"
        strokeWidth="1.1"
      />
      <ellipse
        cx="94"
        cy="120"
        rx="17"
        ry="14"
        fill="url(#rabbit-fur)"
        stroke="#C9B4A6"
        strokeWidth="1.1"
      />
      <path
        d="M40 108c-2-16 8-27 30-27s32 11 30 27c-1 12-14 18-30 18s-29-6-30-18z"
        fill="url(#rabbit-fur)"
        stroke="#C9B4A6"
        strokeWidth="1.1"
      />
      {/* 腹部柔光 */}
      <ellipse cx="70" cy="112" rx="24" ry="18" fill="url(#rabbit-belly)" />
      {/* 身体下缘的体积阴影 */}
      <path
        d="M42 112c3 10 14 14 28 14s25-4 28-14c-3 12-14 18-28 18s-25-6-28-18z"
        fill="url(#rabbit-shade)"
      />

      {/* 后脚掌 */}
      <ellipse
        cx="38"
        cy="130"
        rx="12"
        ry="6"
        fill="#FFF6F1"
        stroke="#C9B4A6"
        strokeWidth="1.1"
      />
      <ellipse
        cx="102"
        cy="130"
        rx="12"
        ry="6"
        fill="#FFF6F1"
        stroke="#C9B4A6"
        strokeWidth="1.1"
      />

      {/* 头 */}
      <ellipse
        cx="70"
        cy="64"
        rx="31"
        ry="29"
        fill="url(#rabbit-fur)"
        stroke="#C9B4A6"
        strokeWidth="1.1"
      />
      {/* 头顶高光 */}
      <ellipse cx="61" cy="45" rx="13" ry="8" fill="url(#rabbit-sheen)" />
      {/* 脸颊体积阴影 */}
      <path
        d="M44 76c2 9 12 15 26 15s24-6 26-15c-2 11-12 17-26 17s-24-6-26-17z"
        fill="url(#rabbit-shade)"
      />

      {/* 腮红 */}
      <ellipse cx="50" cy="74" rx="8" ry="6" fill="url(#rabbit-cheek)" />
      <ellipse cx="90" cy="74" rx="8" ry="6" fill="url(#rabbit-cheek)" />

      {/* 眼睛 + 高光 */}
      <ellipse cx="60" cy="62" rx="3.6" ry="4.2" fill="#4A3F3A" />
      <ellipse cx="80" cy="62" rx="3.6" ry="4.2" fill="#4A3F3A" />
      <circle cx="61.2" cy="60.6" r="1.3" fill="#FFFDFB" opacity="0.9" />
      <circle cx="81.2" cy="60.6" r="1.3" fill="#FFFDFB" opacity="0.9" />

      {/* 鼻子（淡粉）与三瓣嘴 */}
      <path
        d="M66.5 71h7l-3.5 4z"
        fill="#FFB6C1"
        stroke="#D79CA8"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      <path
        d="M70 75v3.5M70 78.5c-1 2.2-4 3-6.5 1.6M70 78.5c1 2.2 4 3 6.5 1.6"
        stroke="#B49C8C"
        strokeWidth="1.1"
        strokeLinecap="round"
        fill="none"
      />

      {/* 胡须 */}
      <path
        d="M42 70l-9-3M42 75l-9 2M98 70l9-3M98 75l9 2"
        stroke="#D8BFB0"
        strokeWidth="0.9"
        strokeLinecap="round"
        opacity="0.8"
      />

      {/* 收在身前的前爪 */}
      <ellipse
        cx="56"
        cy="116"
        rx="9"
        ry="6"
        fill="#FFF6F1"
        stroke="#C9B4A6"
        strokeWidth="1.1"
      />

      {/* 抬手的前爪：旋转中心在肩部 (100, 94) */}
      <g
        className="animate-mascot-wave motion-reduce:animate-none"
        style={{ transformOrigin: '100px 94px' }}
      >
        {/* 肩部与上臂的衔接 */}
        <circle cx="100" cy="94" r="7.5" fill="url(#rabbit-fur)" />
        {/* 上臂：浅褐灰细描边 + 渐变填充，形成体积 */}
        <path
          d="M100 94c4-6 7-13 9-19"
          stroke="#C9B4A6"
          strokeWidth="11"
          strokeLinecap="round"
        />
        <path
          d="M100 94c4-6 7-13 9-19"
          stroke="url(#rabbit-fur)"
          strokeWidth="8.5"
          strokeLinecap="round"
        />
        {/* 前爪 */}
        <ellipse
          cx="111"
          cy="70"
          rx="8"
          ry="8.5"
          fill="url(#rabbit-fur)"
          stroke="#C9B4A6"
          strokeWidth="1.1"
        />
        {/* 爪尖的浅色分瓣 */}
        <path
          d="M107 64c1-2 3-2.4 4.4-1.4M111 62.8c1.2-1.4 3-1 3.6 0.6"
          stroke="#D8BFB0"
          strokeWidth="0.9"
          strokeLinecap="round"
          fill="none"
        />
      </g>
    </svg>
  );
}

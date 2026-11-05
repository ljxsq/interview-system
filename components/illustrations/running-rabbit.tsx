import { RABBIT_COLORS } from '@/components/illustrations/rabbit-palette';

interface RunningRabbitProps {
  /** 控制尺寸的类名（保持比例，建议 h-* w-auto）。 */
  className?: string;
  /** 无障碍描述，默认为「奔跑中等待评估的小兔子」。 */
  label?: string;
}

/**
 * 奔跑中等待评估的小兔子：与登录页欢迎兔同一套造型语言——
 * 奶白/浅驼渐变皮毛、粉色内耳与腮红、深褐眼睛带高光、浅褐灰细描边。
 * 前倾身体、耳朵后扬、前爪前摆；两条后腿以 CSS transform 交替迈步，
 * `motion-reduce:animate-none` 下停止动画并保留静态奔跑姿态。
 */
export function RunningRabbit({
  className,
  label = '奔跑中等待评估的小兔子',
}: RunningRabbitProps) {
  return (
    <svg
      viewBox="0 0 170 132"
      role="img"
      aria-label={label}
      focusable="false"
      className={className}
    >
      <defs>
        <linearGradient id="run-fur" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={RABBIT_COLORS.furLight} />
          <stop offset="1" stopColor={RABBIT_COLORS.furShade} />
        </linearGradient>
        <linearGradient id="run-ear-inner" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={RABBIT_COLORS.earInnerLight} />
          <stop offset="1" stopColor={RABBIT_COLORS.earInner} />
        </linearGradient>
        <radialGradient id="run-cheek" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={RABBIT_COLORS.cheek} stopOpacity="0.55" />
          <stop offset="1" stopColor={RABBIT_COLORS.cheek} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="run-belly" cx="0.5" cy="0.45" r="0.6">
          <stop offset="0" stopColor={RABBIT_COLORS.belly} stopOpacity="0.85" />
          <stop offset="0.7" stopColor={RABBIT_COLORS.belly} stopOpacity="0.35" />
          <stop offset="1" stopColor={RABBIT_COLORS.belly} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="run-sheen" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={RABBIT_COLORS.sheen} stopOpacity="0.55" />
          <stop offset="1" stopColor={RABBIT_COLORS.sheen} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* 地面柔影 */}
      <ellipse
        cx="88"
        cy="122"
        rx="48"
        ry="5"
        fill={RABBIT_COLORS.ground}
      />

      {/* 速度线（静态装饰） */}
      <path
        d="M26 68h-9M30 79h-12M33 90h-8"
        stroke={RABBIT_COLORS.whisker}
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.55"
        fill="none"
      />

      {/* 尾巴 */}
      <circle
        cx="42"
        cy="76"
        r="8"
        fill={RABBIT_COLORS.belly}
        stroke={RABBIT_COLORS.outline}
        strokeWidth="1.1"
      />

      {/* 后腿 B：与前腿错开半个周期 */}
      <g
        className="animate-rabbit-run motion-reduce:animate-none"
        style={{ transformOrigin: '74px 96px', animationDelay: '-0.6s' }}
      >
        <ellipse
          cx="70"
          cy="105"
          rx="12"
          ry="14"
          fill="url(#run-fur)"
          stroke={RABBIT_COLORS.outline}
          strokeWidth="1.1"
        />
        <ellipse
          cx="78"
          cy="117"
          rx="14"
          ry="5.5"
          fill={RABBIT_COLORS.furLight}
          stroke={RABBIT_COLORS.outline}
          strokeWidth="1.1"
        />
      </g>

      {/* 后腿 A */}
      <g
        className="animate-rabbit-run motion-reduce:animate-none"
        style={{ transformOrigin: '88px 97px' }}
      >
        <ellipse
          cx="86"
          cy="104"
          rx="12"
          ry="14"
          fill="url(#run-fur)"
          stroke={RABBIT_COLORS.outline}
          strokeWidth="1.1"
        />
        <ellipse
          cx="94"
          cy="118"
          rx="14"
          ry="5.5"
          fill={RABBIT_COLORS.furLight}
          stroke={RABBIT_COLORS.outline}
          strokeWidth="1.1"
        />
      </g>

      {/* 前倾身体 */}
      <ellipse
        cx="82"
        cy="82"
        rx="33"
        ry="24"
        transform="rotate(-15 82 82)"
        fill="url(#run-fur)"
        stroke={RABBIT_COLORS.outline}
        strokeWidth="1.1"
      />
      {/* 腹部柔光 */}
      <ellipse
        cx="86"
        cy="88"
        rx="23"
        ry="15"
        transform="rotate(-15 82 82)"
        fill="url(#run-belly)"
      />

      {/* 前摆的双臂：上臂与爪子 */}
      <path
        d="M100 88c12 1 21 5 28 11"
        stroke={RABBIT_COLORS.outline}
        strokeWidth="9"
        strokeLinecap="round"
      />
      <path
        d="M100 88c12 1 21 5 28 11"
        stroke="url(#run-fur)"
        strokeWidth="6.5"
        strokeLinecap="round"
      />
      <ellipse
        cx="130"
        cy="101"
        rx="6.5"
        ry="6"
        fill="url(#run-fur)"
        stroke={RABBIT_COLORS.outline}
        strokeWidth="1.1"
      />
      <path
        d="M104 95c9 1 16 4 22 8"
        stroke={RABBIT_COLORS.outline}
        strokeWidth="8"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M104 95c9 1 16 4 22 8"
        stroke="url(#run-fur)"
        strokeWidth="5.5"
        strokeLinecap="round"
        opacity="0.85"
      />

      {/* 后扬的长耳：先画在头后 */}
      <g transform="rotate(-38 100 30)">
        <ellipse
          cx="100"
          cy="28"
          rx="8"
          ry="23"
          fill="url(#run-fur)"
          stroke={RABBIT_COLORS.outline}
          strokeWidth="1.1"
        />
        <ellipse
          cx="100"
          cy="30"
          rx="4"
          ry="15"
          fill="url(#run-ear-inner)"
        />
      </g>
      <g transform="rotate(-24 116 26)">
        <ellipse
          cx="116"
          cy="24"
          rx="8"
          ry="23"
          fill="url(#run-fur)"
          stroke={RABBIT_COLORS.outline}
          strokeWidth="1.1"
        />
        <ellipse
          cx="116"
          cy="26"
          rx="4"
          ry="15"
          fill="url(#run-ear-inner)"
        />
      </g>

      {/* 头部：轻微前倾 */}
      <g transform="rotate(-5 112 58)">
        <ellipse
          cx="112"
          cy="58"
          rx="25"
          ry="21"
          fill="url(#run-fur)"
          stroke={RABBIT_COLORS.outline}
          strokeWidth="1.1"
        />
        {/* 头顶高光 */}
        <ellipse cx="103" cy="43" rx="11" ry="7" fill="url(#run-sheen)" />

        {/* 腮红 */}
        <ellipse cx="99" cy="67" rx="7" ry="5" fill="url(#run-cheek)" />
        <ellipse cx="125" cy="65" rx="7" ry="5" fill="url(#run-cheek)" />

        {/* 眼睛 + 高光 */}
        <ellipse
          cx="104"
          cy="57"
          rx="3.3"
          ry="4"
          fill={RABBIT_COLORS.eye}
        />
        <ellipse
          cx="120"
          cy="55"
          rx="3.3"
          ry="4"
          fill={RABBIT_COLORS.eye}
        />
        <circle cx="105.2" cy="55.6" r="1.2" fill={RABBIT_COLORS.belly} />
        <circle cx="121.2" cy="53.6" r="1.2" fill={RABBIT_COLORS.belly} />

        {/* 鼻子与三瓣嘴 */}
        <path
          d="M109 65h7l-3.5 4z"
          fill={RABBIT_COLORS.earInner}
          stroke={RABBIT_COLORS.noseStroke}
          strokeWidth="0.8"
          strokeLinejoin="round"
        />
        <path
          d="M112.5 69v3M112.5 72c-1 2-4 2.6-6 1.2M112.5 72c1 2 4 2.6 6 1.2"
          stroke={RABBIT_COLORS.mouthStroke}
          strokeWidth="1.1"
          strokeLinecap="round"
          fill="none"
        />

        {/* 胡须 */}
        <path
          d="M95 64l-9-3M95 69l-9 2M129 62l9-3M129 67l9 2"
          stroke={RABBIT_COLORS.whisker}
          strokeWidth="0.9"
          strokeLinecap="round"
          opacity="0.8"
        />
      </g>
    </svg>
  );
}

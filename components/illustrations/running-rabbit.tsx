import { RABBIT_COLORS as C } from '@/components/illustrations/rabbit-palette';

interface RunningRabbitProps {
  /** 控制尺寸的类名（保持比例，建议 h-* w-auto）。 */
  className?: string;
  /** 无障碍描述，默认为「奔跑中等待评估的墨兔」。 */
  label?: string;
}

/**
 * 奔跑中等待评估的墨兔：与登录页执卷墨兔同一套水墨造型——
 * 兔身留白、浓墨勾线、耳内黛青淡染、腹部淡赭渲染。
 * 前倾身体、耳朵后扬、前爪前摆；两条后腿以 CSS transform 轻微交替迈步，
 * `motion-reduce:animate-none` 下停止动画并保留静态奔跑姿态。
 */
export function RunningRabbit({
  className,
  label = '奔跑中等待评估的墨兔',
}: RunningRabbitProps) {
  return (
    <svg
      viewBox="0 0 170 132"
      role="img"
      aria-label={label}
      focusable="false"
      className={className}
    >
      {/* 地面淡墨 */}
      <ellipse cx="88" cy="122" rx="48" ry="5" fill={C.ground} />

      {/* 速度线（静态淡墨装饰） */}
      <path
        d="M26 68h-9M30 79h-12M33 90h-8"
        stroke={C.whisker}
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.5"
        fill="none"
      />

      {/* 尾巴 */}
      <circle
        cx="42"
        cy="76"
        r="8"
        fill={C.furLight}
        stroke={C.outline}
        strokeWidth="1.3"
      />

      {/* 后腿 B：与前腿错开半个周期 */}
      <g
        style={{ transformOrigin: '74px 96px' }}
      >
        <ellipse
          cx="70"
          cy="105"
          rx="12"
          ry="14"
          fill={C.furLight}
          stroke={C.outline}
          strokeWidth="1.3"
        />
        <ellipse
          cx="78"
          cy="117"
          rx="14"
          ry="5.5"
          fill={C.furShade}
          stroke={C.outline}
          strokeWidth="1.3"
        />
      </g>

      {/* 后腿 A */}
      <g
        style={{ transformOrigin: '88px 97px' }}
      >
        <ellipse
          cx="86"
          cy="104"
          rx="12"
          ry="14"
          fill={C.furLight}
          stroke={C.outline}
          strokeWidth="1.3"
        />
        <ellipse
          cx="94"
          cy="118"
          rx="14"
          ry="5.5"
          fill={C.furShade}
          stroke={C.outline}
          strokeWidth="1.3"
        />
      </g>

      {/* 前倾身体 */}
      <ellipse
        cx="82"
        cy="82"
        rx="33"
        ry="24"
        transform="rotate(-15 82 82)"
        fill={C.furLight}
        stroke={C.outline}
        strokeWidth="1.3"
      />
      {/* 腹部淡赭水墨 */}
      <ellipse
        cx="86"
        cy="88"
        rx="23"
        ry="15"
        transform="rotate(-15 82 82)"
        fill={C.furShade}
        opacity="0.5"
      />

      {/* 前摆的双臂：上臂与爪子 */}
      <path
        d="M100 88c12 1 21 5 28 11"
        stroke={C.outline}
        strokeWidth="8"
        strokeLinecap="round"
      />
      <path
        d="M100 88c12 1 21 5 28 11"
        stroke={C.furLight}
        strokeWidth="5.5"
        strokeLinecap="round"
      />
      <ellipse
        cx="130"
        cy="101"
        rx="6.5"
        ry="6"
        fill={C.furLight}
        stroke={C.outline}
        strokeWidth="1.3"
      />
      <path
        d="M104 95c9 1 16 4 22 8"
        stroke={C.outline}
        strokeWidth="7"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M104 95c9 1 16 4 22 8"
        stroke={C.furLight}
        strokeWidth="4.5"
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
          fill={C.furLight}
          stroke={C.outline}
          strokeWidth="1.3"
        />
        <ellipse cx="100" cy="30" rx="4" ry="15" fill={C.earInnerLight} />
      </g>
      <g transform="rotate(-24 116 26)">
        <ellipse
          cx="116"
          cy="24"
          rx="8"
          ry="23"
          fill={C.furLight}
          stroke={C.outline}
          strokeWidth="1.3"
        />
        <ellipse cx="116" cy="26" rx="4" ry="15" fill={C.earInnerLight} />
      </g>

      {/* 头部：轻微前倾 */}
      <g transform="rotate(-5 112 58)">
        <ellipse
          cx="112"
          cy="58"
          rx="25"
          ry="21"
          fill={C.furLight}
          stroke={C.outline}
          strokeWidth="1.3"
        />

        {/* 腮红：黛青极淡一点 */}
        <ellipse cx="100" cy="66" rx="6" ry="4" fill={C.cheek} opacity="0.14" />
        <ellipse cx="124" cy="64" rx="6" ry="4" fill={C.cheek} opacity="0.14" />

        {/* 眼睛 */}
        <ellipse cx="104" cy="57" rx="3.2" ry="3.8" fill={C.eye} />
        <ellipse cx="120" cy="55" rx="3.2" ry="3.8" fill={C.eye} />
        <circle cx="105.2" cy="55.6" r="1" fill={C.sheen} />
        <circle cx="121.2" cy="53.6" r="1" fill={C.sheen} />

        {/* 鼻子（黛青点）与三瓣嘴 */}
        <path
          d="M109 65h7l-3.5 4z"
          fill={C.earInner}
          stroke={C.noseStroke}
          strokeWidth="0.8"
          strokeLinejoin="round"
        />
        <path
          d="M112.5 69v3M112.5 72c-1 2-4 2.6-6 1.2M112.5 72c1 2 4 2.6 6 1.2"
          stroke={C.mouthStroke}
          strokeWidth="1.1"
          strokeLinecap="round"
          fill="none"
        />

        {/* 须线：淡墨 */}
        <path
          d="M95 64l-9-3M95 69l-9 2M129 62l9-3M129 67l9 2"
          stroke={C.whisker}
          strokeWidth="0.9"
          strokeLinecap="round"
          opacity="0.75"
          fill="none"
        />
      </g>
    </svg>
  );
}

interface WaitingIllustrationProps {
  /** 控制插画尺寸的类名（保持宽高比，建议用 h-* + w-auto）。 */
  className?: string;
  /** 无障碍描述，默认为「执卷诵读的小童」。 */
  label?: string;
}

/**
 * 执卷诵读的小童：水墨线稿 + 黛青点缀，身旁立一盏灯笼。
 * 用于答题页与新建页的加载/等待态；纯内联 SVG，不依赖外部资源。
 */
export function WaitingIllustration({
  className,
  label = '执卷诵读的小童',
}: WaitingIllustrationProps) {
  const ink = '#262623';
  const paper = '#F5F5F0';
  const wash = '#E3EDEB';
  const accent = '#2F4F4F';

  return (
    <svg
      viewBox="0 0 160 120"
      role="img"
      aria-label={label}
      focusable="false"
      className={className}
      fill="none"
    >
      {/* 地面淡墨 */}
      <ellipse cx="80" cy="109" rx="52" ry="6" fill="#E3E0D8" />

      {/* 木凳 */}
      <rect
        x="46"
        y="83"
        width="50"
        height="7"
        rx="2"
        fill={wash}
        stroke={ink}
        strokeWidth="1.5"
      />
      <path d="M54 90v12M88 90v12" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />

      {/* 小童：长衫 → 头 → 发 */}
      <path
        d="M55 47c-6 2-9 7-9 14v23h26v-23c0-7-3-12-9-14z"
        fill={paper}
        stroke={ink}
        strokeWidth="1.5"
      />
      <path
        d="M58 47l6 7 6-7"
        stroke={ink}
        strokeWidth="1.3"
        strokeLinejoin="round"
        fill="none"
      />
      <circle
        cx="64"
        cy="36"
        r="11"
        fill={paper}
        stroke={ink}
        strokeWidth="1.5"
      />
      <path
        d="M54 31c1-7 4-10 10-10s9 3 10 10c-6-3-14-3-20 0z"
        fill={ink}
        fillOpacity="0.9"
        stroke={ink}
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="60" cy="37" r="1.5" fill={ink} />
      <circle cx="68" cy="37" r="1.5" fill={ink} />
      <path
        d="M61 42c2 1.6 4 1.6 6 0"
        stroke={ink}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {/* 腮上一点黛青 */}
      <circle cx="56" cy="40" r="1.6" fill={accent} opacity="0.3" />
      <circle cx="72" cy="40" r="1.6" fill={accent} opacity="0.3" />

      {/* 双手捧着的卷轴 */}
      <g>
        <rect
          x="49"
          y="56"
          width="30"
          height="9"
          fill={paper}
          stroke={ink}
          strokeWidth="1.3"
        />
        <ellipse
          cx="49"
          cy="60.5"
          rx="3.5"
          ry="6.5"
          fill={wash}
          stroke={ink}
          strokeWidth="1.3"
        />
        <ellipse
          cx="79"
          cy="60.5"
          rx="3.5"
          ry="6.5"
          fill={wash}
          stroke={ink}
          strokeWidth="1.3"
        />
        <rect x="63" y="57.8" width="7" height="5.4" fill={accent} fillOpacity="0.8" />
        <path
          d="M52 55c-3 0-5 2-5 4M76 55c3 0 5 2 5 4"
          stroke={ink}
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </g>

      {/* 灯笼：竹竿 + 灯身 + 流苏 */}
      <path d="M122 96v-46" stroke={ink} strokeWidth="1.4" strokeLinecap="round" />
      <ellipse cx="122" cy="34" rx="9" ry="11" fill="#DDE5E4" stroke={ink} strokeWidth="1.4" />
      <path
        d="M113 29h18M113 39h18M122 23v-1M122 45v4"
        stroke={ink}
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path d="M122 49l2.5 5-2.5 5-2.5-5z" fill={accent} fillOpacity="0.85" stroke={ink} strokeWidth="1" />

      {/* 云纹 */}
      <path
        d="M28 34c0-4 3-7 7-7 4 0 6 3 5 6 4 0 6 4 4 7"
        stroke={ink}
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.45"
      />
      <path
        d="M136 68c0-3 2-5 5-5 3 0 4 2 4 4 3 0 4 3 3 5"
        stroke={ink}
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.4"
      />
      <circle cx="34" cy="72" r="1.6" fill={accent} opacity="0.45" />
      <circle cx="110" cy="70" r="1.4" fill={wash} stroke={ink} strokeWidth="1" strokeOpacity="0.4" />
    </svg>
  );
}

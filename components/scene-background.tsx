/**
 * 全站共用背景层：直接使用水墨参考图（public/background-scene.png）。
 *
 * - 原图为竖幅 683×1024，包含右上枯枝、底部柳丛 / 岸石 / 石拱桥 / 远景墨团、
 *   中部大面积留白；这里不做任何重绘或裁切变形，只用 CSS 定位取景。
 * - 横向桌面视口用 cover 取图的下缘（桥、柳丛、飞鸟），保留中部留白；
 *   竖屏移动端 cover 只裁左右，能同时看到右上枯枝与底部桥，水平位置偏右。
 * - 图上一层极淡的月白蒙层（#FAF8F0），压住墨色但保留构图，文字对比度优先。
 * - fixed 铺满、pointer-events: none、-z-10，位于所有内容之下；纯静态无动画。
 * - 挂载于 app/layout.tsx，四页共用同一层。
 */
export function SceneBackground() {
  return (
    <div
      aria-hidden="true"
      className="scene-background pointer-events-none fixed inset-0 -z-10 select-none"
    >
      <div className="scene-photo" />
      <div className="scene-veil" />
    </div>
  );
}

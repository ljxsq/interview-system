/**
 * 登录页「执卷墨兔」与报告页「奔跑墨兔」共用的水墨色。
 * 集中色值，避免两个组件的墨色 / 黛青 / 淡青配色漂移。
 */
export const RABBIT_COLORS = {
  furLight: '#F5F5F0', // 月白：兔身留白
  furShade: '#E3EDEB', // 淡青灰：腹部与暗部的水墨渲染
  earInnerLight: '#DDE5E4', // 耳内淡青
  earInner: '#C2D0CE', // 耳内黛青淡染
  cheek: '#2F4F4F', // 黛青（低透明度使用）
  outline: '#262623', // 浓墨线
  whisker: '#8A8880', // 淡墨须线
  eye: '#262623',
  noseStroke: '#2F4F4F',
  mouthStroke: '#6B6963',
  belly: '#F5F5F0',
  sheen: '#FAFAF7',
  ground: '#E3E0D8',
  seal: '#2F4F4F', // 青印
} as const;

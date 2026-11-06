import { redirect } from 'next/navigation';

/**
 * 根路由只做跳转，不渲染任何 UI。cacheComponents 下该页没有可交付的静态壳，
 * 按项目既有约定（见 interview/[sessionId]/report/page.tsx）用 instant = false
 * 关闭静态壳校验，避免预渲染阻塞告警。
 */
export const instant = false;

export default function Home() {
  redirect('/login');
}

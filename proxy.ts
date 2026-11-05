import { NextResponse, type NextRequest } from 'next/server';

import { AUTH_COOKIE_NAME, verifySessionToken } from '@/lib/auth';

/**
 * Next.js 16 的请求拦截入口（原 middleware 已更名为 proxy，文件位于项目根目录）。
 * 这里只做 JWT 签名/过期校验，不引入 bcrypt 等 Node 依赖。
 */
export async function proxy(request: NextRequest) {
  const secret = process.env.AUTH_SECRET;
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (!secret || !token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  try {
    await verifySessionToken(token, secret);
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL('/login', request.url));
  }
}

export const config = {
  matcher: ['/interview/:path*'],
};

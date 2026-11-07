import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';

import {
  AUTH_COOKIE_NAME,
  AUTH_TOKEN_MAX_AGE,
  signSessionToken,
} from '@/lib/auth';
import { getUserByEmail } from '@/lib/storage';

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: '请求体必须是合法 JSON' },
      { status: 400 },
    );
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json(
      { success: false, error: '请求体必须是 JSON 对象' },
      { status: 400 },
    );
  }

  const { email, password } = body as LoginBody;

  if (typeof email !== 'string' || email.trim() === '') {
    return NextResponse.json(
      { success: false, error: '缺少必填参数 email' },
      { status: 400 },
    );
  }

  if (typeof password !== 'string' || password === '') {
    return NextResponse.json(
      { success: false, error: '缺少必填参数 password' },
      { status: 400 },
    );
  }

  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    return NextResponse.json(
      {
        success: false,
        error: '服务器未配置 AUTH_SECRET，无法签发登录凭证',
      },
      { status: 500 },
    );
  }

  try {
    const user = await getUserByEmail(email.trim().toLowerCase());

    // 内部可区分“账号不存在”与“口令错误”，但对外统一使用同一提示，避免枚举用户。
    const passwordMatched =
      user !== undefined &&
      (await bcrypt.compare(password, user.password_hash));

    if (!user || !passwordMatched) {
      return NextResponse.json(
        { success: false, error: '邮箱或密码错误' },
        { status: 401 },
      );
    }

    const token = await signSessionToken(user.id, user.email, secret);

    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
      },
    });

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      maxAge: AUTH_TOKEN_MAX_AGE,
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

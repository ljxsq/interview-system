import { randomUUID } from 'node:crypto';

import bcrypt from 'bcryptjs';

import { getUserByEmail, saveUser } from '@/lib/storage';
import type { User } from '@/lib/types';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 72; // bcrypt 有效输入上限

interface RegisterBody {
  email?: unknown;
  password?: unknown;
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { success: false, error: '请求体必须是合法 JSON' },
      { status: 400 },
    );
  }

  if (typeof body !== 'object' || body === null) {
    return Response.json(
      { success: false, error: '请求体必须是 JSON 对象' },
      { status: 400 },
    );
  }

  const { email, password } = body as RegisterBody;

  if (typeof email !== 'string' || email.trim() === '') {
    return Response.json(
      { success: false, error: '缺少必填参数 email' },
      { status: 400 },
    );
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!EMAIL_PATTERN.test(normalizedEmail)) {
    return Response.json(
      { success: false, error: 'email 格式不正确' },
      { status: 400 },
    );
  }

  if (typeof password !== 'string' || password === '') {
    return Response.json(
      { success: false, error: '缺少必填参数 password' },
      { status: 400 },
    );
  }

  if (
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    return Response.json(
      {
        success: false,
        error: `password 长度需为 ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} 位`,
      },
      { status: 400 },
    );
  }

  try {
    const existing = await getUserByEmail(normalizedEmail);

    if (existing) {
      return Response.json(
        { success: false, error: '该邮箱已注册' },
        { status: 409 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user: User = {
      id: randomUUID(),
      email: normalizedEmail,
      password_hash: passwordHash,
      created_at: new Date().toISOString(),
    };

    await saveUser(user);

    // 响应中绝不包含 password_hash。
    return Response.json(
      {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          created_at: user.created_at,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return Response.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

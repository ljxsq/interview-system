import { SignJWT, jwtVerify } from 'jose';

/**
 * 认证相关的 JWT 工具。
 * 注意：此文件会被 proxy.ts 引用，因此不引入 server-only（proxy 有独立运行环境约束）。
 * 仅存放无副作用的签名/校验逻辑。
 */

export const AUTH_COOKIE_NAME = 'interview_auth';
/** 登录有效期：7 天（秒） */
export const AUTH_TOKEN_MAX_AGE = 60 * 60 * 24 * 7;
const TOKEN_ALGORITHM = 'HS256';

export interface SessionTokenPayload {
  sub: string;
  email: string;
}

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(
  userId: string,
  email: string,
  secret: string,
): Promise<string> {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: TOKEN_ALGORITHM })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${AUTH_TOKEN_MAX_AGE}s`)
    .sign(secretKey(secret));
}

export async function verifySessionToken(
  token: string,
  secret: string,
): Promise<SessionTokenPayload> {
  const { payload } = await jwtVerify(token, secretKey(secret), {
    algorithms: [TOKEN_ALGORITHM],
  });

  if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
    throw new Error('JWT 缺少 sub 或 email 字段');
  }

  return { sub: payload.sub, email: payload.email };
}

/**
 * 从请求 Cookie 中读取登录态；无效、缺失或缺少 AUTH_SECRET 时返回 null。
 * 返回的 sub 是用户 id（与 User.id、JWT sub 一致）。
 */
export async function getSessionUserFromRequest(
  request: Request,
): Promise<SessionTokenPayload | null> {
  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    return null;
  }

  const token = readCookie(
    request.headers.get('cookie'),
    AUTH_COOKIE_NAME,
  );

  if (!token) {
    return null;
  }

  try {
    return await verifySessionToken(token, secret);
  } catch {
    return null;
  }
}

function readCookie(
  cookieHeader: string | null,
  name: string,
): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');

    if (separator < 0) {
      continue;
    }

    const key = part.slice(0, separator).trim();

    if (key === name) {
      return part.slice(separator + 1).trim();
    }
  }

  return null;
}

/**
 * API 路由鉴权入口：无有效登录态时返回 null，由调用方返回 401 JSON。
 * 不对外区分“缺失/过期/签名无效”，避免泄露细节。
 */
export async function getRequiredSessionUser(
  request: Request,
): Promise<SessionTokenPayload | null> {
  return getSessionUserFromRequest(request);
}

/** 统一的 401 JSON 响应。 */
export function unauthorizedResponse(): Response {
  return Response.json(
    { success: false, error: '未登录或登录状态已失效，请先登录' },
    { status: 401 },
  );
}

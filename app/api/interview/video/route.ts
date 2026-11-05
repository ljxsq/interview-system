import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

import {
  getRequiredSessionUser,
  unauthorizedResponse,
} from '@/lib/auth';
import { getQuestionBySession, getSession } from '@/lib/storage';

const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QUESTION_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const VIDEO_DIR = path.join(process.cwd(), 'data', 'videos');

const EXTENSIONS = [
  { extension: 'mp4', contentType: 'video/mp4' },
  { extension: 'webm', contentType: 'video/webm' },
] as const;

interface RangeResult {
  start: number;
  end: number;
}

/** 只支持单段 Range；返回 null 表示无 Range，'invalid' 表示不可满足。 */
function parseRange(
  value: string | null,
  size: number,
): RangeResult | 'invalid' | null {
  if (!value) {
    return null;
  }

  if (!value.startsWith('bytes=')) {
    return null;
  }

  const spec = value.slice('bytes='.length).trim();

  // 多段 Range 不支持，退化为完整响应由调用方处理。
  if (spec.includes(',')) {
    return null;
  }

  const [rawStart, rawEnd] = spec.split('-');

  if (rawStart === '') {
    const suffix = Number(rawEnd);

    if (!Number.isInteger(suffix) || suffix <= 0) {
      return 'invalid';
    }

    return { start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number(rawStart);
  const end = rawEnd === '' ? size - 1 : Number(rawEnd);

  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    start > end ||
    start >= size
    || end < 0
  ) {
    return 'invalid';
  }

  return { start, end: Math.min(end, size - 1) };
}

export async function GET(request: Request) {
  const sessionUser = await getRequiredSessionUser(request);

  if (!sessionUser) {
    return unauthorizedResponse();
  }

  const url = new URL(request.url);
  const sessionId = url.searchParams.get('session_id') ?? '';
  const questionId = url.searchParams.get('question_id') ?? '';

  if (!SESSION_ID_PATTERN.test(sessionId)) {
    return Response.json(
      { success: false, error: '缺少或非法参数 session_id' },
      { status: 400 },
    );
  }

  if (!QUESTION_ID_PATTERN.test(questionId)) {
    return Response.json(
      { success: false, error: '缺少或非法参数 question_id' },
      { status: 400 },
    );
  }

  const session = await getSession(sessionId);

  if (!session || session.user_id !== sessionUser.sub) {
    return Response.json(
      { success: false, error: `面试会话不存在：${sessionId}` },
      { status: 404 },
    );
  }

  const question = await getQuestionBySession(sessionId, questionId);

  if (!question) {
    return Response.json(
      {
        success: false,
        error: `题目不属于该会话：session_id=${sessionId}，question_id=${questionId}`,
      },
      { status: 404 },
    );
  }

  let filePath: string | null = null;
  let contentType = '';
  let size = 0;

  for (const candidate of EXTENSIONS) {
    // 路径完全由校验过的 ID 与固定后缀组成，不接受任何外部字符串。
    const candidatePath = path.join(
      VIDEO_DIR,
      sessionId,
      `${questionId}.${candidate.extension}`,
    );

    try {
      const info = await stat(candidatePath);
      if (info.isFile() && info.size > 0) {
        filePath = candidatePath;
        contentType = candidate.contentType;
        size = info.size;
        break;
      }
    } catch {
      // 不存在就继续尝试下一后缀
    }
  }

  if (!filePath) {
    return Response.json(
      { success: false, error: '该题尚未保存录制视频' },
      { status: 404 },
    );
  }

  const range = parseRange(request.headers.get('range'), size);

  if (range === 'invalid') {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${size}` },
    });
  }

  const commonHeaders = {
    'Content-Type': contentType,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=60',
  };

  if (!range) {
    return new Response(
      Readable.toWeb(
        createReadStream(filePath),
      ) as unknown as ReadableStream,
      {
        status: 200,
        headers: {
          ...commonHeaders,
          'Content-Length': String(size),
        },
      },
    );
  }

  return new Response(
    Readable.toWeb(
      createReadStream(filePath, { start: range.start, end: range.end }),
    ) as unknown as ReadableStream,
    {
      status: 206,
      headers: {
        ...commonHeaders,
        'Content-Range': `bytes ${range.start}-${range.end}/${size}`,
        'Content-Length': String(range.end - range.start + 1),
      },
    },
  );
}

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  getRequiredSessionUser,
  unauthorizedResponse,
} from '@/lib/auth';
import {
  getQuestionBySession,
  getSession,
  savePendingAnswer,
  updateSessionStatus,
} from '@/lib/storage';
import { SESSION_STATUS } from '@/lib/types';

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const ALLOWED_VIDEO_TYPES = new Set(['video/mp4', 'video/webm']);

// 白名单：session_id 为 UUID，question_id 为 Coze 返回的 qN 形式。
// 两者都只允许安全字符，杜绝 `..`、分隔符等路径拼接风险。
const SESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QUESTION_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const VIDEO_DIR = path.join(process.cwd(), 'data', 'videos');

interface CozeUploadData {
  id: string;
  bytes: number;
  file_name: string;
}

interface CozeUploadResponse {
  code: number;
  msg?: string;
  data?: CozeUploadData;
}

export async function POST(request: Request) {
  const sessionUser = await getRequiredSessionUser(request);

  if (!sessionUser) {
    return unauthorizedResponse();
  }

  const pat = process.env.COZE_PAT;

  if (!pat) {
    return Response.json(
      {
        success: false,
        error: '缺少环境变量 COZE_PAT，无法上传视频',
      },
      { status: 500 },
    );
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return Response.json(
      { success: false, error: '请求体必须是 multipart/form-data' },
      { status: 400 },
    );
  }

  const file = formData.get('file');

  if (!(file instanceof File)) {
    return Response.json(
      { success: false, error: '缺少文件字段 file' },
      { status: 400 },
    );
  }

  // 会话与题目归属为必填：旧调用方式（不带这两个字段）一律 400。
  const sessionId = formData.get('session_id');
  const questionId = formData.get('question_id');

  if (typeof sessionId !== 'string' || !SESSION_ID_PATTERN.test(sessionId)) {
    return Response.json(
      { success: false, error: '缺少或非法参数 session_id' },
      { status: 400 },
    );
  }

  if (
    typeof questionId !== 'string' ||
    !QUESTION_ID_PATTERN.test(questionId)
  ) {
    return Response.json(
      { success: false, error: '缺少或非法参数 question_id' },
      { status: 400 },
    );
  }

  const session = await getSession(sessionId);

  // 不属于当前登录用户的会话统一 404，避免暴露是否存在。
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

  if (file.size === 0) {
    return Response.json(
      { success: false, error: '上传文件为空' },
      { status: 400 },
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json(
      {
        success: false,
        error: `文件过大，最大允许 ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB`,
      },
      { status: 413 },
    );
  }

  const mimeType = file.type.split(';')[0].trim().toLowerCase();

  if (!ALLOWED_VIDEO_TYPES.has(mimeType)) {
    return Response.json(
      {
        success: false,
        error: '仅支持 video/mp4 或 video/webm 格式',
      },
      { status: 415 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const extension = mimeType === 'video/mp4' ? 'mp4' : 'webm';

    const upstreamForm = new FormData();
    upstreamForm.append(
      'file',
      new Blob([buffer], { type: file.type }),
      file.name || `video.${extension}`,
    );

    const upstreamResponse = await fetch(
      'https://api.coze.cn/v1/files/upload',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${pat}` },
        body: upstreamForm,
      },
    );

    const rawText = await upstreamResponse.text();

    if (!upstreamResponse.ok) {
      return Response.json(
        {
          success: false,
          error: `Coze 文件上传失败：HTTP ${upstreamResponse.status} ${upstreamResponse.statusText}`,
          detail: rawText.slice(0, 300),
        },
        { status: 502 },
      );
    }

    let payload: CozeUploadResponse;

    try {
      payload = JSON.parse(rawText) as CozeUploadResponse;
    } catch {
      return Response.json(
        {
          success: false,
          error: 'Coze 文件上传返回的不是合法 JSON',
          detail: rawText.slice(0, 300),
        },
        { status: 502 },
      );
    }

    if (payload.code !== 0 || !payload.data?.id) {
      return Response.json(
        {
          success: false,
          error: `Coze 文件上传失败：code=${payload.code}，msg=${payload.msg ?? '未知错误'}`,
        },
        { status: 502 },
      );
    }

    // Coze 上传成功后保存本地副本，供跨刷新回看。
    // 目录与文件名全部来自已校验的 ID，不拼接用户可控字符串。
    let videoSaved = true;
    let videoSavedError: string | null = null;

    try {
      const targetDir = path.join(VIDEO_DIR, sessionId);
      await mkdir(targetDir, { recursive: true });
      await writeFile(
        path.join(targetDir, `${questionId}.${extension}`),
        buffer,
      );
    } catch (error) {
      videoSaved = false;
      videoSavedError =
        error instanceof Error ? error.message : String(error);
    }

    // 仅上传、不评估：把 file_id 与会话+题目绑定后持久化，
    // 刷新页面可恢复「已录制待评估」，统一评估时不再重复上传。
    try {
      await savePendingAnswer({
        session_id: sessionId,
        question_id: questionId,
        video_file_id: payload.data.id,
      });

      // 重录会让该题重新回到待评估：已完成的会话需要退回 prep_done，
      // 待重新评估后再由评估接口置 completed。
      if (session.status === SESSION_STATUS.COMPLETED) {
        await updateSessionStatus(sessionId, SESSION_STATUS.PREP_DONE);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      return Response.json(
        {
          success: false,
          error: `视频已上传到 Coze，但待评估记录保存失败：${reason}`,
          file_id: payload.data.id,
          file_name: payload.data.file_name,
          bytes: payload.data.bytes,
          video_saved: videoSaved,
        },
        { status: 500 },
      );
    }

    if (!videoSaved) {
      // 副本写盘失败不阻断后续评估：Coze 的 file_id 已可用，且待评估记录
      // 已落盘，因此仍带上 file_id，由前端继续走统一评估。
      return Response.json(
        {
          success: false,
          error: `视频已上传到 Coze，但本地回看副本保存失败：${videoSavedError}`,
          file_id: payload.data.id,
          file_name: payload.data.file_name,
          bytes: payload.data.bytes,
          video_saved: false,
        },
        { status: 500 },
      );
    }

    return Response.json({
      file_id: payload.data.id,
      file_name: payload.data.file_name,
      bytes: payload.data.bytes,
      video_saved: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return Response.json(
      { success: false, error: `上传视频时发生错误：${message}` },
      { status: 500 },
    );
  }
}

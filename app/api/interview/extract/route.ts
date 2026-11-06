import mammoth from 'mammoth';
import { extractText } from 'unpdf';

import {
  getRequiredSessionUser,
  unauthorizedResponse,
} from '@/lib/auth';
import { runWorkflow } from '@/lib/coze';

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** 与 /api/interview/prep 的 5000 字校验对齐，提前在提取阶段截断。 */
const MAX_TEXT_LENGTH = 5000;

interface TruncateResult {
  text: string;
  original_length: number;
  truncated: boolean;
}

/**
 * 截断计数单位：Unicode code point（`Array.from` 按码点拆分），而不是
 * UTF-16 code unit。这样不会把代理对（emoji 等）切成半个字符；同时额外
 * 保证结果的 UTF-16 长度也不超过上限，因为 prep 的兜底校验用的是
 * `String.length`（UTF-16）。不按 grapheme cluster 切分：5000 字是粗粒度
 * 上限，组合字符被切开只可能影响末尾重音符号，不会产生乱码。
 */
function truncateText(raw: string): TruncateResult {
  const codePoints = Array.from(raw);
  const originalLength = codePoints.length;

  if (originalLength <= MAX_TEXT_LENGTH) {
    return { text: raw, original_length: originalLength, truncated: false };
  }

  const kept: string[] = [];
  let utf16Length = 0;

  for (const codePoint of codePoints) {
    if (kept.length === MAX_TEXT_LENGTH) {
      break;
    }

    // 保证 UTF-16 长度同样不超限，同时绝不切断代理对。
    if (utf16Length + codePoint.length > MAX_TEXT_LENGTH) {
      break;
    }

    kept.push(codePoint);
    utf16Length += codePoint.length;
  }

  return {
    text: kept.join(''),
    original_length: originalLength,
    truncated: true,
  };
}

// 图片转文字工作流入参 image_url: file 类型，实际传 {"file_id":"..."} 的 JSON 字符串
// （工作流 ID 由环境变量 COZE_WORKFLOW_ID_OCR 配置）。
// Coze 文件上传单文件上限远高于 10 MB，这里沿用 512 MB 不设额外约束。
const COZE_UPLOAD_URL = 'https://api.coze.cn/v1/files/upload';

const RESUME_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
]);

const RESUME_EXTENSIONS = new Set(['pdf', 'docx', 'txt', 'md']);

const JD_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const JD_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp']);

interface CozeUploadResponse {
  code: number;
  msg?: string;
  data?: { id: string };
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot + 1).toLowerCase();
}

function normalizeMimeType(file: File): string {
  return file.type.split(';')[0].trim().toLowerCase();
}

/**
 * 类型白名单：优先按 MIME 判断；浏览器对部分扩展名会给出
 * application/octet-stream（如 .md、部分 .docx），此时按扩展名兜底。
 */
function isAllowed(
  file: File,
  mimeTypes: Set<string>,
  extensions: Set<string>,
): boolean {
  const mime = normalizeMimeType(file);
  const extension = extensionOf(file.name);

  if (mimeTypes.has(mime)) {
    return true;
  }

  if (mime === '' || mime === 'application/octet-stream') {
    return extensions.has(extension);
  }

  return false;
}

function errorResponse(message: string, status: number) {
  return Response.json({ success: false, error: message }, { status });
}

async function parseResumeText(file: File, extension: string): Promise<string> {
  if (extension === 'txt' || extension === 'md') {
    return file.text();
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  if (extension === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  // PDF（含扫描版）交给 unpdf/pdfjs，无文字层时返回空串，由调用方按 422 处理。
  const { text } = await extractText(new Uint8Array(buffer), {
    mergePages: true,
  });
  return text;
}

async function recognizeJdText(
  file: File,
  workflowId: string,
): Promise<string> {
  const pat = process.env.COZE_PAT;

  if (!pat) {
    throw new Error('缺少环境变量 COZE_PAT，无法调用图片识别工作流');
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const formData = new FormData();
  formData.append(
    'file',
    new Blob([buffer], { type: file.type || 'image/png' }),
    file.name || 'jd.png',
  );

  const uploadResponse = await fetch(COZE_UPLOAD_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${pat}` },
    body: formData,
  });

  const uploadRaw = await uploadResponse.text();

  if (!uploadResponse.ok) {
    throw new Error(
      `Coze 文件上传失败：HTTP ${uploadResponse.status} ${uploadResponse.statusText}`,
    );
  }

  let uploadPayload: CozeUploadResponse;

  try {
    uploadPayload = JSON.parse(uploadRaw) as CozeUploadResponse;
  } catch {
    throw new Error('Coze 文件上传返回的不是合法 JSON');
  }

  if (uploadPayload.code !== 0 || !uploadPayload.data?.id) {
    throw new Error(
      `Coze 文件上传失败：code=${uploadPayload.code}，msg=${uploadPayload.msg ?? '未知错误'}`,
    );
  }

  // 该工作流的 image 入参只接受 {"file_id":"..."} 的 JSON 字符串：
  // 裸 file_id 会被 Coze 判为参数非法（code=4000）。
  const data = await runWorkflow(workflowId, {
    image_url: JSON.stringify({ file_id: uploadPayload.data.id }),
  });

  const output =
    typeof data === 'object' && data !== null
      ? (data as { output?: unknown }).output
      : undefined;

  if (typeof output !== 'string') {
    throw new Error('图片识别工作流未返回 output 文本字段');
  }

  return output;
}

export async function POST(request: Request) {
  const sessionUser = await getRequiredSessionUser(request);

  if (!sessionUser) {
    return unauthorizedResponse();
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return errorResponse('请求体必须是 multipart/form-data', 400);
  }

  const file = formData.get('file');
  const kind = formData.get('kind');

  if (!(file instanceof File)) {
    return errorResponse('缺少文件字段 file', 400);
  }

  if (kind !== 'resume' && kind !== 'jd') {
    return errorResponse('缺少或非法参数 kind（仅支持 resume 或 jd）', 400);
  }

  if (file.size === 0) {
    return errorResponse('上传文件为空', 422);
  }

  if (file.size > MAX_FILE_BYTES) {
    return errorResponse(
      `文件过大，最大允许 ${MAX_FILE_BYTES / (1024 * 1024)} MB`,
      413,
    );
  }

  const allowed =
    kind === 'resume'
      ? isAllowed(file, RESUME_MIME_TYPES, RESUME_EXTENSIONS)
      : isAllowed(file, JD_MIME_TYPES, JD_EXTENSIONS);

  if (!allowed) {
    return errorResponse(
      kind === 'resume'
        ? '简历仅支持 PDF / DOCX / TXT / MD 格式'
        : 'JD 截图仅支持 PNG / JPG / JPEG / WEBP 格式',
      415,
    );
  }

  try {
    let text: string;

    if (kind === 'jd') {
      const workflowId = process.env.COZE_WORKFLOW_ID_OCR;

      if (!workflowId) {
        return errorResponse(
          '缺少环境变量 COZE_WORKFLOW_ID_OCR，无法调用 JD 图片识别工作流',
          500,
        );
      }

      text = await recognizeJdText(file, workflowId);
    } else {
      text = await parseResumeText(file, extensionOf(file.name));
    }

    if (text.trim().length === 0) {
      return errorResponse(
        kind === 'jd'
          ? '未识别到文字，请换一张更清晰的截图重试'
          : '未从文件中提取到文字（扫描版 PDF 或无文字层文件无法解析）',
        422,
      );
    }

    const result = truncateText(text);

    return Response.json({
      success: true,
      text: result.text,
      truncated: result.truncated,
      original_length: result.original_length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // 外部服务（Coze）失败按 502，解析/格式问题按 422，均只返回可读原因，不带堆栈。
    const isUpstream = message.startsWith('Coze') || message.includes('COZE_PAT');
    return errorResponse(
      isUpstream
        ? `图片识别失败：${message}`
        : `文案提取失败：${message}`,
      isUpstream ? 502 : 422,
    );
  }
}

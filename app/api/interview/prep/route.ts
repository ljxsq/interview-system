import { randomUUID } from 'node:crypto';

import { runWorkflow } from '@/lib/coze';
import {
  getRequiredSessionUser,
  unauthorizedResponse,
} from '@/lib/auth';
import { saveQuestions, saveSession } from '@/lib/storage';
import {
  SESSION_STATUS,
  parseQuestions,
  type InterviewSession,
  type PrepWorkflowOutput,
} from '@/lib/types';

const MAX_TEXT_LENGTH = 5000;

interface PrepRequestBody {
  resume_text?: unknown;
  jd_text?: unknown;
}

export async function POST(request: Request) {
  const sessionUser = await getRequiredSessionUser(request);

  if (!sessionUser) {
    return unauthorizedResponse();
  }

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

  const { resume_text, jd_text } = body as PrepRequestBody;

  if (typeof resume_text !== 'string' || resume_text.trim() === '') {
    return Response.json(
      { success: false, error: '缺少必填参数 resume_text' },
      { status: 400 },
    );
  }

  if (typeof jd_text !== 'string' || jd_text.trim() === '') {
    return Response.json(
      { success: false, error: '缺少必填参数 jd_text' },
      { status: 400 },
    );
  }

  if (resume_text.length > MAX_TEXT_LENGTH || jd_text.length > MAX_TEXT_LENGTH) {
    return Response.json(
      {
        success: false,
        error: `resume_text 与 jd_text 长度不能超过 ${MAX_TEXT_LENGTH} 字符`,
      },
      { status: 400 },
    );
  }

  const workflowId = process.env.COZE_WORKFLOW_ID_PREP;

  if (!workflowId) {
    return Response.json(
      {
        success: false,
        error:
          '缺少环境变量 COZE_WORKFLOW_ID_PREP，无法调用 Coze 备课工作流',
      },
      { status: 500 },
    );
  }

  try {
    const data = await runWorkflow(workflowId, {
      resume_text,
      jd_text,
    });

    if (
      typeof data !== 'object' ||
      data === null ||
      typeof (data as PrepWorkflowOutput).questions !== 'string' ||
      typeof (data as PrepWorkflowOutput).template_matched !== 'string'
    ) {
      throw new Error(
        'Coze 返回的 data 缺少 questions 或 template_matched 字段，未写入会话与题目存储',
      );
    }

    const sessionId = randomUUID();
    const questions = parseQuestions(
      (data as PrepWorkflowOutput).questions,
      sessionId,
    );

    // user_id 语义为 User.id（JWT 的 sub）。
    const session: InterviewSession = {
      id: sessionId,
      user_id: sessionUser.sub,
      resume_text,
      jd_text,
      template_matched: (data as PrepWorkflowOutput).template_matched,
      status: SESSION_STATUS.PREP_DONE,
    };

    await saveSession(session);
    await saveQuestions(questions);

    return Response.json({
      session_id: sessionId,
      questions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return Response.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

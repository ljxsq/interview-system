import { randomUUID } from 'node:crypto';

import {
  getRequiredSessionUser,
  unauthorizedResponse,
} from '@/lib/auth';
import { runWorkflow } from '@/lib/coze';
import { saveQuestions, saveSession } from '@/lib/storage';
import {
  SESSION_STATUS,
  parseQuestions,
  type InterviewSession,
  type PrepWorkflowOutput,
} from '@/lib/types';

// 当前测试用固定简历/JD；后续可由请求体传入。
const RESUME_TEXT =
  '张明，3年Python开发经验，熟悉FastAPI、LangChain、Milvus。';
const JD_TEXT =
  '岗位：AI应用开发工程师，要求熟悉Python、FastAPI、RAG、向量数据库。';

export async function GET(request: Request) {
  // 生产环境直接按不存在处理：先于鉴权返回，确保不触达 Coze、不写入存储。
  if (process.env.NODE_ENV === 'production') {
    return Response.json(
      { success: false, error: 'Not Found' },
      { status: 404 },
    );
  }

  const sessionUser = await getRequiredSessionUser(request);

  if (!sessionUser) {
    return unauthorizedResponse();
  }

  const workflowId = process.env.COZE_WORKFLOW_ID_PREP;

  if (!workflowId) {
    return Response.json(
      {
        success: false,
        error:
          '缺少环境变量 COZE_WORKFLOW_ID_PREP，无法调用 Coze 工作流',
      },
      { status: 500 },
    );
  }

  // user_id 一律取 JWT 的 sub，不再接受 query 参数覆盖。
  const userId = sessionUser.sub;

  try {
    const data = await runWorkflow(workflowId, {
      resume_text: RESUME_TEXT,
      jd_text: JD_TEXT,
    });

    // 仅在成功路径写入存储；解析/注册异常会由下方 catch 转为 500 返回。
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

    const session: InterviewSession = {
      id: sessionId,
      user_id: userId,
      resume_text: RESUME_TEXT,
      jd_text: JD_TEXT,
      template_matched: (data as PrepWorkflowOutput).template_matched,
      status: SESSION_STATUS.PREP_DONE,
    };

    await saveSession(session);
    await saveQuestions(questions);

    return Response.json({ success: true, data, session_id: sessionId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return Response.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

import {
  getRequiredSessionUser,
  unauthorizedResponse,
} from '@/lib/auth';
import { runWorkflow } from '@/lib/coze';
import {
  deletePendingAnswer,
  getPendingAnswerByQuestion,
  getQuestionBySession,
  getSession,
  listAnswersBySession,
  listPendingAnswersBySession,
  listQuestionsBySession,
  saveAnswer,
  updateSessionStatus,
} from '@/lib/storage';
import { SESSION_STATUS, type AnswerRecord } from '@/lib/types';

interface EvalRequestBody {
  session_id?: unknown;
  question_id?: unknown;
  video_url?: unknown;
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

  const { session_id, question_id, video_url } = body as EvalRequestBody;

  if (typeof session_id !== 'string' || session_id.trim() === '') {
    return Response.json(
      { success: false, error: '缺少必填参数 session_id（非空字符串）' },
      { status: 400 },
    );
  }

  if (typeof question_id !== 'string' || question_id.trim() === '') {
    return Response.json(
      { success: false, error: '缺少必填参数 question_id（非空字符串）' },
      { status: 400 },
    );
  }

  const workflowId = process.env.COZE_WORKFLOW_ID_EVAL;

  if (!workflowId) {
    return Response.json(
      {
        success: false,
        error:
          '缺少环境变量 COZE_WORKFLOW_ID_EVAL，无法调用 Coze 评价工作流',
      },
      { status: 500 },
    );
  }

  const session = await getSession(session_id);

  // 会话不存在或不属于当前用户时统一 404，避免暴露存在性。
  if (!session || session.user_id !== sessionUser.sub) {
    return Response.json(
      { success: false, error: `面试会话不存在：${session_id}` },
      { status: 404 },
    );
  }

  const question = await getQuestionBySession(session_id, question_id);

  // 题目不属于该会话时同样 404，避免泄露其他会话的题目是否存在。
  if (!question) {
    return Response.json(
      {
        success: false,
        error: `题目不属于该会话：session_id=${session_id}，question_id=${question_id}`,
      },
      { status: 404 },
    );
  }

  // 兼容两种调用方式：
  // 1. 旧方式：显式传入 Coze 文件引用字符串（video_url）；
  // 2. 新方式：不传 video_url，用上传时持久化的 file_id 组装。
  // 旧调用不会因为缺少新字段/新记录而 400。
  let videoParam: string;

  if (typeof video_url === 'string' && video_url.trim() !== '') {
    videoParam = video_url;
  } else {
    const pending = await getPendingAnswerByQuestion(
      session_id,
      question_id,
    );

    if (!pending) {
      return Response.json(
        {
          success: false,
          error:
            '缺少必填参数 video_url，且该题没有已上传待评估的视频记录',
        },
        { status: 400 },
      );
    }

    // 评价工作流只接受 Coze 文件引用，file_id 需以 JSON 字符串形式传入。
    videoParam = JSON.stringify({ file_id: pending.video_file_id });
  }

  try {
    const data = await runWorkflow(workflowId, {
      video: videoParam,
      question_text: question.question_text,
      evaluation_points: question.evaluation_points,
    });

    const result = data as Pick<
      AnswerRecord,
      | 'score'
      | 'dimension_scores'
      | 'comment'
      | 'is_fallback'
      | 'covered_points'
      | 'missed_points'
    >;

    const answer: AnswerRecord = {
      session_id,
      question_id,
      video_url: videoParam,
      score: result.score,
      dimension_scores: result.dimension_scores,
      comment: result.comment,
      is_fallback: result.is_fallback,
      // 原样落盘工作流返回的要点；工作流未返回时保持 undefined
      // （JSON 序列化会忽略该键），与历史记录形态一致。
      covered_points: Array.isArray(result.covered_points)
        ? result.covered_points
        : undefined,
      missed_points: Array.isArray(result.missed_points)
        ? result.missed_points
        : undefined,
    };

    try {
      await saveAnswer(answer);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      return Response.json(
        {
          success: false,
          error: `评价已完成但保存失败：保存答题记录失败：${reason}`,
          data,
        },
        { status: 500 },
      );
    }

    // 评分已落盘后清理待评估记录。即使清理失败，读取侧仍会用 answers
    // 的 video_url 与 pending 的 file_id 比对去重，不会把已评估题当成待评估。
    try {
      await deletePendingAnswer(session_id, question_id);
    } catch {
      // 清理失败不影响本次评估结果与报告。
    }

    try {
      const sessionQuestions = await listQuestionsBySession(
        question.session_id,
      );
      const sessionAnswers = await listAnswersBySession(
        question.session_id,
      );
      const pendingItems = await listPendingAnswersBySession(
        question.session_id,
      );
      const answeredIds = new Set(
        sessionAnswers.map((item) => item.question_id),
      );
      const pendingIds = new Set(
        pendingItems.map((item) => item.question_id),
      );

      // 仅当每道题都已评估且没有剩余待评估录制时才置 completed；
      // 部分评估继续保持 prep_done。
      if (
        sessionQuestions.length > 0 &&
        sessionQuestions.every(
          (item) =>
            answeredIds.has(item.question_id) &&
            !pendingIds.has(item.question_id),
        )
      ) {
        await updateSessionStatus(
          question.session_id,
          SESSION_STATUS.COMPLETED,
        );
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      return Response.json(
        {
          success: false,
          error: `评价已完成且答题记录已保存，但更新会话状态失败：${reason}`,
          data,
        },
        { status: 500 },
      );
    }

    return Response.json({
      success: true,
      data,
      answer_saved: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Coze 6014（fields cannot be extracted from null values）通常是视频未能被解析出
    // 有效字段（编码不被接受、无有效语音等）。对外统一换成可理解的中文提示，
    // 原始信息仅在非生产环境通过 detail 返回，便于排查。
    if (isVideoUnprocessableError(message)) {
      return Response.json(
        {
          success: false,
          error:
            '视频内容无法解析，请重新录制后重试；若仍失败，请更换浏览器（推荐使用支持录制 MP4 的新版 Chrome/Edge）',
          ...(process.env.NODE_ENV === 'production'
            ? {}
            : { detail: message }),
        },
        { status: 422 },
      );
    }

    return Response.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

function isVideoUnprocessableError(message: string): boolean {
  return (
    /code=6014/.test(message) ||
    message.includes('fields cannot be extracted from null values')
  );
}

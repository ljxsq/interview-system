import {
  getRequiredSessionUser,
  unauthorizedResponse,
} from '@/lib/auth';
import { runWorkflow } from '@/lib/coze';
import {
  getQuestionBySession,
  getSession,
  listAnswersBySession,
  listQuestionsBySession,
  saveAnswer,
  updateSessionStatus,
} from '@/lib/storage';
import {
  SESSION_STATUS,
  type AnswerRecord,
} from '@/lib/types';

interface EvalRequestBody {
  session_id?: unknown;
  question_id?: unknown;
  video_url?: unknown;
}

export async function POST(request: Request) {
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

  if (typeof video_url !== 'string' || video_url.trim() === '') {
    return Response.json(
      { success: false, error: '缺少必填参数 video_url（非空字符串）' },
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

  // 只允许定位该会话下的题目，已移除全局 question_id 兜底路径。
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

  const answerSessionId = question.session_id;

  try {
    const data = await runWorkflow(workflowId, {
      video: video_url,
      question_text: question.question_text,
      evaluation_points: question.evaluation_points,
    });

    // 字段值直接取自 Coze 返回；covered_points / missed_points 一并落盘，
    // 工作流未返回时保持 undefined（JSON 序列化忽略该键），兼容历史记录。
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
      session_id: answerSessionId,
      question_id,
      video_url,
      score: result.score,
      dimension_scores: result.dimension_scores,
      comment: result.comment,
      is_fallback: result.is_fallback,
      covered_points: Array.isArray(result.covered_points)
        ? result.covered_points
        : undefined,
      missed_points: Array.isArray(result.missed_points)
        ? result.missed_points
        : undefined,
    };

    // 落盘策略：评价成功但保存失败必须返回 500；同时把已算出的 data 一并带回，
    // 避免长耗时的评价结果丢失，客户端可先展示结果再重试保存。
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

    // 最小完成判定：该 session 下所有题目都有答题记录时，会话状态置为 completed。
    try {
      const sessionQuestions = await listQuestionsBySession(
        answerSessionId,
      );
      const sessionAnswers = await listAnswersBySession(
        answerSessionId,
      );
      const answeredIds = new Set(
        sessionAnswers.map((item) => item.question_id),
      );

      if (
        sessionQuestions.length > 0 &&
        sessionQuestions.every((item) =>
          answeredIds.has(item.question_id),
        )
      ) {
        await updateSessionStatus(
          question.session_id,
          SESSION_STATUS.COMPLETED,
        );
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);

      // 答题记录已落盘但会话状态不一致，同样视为本次请求失败返回 500。
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

    return Response.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}

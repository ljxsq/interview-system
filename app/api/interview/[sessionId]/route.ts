import { access } from 'node:fs/promises';
import path from 'node:path';

import {
  getRequiredSessionUser,
  unauthorizedResponse,
} from '@/lib/auth';
import {
  getSession,
  listAnswersBySession,
  listPendingAnswersBySession,
  listQuestionsBySession,
} from '@/lib/storage';
import { EVALUATION_STATUS, pendingVideoUrl } from '@/lib/types';

const VIDEO_DIR = path.join(process.cwd(), 'data', 'videos');
const VIDEO_EXTENSIONS = ['mp4', 'webm'] as const;

async function videoExists(
  sessionId: string,
  questionId: string,
): Promise<boolean> {
  for (const extension of VIDEO_EXTENSIONS) {
    try {
      await access(
        path.join(VIDEO_DIR, sessionId, `${questionId}.${extension}`),
      );
      return true;
    } catch {
      // 继续尝试下一后缀
    }
  }

  return false;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const sessionUser = await getRequiredSessionUser(request);

  if (!sessionUser) {
    return unauthorizedResponse();
  }

  const { sessionId } = await params;

  const session = await getSession(sessionId);

  // 不属于当前登录用户时同样返回 404，避免暴露 session 是否存在。
  if (!session || session.user_id !== sessionUser.sub) {
    return Response.json(
      { success: false, error: `面试会话不存在：${sessionId}` },
      { status: 404 },
    );
  }

  const questions = await listQuestionsBySession(sessionId);
  const answers = await listAnswersBySession(sessionId);
  const pendingAnswers = await listPendingAnswersBySession(sessionId);

  // 追加 answers（additive，不破坏既有字段）。旧记录可能没有
  // covered_points / missed_points，这里统一以空数组呈现，避免调用方判空。
  const answerItems = await Promise.all(
    answers.map(async (answer) => ({
      question_id: answer.question_id,
      score: answer.score,
      dimension_scores: answer.dimension_scores,
      comment: answer.comment,
      is_fallback: answer.is_fallback,
      covered_points: answer.covered_points ?? [],
      missed_points: answer.missed_points ?? [],
      video_available: await videoExists(
        sessionId,
        answer.question_id,
      ),
      // 历史记录没有该字段，answers 中的记录一律视为已评估。
      evaluation_status: EVALUATION_STATUS.DONE,
    })),
  );

  // 待评估记录：只暴露状态与回看可用性，不返回 Coze file_id。
  // 同一份录制若已经评估过（清理失败等），按 video_url 去重，避免重复评估。
  const answeredByQuestionId = new Map(
    answers.map((answer) => [answer.question_id, answer]),
  );
  const pendingItems = await Promise.all(
    pendingAnswers
      .filter((pending) => {
        const answer = answeredByQuestionId.get(pending.question_id);
        return !(answer && answer.video_url === pendingVideoUrl(pending));
      })
      .map(async (pending) => ({
        question_id: pending.question_id,
        evaluation_status: EVALUATION_STATUS.PENDING,
        video_available: await videoExists(
          sessionId,
          pending.question_id,
        ),
      })),
  );

  // resume_text / jd_text 为增量字段，供「重新面试」预填使用；
  // 仅在会话归属校验通过后返回，不附带用户、密码等无关数据。
  return Response.json({
    session_id: session.id,
    status: session.status,
    resume_text: session.resume_text,
    jd_text: session.jd_text,
    questions,
    answers: answerItems,
    pending_answers: pendingItems,
    answer_fields: {
      covered_points: true,
      missed_points: true,
    },
  });
}

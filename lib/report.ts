import type {
  AnswerRecord,
  DimensionScores,
  InterviewReport,
  Question,
  QuestionReportItem,
} from './types';

/**
 * 面试报告聚合（纯函数）。
 *
 * 约束：无 IO、无 Date.now、无随机、不读 storage、不依赖 server-only，
 * 因此只依赖入参，可直接单测。
 *
 * 口径说明：
 * - 总分与维度均分只统计 is_fallback !== true 的题；is_fallback 缺省或
 *   非布尔值时按 false 处理（历史记录可能没有该字段，只有明确为 true
 *   才视为兜底评分）。
 * - 维度均分逐项独立统计分母：某题缺失某个维度字段时直接跳过，不补零。
 * - 同一 question_id 在 answers 中重复时，按 saveAnswer 的覆盖语义取最后
 *   一条（后写覆盖先写）。
 * - 出现在 answers 但不在 questions 中的记录不进入明细，也不参与聚合。
 * - pendingQuestionIds 为「已录制待评估」的题；这些题即使存在历史评分也
 *   不算作已评估，不计入总分/维度均分，也不进入 fallback 统计。
 *   该参数可选，历史调用（不传）行为完全不变。
 * - 无有效非 fallback 样本时对应均分返回 null，不会出现 NaN。
 */
const DIMENSION_KEYS = ['clarity', 'depth', 'relevance'] as const;

type DimensionKey = (typeof DIMENSION_KEYS)[number];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** 报告统一用空数组呈现缺失要点，避免下游处理 undefined。 */
function readPoints(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((point): point is string => typeof point === 'string');
}

export function buildReport(
  sessionId: string,
  questions: Question[],
  answers: AnswerRecord[],
  pendingQuestionIds: ReadonlySet<string> = new Set(),
): InterviewReport {
  // 后写覆盖先写，与 saveAnswer 的 (session_id, question_id) 覆盖语义一致。
  const latestByQuestionId = new Map<string, AnswerRecord>();

  for (const answer of answers) {
    latestByQuestionId.set(answer.question_id, answer);
  }

  const items: QuestionReportItem[] = questions.map((question) => {
    const answer = latestByQuestionId.get(question.question_id);
    const isPending = pendingQuestionIds.has(question.question_id);

    return {
      question_id: question.question_id,
      question_text: question.question_text,
      // 待评估题不展示历史评分，避免重录后仍显示旧分数。
      score:
        !isPending && answer && isFiniteNumber(answer.score)
          ? answer.score
          : null,
      covered_points: isPending ? [] : readPoints(answer?.covered_points),
      missed_points: isPending ? [] : readPoints(answer?.missed_points),
      comment:
        !isPending &&
        answer &&
        typeof answer.comment === 'string'
          ? answer.comment
          : null,
      is_fallback: !isPending && answer?.is_fallback === true,
      answered: answer !== undefined,
      ...(isPending ? { evaluation_pending: true } : {}),
    };
  });

  const scoreValues: number[] = [];
  const dimensionValues: Record<DimensionKey, number[]> = {
    clarity: [],
    depth: [],
    relevance: [],
  };
  const fallbackQuestionIds: string[] = [];
  let answeredQuestions = 0;
  let evaluatedQuestions = 0;
  let pendingQuestions = 0;

  for (const item of items) {
    if (item.evaluation_pending) {
      pendingQuestions += 1;
      continue;
    }

    if (!item.answered) {
      continue;
    }

    answeredQuestions += 1;
    evaluatedQuestions += 1;

    if (item.is_fallback) {
      fallbackQuestionIds.push(item.question_id);
      continue;
    }

    const answer = latestByQuestionId.get(item.question_id);

    if (answer && isFiniteNumber(answer.score)) {
      scoreValues.push(answer.score);
    }

    for (const key of DIMENSION_KEYS) {
      const value = (
        answer?.dimension_scores as Partial<DimensionScores> | undefined
      )?.[key];

      if (isFiniteNumber(value)) {
        dimensionValues[key].push(value);
      }
    }
  }

  return {
    session_id: sessionId,
    total_questions: questions.length,
    answered_questions: answeredQuestions,
    evaluated_questions: evaluatedQuestions,
    pending_questions: pendingQuestions,
    total_score: average(scoreValues),
    dimension_averages: {
      clarity: average(dimensionValues.clarity),
      depth: average(dimensionValues.depth),
      relevance: average(dimensionValues.relevance),
    },
    fallback_count: fallbackQuestionIds.length,
    fallback_question_ids: fallbackQuestionIds,
    items,
  };
}

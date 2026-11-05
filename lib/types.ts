// 本文件仅包含类型定义与纯解析函数，不依赖 server-only，可在任意环境引用。

/**
 * Coze 备课工作流的原始输出（对应 /api/test-coze 返回的 data 字段）。
 */
export interface PrepWorkflowOutput {
  /**
   * 题目列表的 JSON 字符串，**不是数组**。
   * 使用前需通过 parseQuestions / parsePrepWorkflowOutput 解析。
   */
  questions: string;
  /** 命中的模板标识，例如 "ai_app" */
  template_matched: string;
}

/**
 * Coze questions 数组元素的原始形态：不包含 session_id。
 * session_id 由调用方在解析时注入（Coze 返回值里没有该字段）。
 */
export type CozeQuestion = Omit<Question, 'session_id'>;

/**
 * 单道面试题（questions 字符串解析后的数组元素）。
 */
export interface Question {
  /** 题目唯一标识，例如 "q1" */
  question_id: string;
  /** 所属面试会话 ID，由调用方注入，Coze 不返回 */
  session_id: string;
  /** 题干文本 */
  question_text: string;
  /** 评分要点，每项为一个考察点描述 */
  evaluation_points: string[];
  /** 难度，实际观察到 easy / medium / hard */
  difficulty: string;
}

/** 评价工作流返回的分维度得分 */
export interface DimensionScores {
  clarity: number;
  depth: number;
  relevance: number;
}

/**
 * 单条答题记录，对应评价工作流返回的 data 结构。
 */
export interface AnswerRecord {
  /**
   * 所属会话。新记录必填；历史记录迁移时若无法唯一推断归属则为 null（legacy），
   * legacy 记录不参与按 session 的查询。
   */
  session_id: string | null;
  question_id: string;
  video_url: string;
  score: number;
  dimension_scores: DimensionScores;
  comment: string;
  is_fallback: boolean;
  /**
   * 评价工作流返回的已覆盖要点。为兼容历史记录与工作流未返回该字段的情况，
   * 这里保持可选：undefined 表示未落盘该字段，[] 表示工作流明确返回空列表。
   */
  covered_points?: string[];
  /** 评价工作流返回的遗漏要点，可选原因同上。 */
  missed_points?: string[];
}

/**
 * 待评估的录制记录：只保存上传结果，不保存评分。
 *
 * 与 AnswerRecord 分集合存放，历史 answers 的结构与 buildReport 的入参契约
 * 完全不变；评分完成后由评估接口写入 answers 并删除对应 pending 记录。
 */
export interface PendingAnswer {
  session_id: string;
  question_id: string;
  /** Coze 文件上传返回的 file_id，评估时组装为 {"file_id": ...}。 */
  video_file_id: string;
}

/** 单题的评估状态：pending=已录制待评估，done=已评估。 */
export const EVALUATION_STATUS = {
  PENDING: 'pending',
  DONE: 'done',
} as const;

export type EvaluationStatus =
  (typeof EVALUATION_STATUS)[keyof typeof EVALUATION_STATUS];

/**
 * 待评估记录对应的 Coze 视频参数，与 AnswerRecord.video_url 同构。
 * 用于判断某条 pending 是否已被同一份录制评估过（避免清理失败时误判）。
 */
export function pendingVideoUrl(pending: PendingAnswer): string {
  return JSON.stringify({ file_id: pending.video_file_id });
}

/** 报告中单道题的明细（按传入 questions 的顺序排列）。 */
export interface QuestionReportItem {
  question_id: string;
  question_text: string;
  /** 未作答、待评估或评分缺失时为 null。 */
  score: number | null;
  covered_points: string[];
  missed_points: string[];
  comment: string | null;
  is_fallback: boolean;
  /** 该题在 answers 中是否有对应记录。 */
  answered: boolean;
  /** 该题已有录制但尚未评估（待评估优先于历史评分）。 */
  evaluation_pending?: boolean;
}

/** 一次面试的聚合报告。 */
export interface InterviewReport {
  session_id: string;
  total_questions: number;
  answered_questions: number;
  /** 已完成评估的题数（answered 且未处于待评估）。 */
  evaluated_questions: number;
  /** 已录制但尚未评估的题数，不计入总分与维度均分。 */
  pending_questions: number;
  /** 仅统计 is_fallback=false 的题；无有效样本时为 null（不会出现 NaN）。 */
  total_score: number | null;
  /** 三个维度的均分，分母只统计实际有该字段的非 fallback 题。 */
  dimension_averages: {
    clarity: number | null;
    depth: number | null;
    relevance: number | null;
  };
  /** is_fallback=true 的题数与对应 question_id 列表。 */
  fallback_count: number;
  fallback_question_ids: string[];
  items: QuestionReportItem[];
}

/**
 * 会话状态常量（集中定义，后续确认 Coze/业务取值后可收窄类型）。
 */
export const SESSION_STATUS = {
  PREP_DONE: 'prep_done',
  COMPLETED: 'completed',
} as const;

/**
 * 注册用户。password_hash 为 bcrypt 哈希，禁止在任何响应或日志中输出。
 */
export interface User {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
}

/**
 * 一次面试会话。
 * status 目前使用 string 以兼容尚未完全确认的取值，业务侧应使用 SESSION_STATUS。
 */
export interface InterviewSession {
  id: string;
  user_id: string;
  resume_text: string;
  jd_text: string;
  template_matched: string;
  status: string;
}

/**
 * questions 已解析为数组后的工作流输出。
 */
export type ParsedPrepWorkflowOutput = Omit<PrepWorkflowOutput, 'questions'> & {
  questions: Question[];
};

/**
 * 将 questions 原始 JSON 字符串解析为题目数组，并注入 session_id。
 * 校验只针对 Coze 实际返回的字段，不要求 Coze 返回 session_id。
 */
export function parseQuestions(
  raw: string,
  sessionId: string,
): Question[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `questions 不是合法 JSON：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      `questions 解析结果应为数组，实际为 ${typeof parsed}`,
    );
  }

  if (!parsed.every(isCozeQuestion)) {
    throw new Error('questions 数组存在字段缺失或类型不正确的题目');
  }

  return parsed.map((item) => ({ ...item, session_id: sessionId }));
}

/**
 * 解析完整工作流输出，把 questions 字符串替换为题目数组（注入 session_id）。
 */
export function parsePrepWorkflowOutput(
  output: PrepWorkflowOutput,
  sessionId: string,
): ParsedPrepWorkflowOutput {
  return {
    ...output,
    questions: parseQuestions(output.questions, sessionId),
  };
}

function isCozeQuestion(value: unknown): value is CozeQuestion {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const item = value as Record<string, unknown>;

  return (
    typeof item.question_id === 'string' &&
    typeof item.question_text === 'string' &&
    typeof item.difficulty === 'string' &&
    Array.isArray(item.evaluation_points) &&
    item.evaluation_points.every(
      (point) => typeof point === 'string',
    )
  );
}

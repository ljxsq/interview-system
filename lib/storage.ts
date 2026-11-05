import 'server-only';

import { randomUUID } from 'node:crypto';
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import type {
  AnswerRecord,
  InterviewSession,
  PendingAnswer,
  Question,
  User,
} from './types';

/**
 * 基于 JSON 文件的持久化存储。
 *
 * 文件位置：<项目根>/data/interview.json。
 * 读写策略：
 * - 首次访问自动创建 data/ 目录与初始文件；
 * - 写入先写同目录临时文件再 rename，保证原子性；
 * - 所有操作经同一个 Promise 队列串行执行，避免并发写覆盖；
 * - 读操作使用轻量内存缓存，写入成功后立即失效；
 * - 文件不存在或内容为空按初始结构处理，JSON 损坏时抛出带路径的错误。
 */
interface InterviewStoreData {
  users: User[];
  sessions: InterviewSession[];
  questions: Question[];
  answers: AnswerRecord[];
  /**
   * 已录制待评估的记录（只存 file_id）。后加集合：旧数据文件缺少该字段时
   * 按空数组处理，不影响既有 answers。
   */
  pending_answers: PendingAnswer[];
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'interview.json');

const EMPTY_STORE: InterviewStoreData = {
  users: [],
  sessions: [],
  questions: [],
  answers: [],
  pending_answers: [],
};

/**
 * Next dev 下不同 route 可能各自打包，模块级变量不是同一实例；
 * 缓存与写队列统一挂到 globalThis，保证跨路由共享与失效可见。
 */
interface StorageGlobals {
  __interviewSystemStoreCacheV2?: InterviewStoreData | null;
  __interviewSystemQueueTail?: Promise<void>;
}

const storageGlobals = globalThis as typeof globalThis & StorageGlobals;

// 串行化所有读写，避免并发写入相互覆盖。
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const previous =
    storageGlobals.__interviewSystemQueueTail ?? Promise.resolve();
  const result = previous.then(task, task);

  storageGlobals.__interviewSystemQueueTail = result.then(
    () => undefined,
    () => undefined,
  );

  return result;
}

/** 保存（或更新）用户；调用方负责保证 email 唯一。 */
export function saveUser(user: User): Promise<void> {
  return enqueue(async () => {
    const data = structuredClone(await loadData());
    const index = data.users.findIndex((item) => item.id === user.id);

    if (index >= 0) {
      data.users[index] = user;
    } else {
      data.users.push(user);
    }

    await persist(data);
  });
}

/** 按 email 查询用户；不存在时返回 undefined。 */
export function getUserByEmail(
  email: string,
): Promise<User | undefined> {
  return enqueue(async () => {
    const data = await loadData();
    return data.users.find((user) => user.email === email);
  });
}

/** 保存（或更新）面试会话。 */
export function saveSession(session: InterviewSession): Promise<void> {
  return enqueue(async () => {
    const data = structuredClone(await loadData());
    const index = data.sessions.findIndex(
      (item) => item.id === session.id,
    );

    if (index >= 0) {
      data.sessions[index] = session;
    } else {
      data.sessions.push(session);
    }

    await persist(data);
  });
}

/** 按 session id 查询会话；不存在时返回 undefined。 */
export function getSession(
  id: string,
): Promise<InterviewSession | undefined> {
  return enqueue(async () => {
    const data = await loadData();
    return data.sessions.find((session) => session.id === id);
  });
}

/** 更新会话状态；会话不存在时抛出错误。 */
export function updateSessionStatus(
  id: string,
  status: string,
): Promise<void> {
  return enqueue(async () => {
    const data = structuredClone(await loadData());
    const session = data.sessions.find((item) => item.id === id);

    if (!session) {
      throw new Error(`会话不存在，无法更新状态：${id}`);
    }

    session.status = status;
    await persist(data);
  });
}

/** 按 user_id 查询会话列表。 */
export function listSessionsByUser(
  userId: string,
): Promise<InterviewSession[]> {
  return enqueue(async () => {
    const data = await loadData();
    return data.sessions.filter(
      (session) => session.user_id === userId,
    );
  });
}

/** 保存题目（批量）。同一会话内按 question_id 覆盖；不同会话的相同 question_id 会追加保留。 */
export function saveQuestions(items: readonly Question[]): Promise<void> {
  return enqueue(async () => {
    const data = structuredClone(await loadData());

    for (const item of items) {
      const index = data.questions.findIndex(
        (question) =>
          question.question_id === item.question_id &&
          question.session_id === item.session_id,
      );

      if (index >= 0) {
        data.questions[index] = item;
      } else {
        data.questions.push(item);
      }
    }

    await persist(data);
  });
}

/** 按 session_id 查询题目列表。 */
export function listQuestionsBySession(
  sessionId: string,
): Promise<Question[]> {
  return enqueue(async () => {
    const data = await loadData();
    return data.questions.filter(
      (question) => question.session_id === sessionId,
    );
  });
}

/** 按 question_id 查询评分要点；题目不存在时返回 undefined。 */
export function getEvaluationPoints(
  questionId: string,
): Promise<string[] | undefined> {
  return enqueue(async () => {
    const data = await loadData();
    return data.questions.find(
      (question) => question.question_id === questionId,
    )?.evaluation_points;
  });
}

/**
 * 按 question_id 查询完整题目（仅按单一字段匹配）。
 * 注意：question_id 只在会话内唯一，多会话下同名会命中"最新写入的一条"，
 * 已无业务调用方（遗留保留，请勿用于答题/评价定位，改用 getQuestionBySession）。
 * 题目不存在时返回 undefined。
 */
export function getQuestion(
  questionId: string,
): Promise<Question | undefined> {
  return enqueue(async () => {
    const data = await loadData();

    for (let i = data.questions.length - 1; i >= 0; i -= 1) {
      if (data.questions[i].question_id === questionId) {
        return data.questions[i];
      }
    }

    return undefined;
  });
}

/** 按 (session_id, question_id) 查询题目，避免同名 question_id 串会话。 */
export function getQuestionBySession(
  sessionId: string,
  questionId: string,
): Promise<Question | undefined> {
  return enqueue(async () => {
    const data = await loadData();

    return data.questions.find(
      (question) =>
        question.session_id === sessionId &&
        question.question_id === questionId,
    );
  });
}

/** 保存答题记录（按 (session_id, question_id) 复合键覆盖旧记录）。 */
export function saveAnswer(answer: AnswerRecord): Promise<void> {
  return enqueue(async () => {
    const data = structuredClone(await loadData());
    const index = data.answers.findIndex(
      (item) =>
        item.session_id === answer.session_id &&
        item.question_id === answer.question_id,
    );

    if (index >= 0) {
      data.answers[index] = answer;
    } else {
      data.answers.push(answer);
    }

    await persist(data);
  });
}

/** 按 (session_id, question_id) 查询答题记录；不存在时返回 undefined。 */
export function getAnswerByQuestionId(
  sessionId: string,
  questionId: string,
): Promise<AnswerRecord | undefined> {
  return enqueue(async () => {
    const data = await loadData();
    return data.answers.find(
      (answer) =>
        answer.session_id === sessionId &&
        answer.question_id === questionId,
    );
  });
}

/**
 * 保存（或覆盖）待评估录制记录。
 * 按 (session_id, question_id) 复合键覆盖：重录同一题时新 file_id 生效，
 * 不会产生多条记录。
 */
export function savePendingAnswer(pending: PendingAnswer): Promise<void> {
  return enqueue(async () => {
    const data = structuredClone(await loadData());
    const index = data.pending_answers.findIndex(
      (item) =>
        item.session_id === pending.session_id &&
        item.question_id === pending.question_id,
    );

    if (index >= 0) {
      data.pending_answers[index] = pending;
    } else {
      data.pending_answers.push(pending);
    }

    await persist(data);
  });
}

/** 按 (session_id, question_id) 查询待评估录制记录；不存在时返回 undefined。 */
export function getPendingAnswerByQuestion(
  sessionId: string,
  questionId: string,
): Promise<PendingAnswer | undefined> {
  return enqueue(async () => {
    const data = await loadData();
    return data.pending_answers.find(
      (item) =>
        item.session_id === sessionId &&
        item.question_id === questionId,
    );
  });
}

/** 按 session_id 查询待评估录制记录（按写入顺序）。 */
export function listPendingAnswersBySession(
  sessionId: string,
): Promise<PendingAnswer[]> {
  return enqueue(async () => {
    const data = await loadData();
    return data.pending_answers.filter(
      (item) => item.session_id === sessionId,
    );
  });
}

/**
 * 删除某题的待评估记录，仅在评估成功、评分已写入 answers 后调用。
 * 记录不存在时静默返回，便于重复调用。
 */
export function deletePendingAnswer(
  sessionId: string,
  questionId: string,
): Promise<void> {
  return enqueue(async () => {
    const data = structuredClone(await loadData());
    const next = data.pending_answers.filter(
      (item) =>
        !(
          item.session_id === sessionId &&
          item.question_id === questionId
        ),
    );

    if (next.length === data.pending_answers.length) {
      return;
    }

    data.pending_answers = next;
    await persist(data);
  });
}

/** 按 session_id 查询答题记录；legacy（session_id=null）记录不会返回。 */
export function listAnswersBySession(
  sessionId: string,
): Promise<AnswerRecord[]> {
  return enqueue(async () => {
    const data = await loadData();

    return data.answers.filter(
      (answer) => answer.session_id === sessionId,
    );
  });
}

/**
 * 按 session_id 查询该会话下的全部答题记录。
 *
 * 与 listAnswersBySession 语义完全一致：同一过滤规则（仅返回 session_id
 * 严格匹配的记录，legacy 的 session_id=null 记录不会返回）、同一顺序
 * （按记录写入顺序，不做额外排序）。此处仅做薄封装，委托给现有实现，
 * 不复制读写逻辑，也不改变原函数的签名与行为。
 *
 * 注意：底层是文件持久化 + 串行队列，因此返回 Promise，与
 * listAnswersBySession 一致（无法同步返回数组）。
 */
export function getAnswersBySessionId(
  sessionId: string,
): Promise<AnswerRecord[]> {
  return listAnswersBySession(sessionId);
}

async function loadData(): Promise<InterviewStoreData> {
  const cached = storageGlobals.__interviewSystemStoreCacheV2;

  if (cached) {
    // 开发环境热更新可能沿用旧版本代码写入的缓存对象；补齐后加集合，
    // 避免读取到 undefined。下次写入时该字段会正常落盘。
    if (!Array.isArray(cached.pending_answers)) {
      cached.pending_answers = [];
    }

    return cached;
  }

  await ensureFile();

  let raw: string;
  try {
    raw = await readFile(DATA_FILE, 'utf8');
  } catch (error) {
    throw new Error(
      `读取数据文件失败：${DATA_FILE}：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (raw.trim() === '') {
    const empty = structuredClone(EMPTY_STORE);
    storageGlobals.__interviewSystemStoreCacheV2 = empty;
    return empty;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `数据文件不是合法 JSON：${DATA_FILE}：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!isStoreData(parsed)) {
    throw new Error(
      `数据文件结构不正确（缺少 questions/answers 数组）：${DATA_FILE}`,
    );
  }

  const normalized: InterviewStoreData = {
    // 兼容旧数据：缺少 users/sessions 字段时按空数组处理，下次写入时补齐。
    users: Array.isArray(parsed.users) ? parsed.users : [],
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    questions: parsed.questions,
    answers: parsed.answers,
    // 兼容旧数据：pending_answers 为后加集合，缺失时按空数组处理。
    pending_answers: Array.isArray(parsed.pending_answers)
      ? parsed.pending_answers
      : [],
  };

  // 一次性迁移：旧 answers 无 session_id 时尝试按 questions 推断归属；
  // 无法唯一推断则标记 null（legacy），不猜测、不删除。
  const migration = migrateLegacyAnswers(
    normalized.questions,
    normalized.answers,
  );

  if (migration.changed) {
    normalized.answers = migration.answers;
    await persist(normalized);
  }

  storageGlobals.__interviewSystemStoreCacheV2 = normalized;
  return normalized;
}

interface LegacyAnswer extends Omit<AnswerRecord, 'session_id'> {
  session_id?: string | null;
}

function migrateLegacyAnswers(
  questions: Question[],
  answers: AnswerRecord[],
): { answers: AnswerRecord[]; changed: boolean } {
  let changed = false;

  const migrated = answers.map((answer) => {
    const legacy = answer as LegacyAnswer;

    // 已显式写入 session_id（含 null）的不再重新推断。
    if (legacy.session_id !== undefined) {
      return answer;
    }

    changed = true;

    const candidateSessions = new Set(
      questions
        .filter((question) => question.question_id === answer.question_id)
        .map((question) => question.session_id),
    );

    const sessionId =
      candidateSessions.size === 1
        ? [...candidateSessions][0]
        : null;

    return { ...answer, session_id: sessionId } as AnswerRecord;
  });

  return { answers: migrated, changed };
}

async function ensureFile(): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });

  try {
    await access(DATA_FILE);
  } catch {
    await writeFile(DATA_FILE, serialize(EMPTY_STORE), 'utf8');
  }
}

async function persist(data: InterviewStoreData): Promise<void> {
  const tempFile = `${DATA_FILE}.${randomUUID()}.tmp`;

  try {
    await writeFile(tempFile, serialize(data), 'utf8');
    await rename(tempFile, DATA_FILE);
    storageGlobals.__interviewSystemStoreCacheV2 = null;
  } finally {
    await rm(tempFile, { force: true });
  }
}

function serialize(data: InterviewStoreData): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

function isStoreData(value: unknown): value is InterviewStoreData {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const data = value as Record<string, unknown>;
  // users/sessions 为后加集合，旧文件可能缺失，由 loadData 归一化为空数组。
  return Array.isArray(data.questions) && Array.isArray(data.answers);
}

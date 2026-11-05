'use client';

import { useParams, useRouter } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

import VideoRecorder from '@/components/VideoRecorder';
import { WaitingIllustration } from '@/components/illustrations/waiting-illustration';
import { Skeleton } from '@/components/ui/skeleton';
import type { Question } from '@/lib/types';

interface DimensionScores {
  clarity: number;
  depth: number;
  relevance: number;
}

interface EvalResult {
  score: number;
  dimension_scores: DimensionScores;
  comment: string;
  is_fallback: boolean;
  covered_points?: string[];
  missed_points?: string[];
  /** 该题是否有服务端保存的视频副本（历史记录可能为 false）。 */
  video_available?: boolean;
}

interface AnswerItem {
  question_id: string;
  score: number;
  dimension_scores: DimensionScores;
  comment: string;
  is_fallback: boolean;
  video_available: boolean;
  /** 'done'=已评估；历史记录没有该字段，也按已评估处理。 */
  evaluation_status?: 'done';
}

/** 只上传、未评估的录制记录（服务端不返回 Coze file_id）。 */
interface PendingAnswerItem {
  question_id: string;
  evaluation_status: 'pending';
  video_available: boolean;
}

interface SessionResponse {
  session_id?: string;
  status?: string;
  questions?: Question[];
  answers?: AnswerItem[];
  pending_answers?: PendingAnswerItem[];
  error?: string;
}

/** 单题的录制缓存：blob 用于重试上传，object URL 用于回看播放。 */
interface RecordingEntry {
  blob: Blob;
  url: string;
}

/**
 * 答题页状态机：
 * idle（未开始）→ recording（录制中）→ uploading（上传中）
 * → idle（已录制待评估）/ error（上传失败，可重试或重录）。
 * 评估不再随录制自动触发，统一在最后一题「提交并统一评估」时进行。
 */
type Stage = 'idle' | 'recording' | 'uploading' | 'error';

/** 统一评估的进度与失败项。 */
interface BatchState {
  running: boolean;
  /** 本次要评估的题目总数。 */
  total: number;
  /** 当前正在评估的序号（从 1 开始）。 */
  current: number;
  currentQuestionId: string | null;
  failed: Array<{ questionId: string; message: string }>;
}

const IDLE_BATCH: BatchState = {
  running: false,
  total: 0,
  current: 0,
  currentQuestionId: null,
  failed: [],
};

/**
 * cacheComponents 下，未被 generateStaticParams 覆盖的动态参数在预渲染阶段未知，
 * useParams 会挂起。因此外层负责建立 Suspense 边界，内层组件才消费 useParams。
 */
export default function InterviewSessionPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-3xl p-6">
          <div className="flex flex-col items-center gap-4 rounded-card bg-surface p-6 text-center shadow-card">
            <WaitingIllustration
              className="h-32 w-auto shrink-0"
              label="正在加载面试题"
            />
            <p className="flex items-center gap-2 text-sm text-ink-soft">
              <span aria-hidden="true">⏳</span>
              正在加载面试题…
            </p>
            <div aria-hidden="true" className="w-full max-w-xs space-y-2">
              <Skeleton className="h-3 w-full rounded-pill bg-sand motion-reduce:animate-none" />
              <Skeleton className="h-3 w-4/5 rounded-pill bg-sand motion-reduce:animate-none" />
            </div>
          </div>
        </main>
      }
    >
      <InterviewSessionContent />
    </Suspense>
  );
}

function InterviewSessionContent() {
  const params = useParams();
  const router = useRouter();
  const rawSessionId = params?.sessionId;
  const sessionId = Array.isArray(rawSessionId)
    ? rawSessionId[0]
    : rawSessionId;

  const [status, setStatus] = useState('');
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [recordings, setRecordings] = useState<
    Record<string, RecordingEntry>
  >({});
  const [stage, setStage] = useState<Stage>('idle');
  const [actionError, setActionError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, EvalResult>>({});
  /**
   * 已录制待评估：键为 question_id，值记录该题是否有可回看的服务端副本。
   * 由会话接口的 pending_answers 初始化，本页上传成功后立即写入。
   */
  const [pending, setPending] = useState<
    Record<string, { video_available: boolean }>
  >({});
  const [batch, setBatch] = useState<BatchState>(IDLE_BATCH);
  const recordingsRef = useRef<Record<string, RecordingEntry>>({});

  // 按题目缓存录制：重录同一题时先释放旧 URL 再建新的，其他题的缓存不受影响。
  function putRecording(questionId: string, nextBlob: Blob) {
    const previous = recordingsRef.current;
    const oldEntry = previous[questionId];

    if (oldEntry) {
      URL.revokeObjectURL(oldEntry.url);
    }

    const entry: RecordingEntry = {
      blob: nextBlob,
      url: URL.createObjectURL(nextBlob),
    };
    const next = { ...previous, [questionId]: entry };
    recordingsRef.current = next;
    setRecordings(next);
  }

  // 仅页面卸载时统一释放所有回看地址；切题不释放，保证已答题目仍可回看。
  useEffect(() => {
    return () => {
      Object.values(recordingsRef.current).forEach((entry) => {
        URL.revokeObjectURL(entry.url);
      });
      recordingsRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    let cancelled = false;

    async function loadSession() {
      try {
        const response = await fetch(`/api/interview/${sessionId}`);

        if (response.status === 401) {
          if (!cancelled) {
            setLoadError('登录状态已失效，正在跳转登录页…');
            window.location.assign('/login');
          }
          return;
        }

        const payload = (await response.json().catch(() => null)) as
          | SessionResponse
          | null;

        if (!response.ok) {
          throw new Error(
            payload?.error ?? `加载面试题失败（HTTP ${response.status}）`,
          );
        }

        if (!cancelled) {
          setStatus(payload?.status ?? '');
          setQuestions(payload?.questions ?? []);

          // 回填已落盘的评分；covered_points / missed_points 未在
          // AnswerRecord 中保存，刷新后这两项不展示。
          const restored: Record<string, EvalResult> = {};
          for (const answer of payload?.answers ?? []) {
            restored[answer.question_id] = {
              score: answer.score,
              dimension_scores: answer.dimension_scores,
              comment: answer.comment,
              is_fallback: answer.is_fallback,
              video_available: answer.video_available,
            };
          }

          // 刷新后恢复「已录制待评估」：这些题已有 file_id 与视频副本，
          // 不需要重新上传；待评估优先于历史评分，避免展示重录前的旧分数。
          const restoredPending: Record<
            string,
            { video_available: boolean }
          > = {};
          for (const item of payload?.pending_answers ?? []) {
            restoredPending[item.question_id] = {
              video_available: item.video_available !== false,
            };
            delete restored[item.question_id];
          }

          setResults(restored);
          setPending(restoredPending);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : String(error),
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadSession();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const currentQuestion = questions[currentIndex];
  const currentResult = currentQuestion
    ? results[currentQuestion.question_id]
    : undefined;
  const currentRecording = currentQuestion
    ? recordings[currentQuestion.question_id]
    : undefined;
  const currentPending = currentQuestion
    ? pending[currentQuestion.question_id]
    : undefined;
  // 待评估状态优先于历史评分：重录后、统一评估前不展示旧分数。
  const isCurrentPending = Boolean(currentPending);
  const isCurrentEvaluating =
    batch.running &&
    batch.currentQuestionId === currentQuestion?.question_id;

  // 本次刚录完用内存 blob（秒开）；刷新后用受鉴权的服务端视频路由。
  // 待评估题同样可回看，但仅在上传时本地副本写盘成功时才有服务端副本。
  const serverVideoUrl =
    currentQuestion &&
    sessionId &&
    (currentPending
      ? currentPending.video_available
      : currentResult?.video_available === true)
      ? `/api/interview/video?session_id=${encodeURIComponent(sessionId)}&question_id=${encodeURIComponent(currentQuestion.question_id)}`
      : null;
  const videoSrc = currentRecording?.url ?? serverVideoUrl;

  // 缺少 sessionId 属于可派生的渲染状态，直接由参数推导，不再在 effect 内 setState。
  const missingSessionId = !sessionId;
  const effectiveLoadError = missingSessionId
    ? '缺少会话 ID'
    : loadError;
  const isLoading = !missingSessionId && loading;

  function handleRecordingChange(isRecording: boolean) {
    if (isRecording) {
      setActionError(null);
      setStage('recording');
      return;
    }

    // 停止录制但未产生可用数据时回到未开始；上传由 handleRecorded 接管。
    setStage((previous) =>
      previous === 'recording' ? 'idle' : previous,
    );
  }

  /**
   * 录制结束后只做上传：拿到 file_id 即把该题标记为「已录制待评估」，
   * 立即允许翻到下一题；评估统一在最后一题提交时进行。
   */
  async function uploadRecording(targetBlob: Blob, questionId: string) {
    if (!sessionId) {
      return;
    }

    setActionError(null);
    setStage('uploading');

    try {
      const extension = targetBlob.type.includes('mp4') ? 'mp4' : 'webm';
      const formData = new FormData();
      formData.append(
        'file',
        targetBlob,
        `answer-${questionId}-${Date.now()}.${extension}`,
      );
      // 服务端据此校验归属、保存回看副本并持久化待评估 file_id。
      formData.append('session_id', sessionId);
      formData.append('question_id', questionId);

      const uploadResponse = await fetch('/api/interview/upload', {
        method: 'POST',
        body: formData,
      });

      if (uploadResponse.status === 401) {
        setActionError('登录状态已失效，正在跳转登录页…');
        window.location.assign('/login');
        return;
      }

      const uploadPayload = (await uploadResponse.json().catch(() => null)) as
        | { file_id?: string; video_saved?: boolean; error?: string }
        | null;

      // 本地回看副本写盘失败时服务端返回 500 但仍带回 file_id：
      // 只要拿到 file_id，该题就已进入待评估，不影响继续答题。
      if (!uploadPayload?.file_id) {
        throw new Error(
          uploadPayload?.error ??
            `上传视频失败（HTTP ${uploadResponse.status}）`,
        );
      }

      const videoAvailable = uploadPayload.video_saved !== false;

      setPending((previous) => ({
        ...previous,
        [questionId]: { video_available: videoAvailable },
      }));

      // 重录会把该题拉回待评估：隐藏本页缓存的旧评分，等统一评估覆盖。
      setResults((previous) => {
        if (!(questionId in previous)) {
          return previous;
        }

        const next = { ...previous };
        delete next[questionId];
        return next;
      });

      setStage('idle');
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : String(error),
      );
      setStage('error');
    }
  }

  // 录制结束只上传，不评估。
  function handleRecorded(nextBlob: Blob) {
    if (!currentQuestion) {
      return;
    }

    const questionId = currentQuestion.question_id;
    putRecording(questionId, nextBlob);
    // 重新录制即离开上一轮汇总，避免旧的失败提示残留。
    setBatch(IDLE_BATCH);
    void uploadRecording(nextBlob, questionId);
  }

  function retryUpload() {
    if (currentRecording && currentQuestion) {
      void uploadRecording(
        currentRecording.blob,
        currentQuestion.question_id,
      );
    }
  }

  /**
   * 统一评估：按题目顺序逐题调用现有 /api/interview/eval。
   *
   * 选择客户端顺序调用而不是一个长请求：
   * - 每题 10–20 秒，批量请求容易超过代理/网关超时；
   * - 逐题调用能展示进度、单题失败可隔离并单题重试；
   * - 每完成一题即可即时更新该题结果。
   *
   * 失败不中断其余题：记录失败项，结束后汇总提示，可点「重试失败题目」
   * 再次提交（失败的题仍保留 pending 记录）。
   */
  async function evaluateQuestions(
    questionIds: string[],
    navigateOnSuccess: boolean,
  ) {
    if (!sessionId || busy) {
      return;
    }

    const targets = questions.filter(
      (question) =>
        questionIds.includes(question.question_id) &&
        pending[question.question_id],
    );

    if (targets.length === 0) {
      if (navigateOnSuccess) {
        router.push(`/interview/${sessionId}/report`);
      }

      return;
    }

    // 批量期间不再上传/录制，pending 快照用于回填 video_available。
    const pendingSnapshot = pending;
    const failures: BatchState['failed'] = [];

    setActionError(null);
    setBatch({
      running: true,
      total: targets.length,
      current: 0,
      currentQuestionId: null,
      failed: [],
    });

    for (const [index, question] of targets.entries()) {
      setBatch((previous) => ({
        ...previous,
        current: index + 1,
        currentQuestionId: question.question_id,
      }));

      try {
        const evalResponse = await fetch('/api/interview/eval', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // 不传 video_url：服务端按会话+题目读取上传时持久化的 file_id。
          body: JSON.stringify({
            session_id: sessionId,
            question_id: question.question_id,
          }),
        });

        if (evalResponse.status === 401) {
          setActionError('登录状态已失效，正在跳转登录页…');
          window.location.assign('/login');
          return;
        }

        const evalPayload = (await evalResponse
          .json()
          .catch(() => null)) as
          | { success?: boolean; error?: string; data?: EvalResult }
          | null;

        if (!evalResponse.ok || !evalPayload?.data) {
          throw new Error(
            evalPayload?.error ??
              `评估失败（HTTP ${evalResponse.status}）`,
          );
        }

        setResults((previous) => ({
          ...previous,
          [question.question_id]: {
            ...(evalPayload.data as EvalResult),
            video_available:
              pendingSnapshot[question.question_id]?.video_available !==
              false,
          },
        }));
        setPending((previous) => {
          const next = { ...previous };
          delete next[question.question_id];
          return next;
        });
      } catch (error) {
        failures.push({
          questionId: question.question_id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    setBatch({
      running: false,
      total: targets.length,
      current: targets.length,
      currentQuestionId: null,
      failed: failures,
    });

    // 全部成功才自动进报告；有失败时留在本页展示汇总与单题重试入口。
    if (navigateOnSuccess && failures.length === 0) {
      router.push(`/interview/${sessionId}/report`);
    }
  }

  // 提交全部待评估题：按题目顺序逐题评估，全部成功后进入报告。
  function submitAll() {
    const questionIds = questions
      .filter((question) => pending[question.question_id])
      .map((question) => question.question_id);

    void evaluateQuestions(questionIds, true);
  }

  // 单题重试：只重新评估失败的那一题，成功后留在当前页，由用户自行查看报告。
  function retryOne(questionId: string) {
    void evaluateQuestions([questionId], false);
  }

  // 切题只重置当前交互状态，保留各题已缓存的视频与评分。
  function goToQuestion(index: number) {
    setActionError(null);
    setStage('idle');
    setCurrentIndex(index);
  }

  const busy =
    stage === 'uploading' || stage === 'recording' || batch.running;

  const isLastQuestion = currentIndex === questions.length - 1;

  // 「全部已评估」以 results + pending 为准：results 由会话接口的 answers
  // 初始化并在统一评估成功后即时写入；pending 表示仍有已录制未评估的题。
  // 只用初始 status 会在本次页面内刚提交的题目上滞后（页面不重新拉取会话）。
  const pendingCount = questions.filter(
    (question) => pending[question.question_id],
  ).length;
  const notRecordedCount = questions.filter(
    (question) =>
      !results[question.question_id] && !pending[question.question_id],
  ).length;
  const allEvaluated =
    questions.length > 0 &&
    questions.every(
      (question) =>
        results[question.question_id] &&
        !pending[question.question_id],
    );

  if (isLoading) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <div className="flex flex-col items-center gap-4 rounded-card bg-surface p-6 text-center shadow-card">
          <WaitingIllustration
            className="h-32 w-auto shrink-0"
            label="正在加载面试题"
          />
          <p className="flex items-center gap-2 text-sm text-ink-soft">
            <span aria-hidden="true">⏳</span>
            正在加载面试题…
          </p>
          <div aria-hidden="true" className="w-full max-w-xs space-y-2">
            <Skeleton className="h-3 w-full rounded-pill bg-sand motion-reduce:animate-none" />
            <Skeleton className="h-3 w-4/5 rounded-pill bg-sand motion-reduce:animate-none" />
          </div>
        </div>
      </main>
    );
  }

  if (effectiveLoadError) {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-3 p-6">
        <h1 className="text-xl font-bold text-ink">无法加载面试</h1>
        <p className="rounded-control bg-blush-50 px-4 py-3 text-sm text-blush-700 shadow-soft">
          {effectiveLoadError}
        </p>
      </main>
    );
  }

  if (!currentQuestion) {
    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <div className="flex flex-col items-center gap-3 rounded-card bg-surface p-6 text-center shadow-card">
          <WaitingIllustration
            className="h-28 w-auto shrink-0"
            label="该会话暂无题目"
          />
          <p className="flex items-center gap-2 text-sm text-ink-soft">
            <span aria-hidden="true">🪴</span>
            该会话暂无题目。
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 p-6 pb-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
            <span aria-hidden="true">🎙️</span>
            模拟面试
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            会话状态：{status || '未知'}
          </p>
        </div>
        <p className="text-sm text-ink-soft">
          第 {currentIndex + 1} / {questions.length} 题
        </p>
      </header>

      <section className="space-y-3 rounded-card bg-surface p-5 shadow-card">
        <div className="flex items-center gap-2">
          <span className="rounded-pill bg-blush-100 px-3 py-1 text-xs font-semibold text-blush-700">
            第 {currentIndex + 1} 题
          </span>
          <span className="rounded-pill bg-peach-50 px-3 py-1 text-xs font-medium text-peach-700">
            难度：{currentQuestion.difficulty}
          </span>
          {isCurrentEvaluating ? (
            <span className="rounded-pill bg-peach-200 px-3 py-1 text-xs font-semibold text-peach-700">
              评估中
            </span>
          ) : isCurrentPending ? (
            <span className="rounded-pill bg-peach-100 px-3 py-1 text-xs font-semibold text-peach-700">
              已录制待评估
            </span>
          ) : currentResult ? (
            <span className="rounded-pill bg-mint-100 px-3 py-1 text-xs font-semibold text-mint-700">
              已评估
            </span>
          ) : (
            <span className="rounded-pill bg-sand px-3 py-1 text-xs font-medium text-ink-soft">
              未录制
            </span>
          )}
        </div>

        <p className="text-base leading-7 text-ink">{currentQuestion.question_text}</p>
      </section>

      <section className="space-y-3 rounded-card bg-surface p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ink">录制回答</h2>
          {currentRecording && (
            <p className="text-xs text-ink-soft">
              已录制{' '}
              {(currentRecording.blob.size / (1024 * 1024)).toFixed(2)} MB
            </p>
          )}
        </div>

        <VideoRecorder
          key={currentQuestion.question_id}
          disabled={stage === 'uploading' || batch.running}
          playbackSrc={videoSrc}
          onRecorded={handleRecorded}
          onRecordingChange={handleRecordingChange}
        />

        {stage === 'recording' && (
          <p className="text-sm font-medium text-blush-700">
            ● 正在录制…点击「答题结束」将只上传视频，不立即评估
          </p>
        )}

        {stage === 'uploading' && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-control bg-peach-50 px-4 py-3 text-sm text-peach-700 shadow-soft"
          >
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-peach-600 border-t-transparent" />
            <span>正在上传视频（仅上传，不评估），完成后可直接进入下一题…</span>
          </div>
        )}

        {isCurrentPending && !batch.running && (
          <p
            role="status"
            className="rounded-control bg-peach-50 px-4 py-3 text-sm text-peach-700 shadow-soft"
          >
            已录制待评估：视频已保存，可回看或重录；全部录完后在最后一题点「提交并统一评估」。
          </p>
        )}

        {batch.running && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-control bg-peach-50 px-4 py-3 text-sm text-peach-700 shadow-soft"
          >
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-peach-600 border-t-transparent" />
            <span>
              正在统一评估：第 {batch.current} / {batch.total} 题…
              请勿翻页、重录或关闭页面
            </span>
          </div>
        )}

        {!batch.running && batch.failed.length > 0 && (
          <div
            role="alert"
            className="space-y-2 rounded-control bg-blush-50 px-4 py-3 text-sm text-blush-700 shadow-soft"
          >
            <p>
              有 {batch.failed.length} 道题评估失败（其余题已完成）：
            </p>
            <ul className="list-disc space-y-1 pl-5">
              {batch.failed.map((failure) => {
                const questionIndex = questions.findIndex(
                  (question) =>
                    question.question_id === failure.questionId,
                );

                return (
                  <li
                    key={failure.questionId}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <span>
                      第 {questionIndex + 1} 题：{failure.message}
                    </span>
                    <button
                      type="button"
                      onClick={() => retryOne(failure.questionId)}
                      className="underline underline-offset-2"
                    >
                      单题重试
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-blush-600">
              失败题仍保留在「已录制待评估」，可重试，不会重新上传视频。
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void submitAll()}
                className="rounded-pill border border-blush-200 bg-surface px-3 py-1.5 font-semibold text-blush-700 shadow-soft transition-colors hover:bg-blush-50"
              >
                重试失败题目
              </button>
              <button
                type="button"
                onClick={() =>
                  router.push(`/interview/${sessionId}/report`)
                }
                className="rounded-pill border border-blush-100 bg-surface px-3 py-1.5 font-medium text-ink shadow-soft transition-colors hover:bg-sand"
              >
                查看报告
              </button>
            </div>
          </div>
        )}

        {stage === 'error' && actionError && (
          <div className="space-y-2 rounded-control bg-blush-50 px-4 py-3 text-sm text-blush-700 shadow-soft">
            <p>{actionError}</p>
            {currentRecording && (
              <button
                type="button"
                onClick={retryUpload}
                className="rounded-pill border border-blush-200 bg-surface px-3 py-1.5 font-semibold text-blush-700 shadow-soft transition-colors hover:bg-blush-50"
              >
                重新上传这段视频
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => goToQuestion(currentIndex - 1)}
            disabled={currentIndex === 0 || busy}
            className="rounded-control border border-sand-100 bg-surface px-4 py-2 font-medium text-ink shadow-soft transition-colors hover:bg-sand disabled:cursor-not-allowed disabled:opacity-60"
          >
            上一题
          </button>

          {isLastQuestion ? (
            <button
              type="button"
              // 未全部录制也可点：只评估已录制的题，未录制题在报告中标记未作答。
              // 全部已评估时该按钮退化为「查看报告」。
              onClick={() => {
                if (allEvaluated) {
                  router.push(`/interview/${sessionId}/report`);
                  return;
                }

                void submitAll();
              }}
              disabled={busy}
              className={
                allEvaluated
                  ? 'rounded-control bg-mint px-5 py-2 font-semibold text-ink shadow-float transition-colors hover:bg-mint-200 disabled:cursor-not-allowed disabled:opacity-60'
                  : 'rounded-control bg-blush px-5 py-2 font-semibold text-ink shadow-float transition-colors hover:bg-blush-200 disabled:cursor-not-allowed disabled:opacity-60'
              }
            >
              {allEvaluated ? '查看报告' : '提交并统一评估'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => goToQuestion(currentIndex + 1)}
              disabled={busy}
              className="rounded-control bg-mint px-5 py-2 font-semibold text-ink shadow-float transition-colors hover:bg-mint-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              下一题
            </button>
          )}
        </div>

        {isLastQuestion && !batch.running && (
          <div className="space-y-1">
            {pendingCount > 0 && (
              <p role="status" className="text-sm font-medium text-peach-700">
                还有 {pendingCount} 题已录制待评估，提交后按题目顺序逐题评估
              </p>
            )}
            {notRecordedCount > 0 && (
              <p role="status" className="text-sm font-medium text-peach-700">
                还有 {notRecordedCount} 题未录制，提交后这些题将在报告中标记为未作答
              </p>
            )}
          </div>
        )}
      </section>

      {currentResult && (
        <section className="space-y-3 rounded-card bg-mint-50 p-5 shadow-card">
          <div className="flex items-baseline gap-2">
            <h2 className="text-lg font-bold text-ink">评估结果</h2>
            <span className="text-3xl font-bold text-mint-700">
              {currentResult.score}
            </span>
            <span className="text-sm text-ink-soft">分</span>
            {currentResult.is_fallback && (
              <span className="rounded-pill bg-blush-100 px-3 py-1 text-xs font-semibold text-blush-700">
                兜底评分
              </span>
            )}
          </div>

          {currentResult.dimension_scores && (
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div className="rounded-control bg-surface p-3 shadow-soft">
                <p className="text-ink-soft">表达清晰度</p>
                <p className="mt-1 text-lg font-semibold text-ink">
                  {currentResult.dimension_scores.clarity}
                </p>
              </div>
              <div className="rounded-control bg-surface p-3 shadow-soft">
                <p className="text-ink-soft">技术深度</p>
                <p className="mt-1 text-lg font-semibold text-ink">
                  {currentResult.dimension_scores.depth}
                </p>
              </div>
              <div className="rounded-control bg-surface p-3 shadow-soft">
                <p className="text-ink-soft">岗位相关性</p>
                <p className="mt-1 text-lg font-semibold text-ink">
                  {currentResult.dimension_scores.relevance}
                </p>
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-ink">评语</h3>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink">
              {currentResult.comment}
            </p>
          </div>

          {!!currentResult.covered_points?.length && (
            <div>
              <h3 className="text-sm font-semibold text-ink">已覆盖要点</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                {currentResult.covered_points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          )}

          {!!currentResult.missed_points?.length && (
            <div>
              <h3 className="text-sm font-semibold text-ink">遗漏要点</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-peach-700">
                {currentResult.missed_points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

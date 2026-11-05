import Link from 'next/link';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';

import { RunningRabbit } from '@/components/illustrations/running-rabbit';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { AUTH_COOKIE_NAME, verifySessionToken } from '@/lib/auth';
import { buildReport } from '@/lib/report';
import {
  getAnswersBySessionId,
  getSession,
  listPendingAnswersBySession,
  listQuestionsBySession,
} from '@/lib/storage';
import { pendingVideoUrl } from '@/lib/types';

interface PageProps {
  params: Promise<{ sessionId: string }>;
}

/**
 * 该页必须在流式输出开始前完成鉴权与数据读取，才能让未登录/越权/不存在
 * 返回真实的 404，而不是先输出 200 外壳再渲染 not-found UI。
 * 按 Next 16 文档，在 cacheComponents 下用 instant = false 允许阻塞路由。
 */
export const instant = false;

/** null（全部 fallback 或未作答）统一显示为破折号，避免渲染 null / NaN。 */
function formatAverage(value: number | null): string {
  return value === null ? '—' : `${value}`;
}

export default async function InterviewReportPage({ params }: PageProps) {
  // 读 Cookie 属于请求期数据；cacheComponents 下先等待真实请求再读取，
  // 使页面在请求时完整渲染，notFound() 也能在流式开始前返回真实状态码。
  await connection();

  const { sessionId } = await params;

  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    notFound();
  }

  const token = (await cookies()).get(AUTH_COOKIE_NAME)?.value;

  if (!token) {
    notFound();
  }

  let tokenUserId: string;

  try {
    const payload = await verifySessionToken(token, secret);
    tokenUserId = payload.sub;
  } catch {
    // 签名无效、过期或字段缺失统一按不存在处理，不暴露具体原因。
    notFound();
  }

  const session = await getSession(sessionId);

  // 会话不存在与不属于当前用户统一 404，避免泄露会话是否存在。
  if (!session || session.user_id !== tokenUserId) {
    notFound();
  }

  const questions = await listQuestionsBySession(sessionId);

  if (questions.length === 0) {
    notFound();
  }

  const answers = await getAnswersBySessionId(sessionId);
  const pendingAnswers = await listPendingAnswersBySession(sessionId);

  // 与作答页一致的待评估判定：同一份录制已评估过则不再视为待评估，
  // 避免清理失败时把已评估题显示成「未评估」。
  const answeredByQuestionId = new Map(
    answers.map((answer) => [answer.question_id, answer]),
  );
  const pendingQuestionIds = new Set(
    pendingAnswers
      .filter((pending) => {
        const answer = answeredByQuestionId.get(pending.question_id);
        return !(answer && answer.video_url === pendingVideoUrl(pending));
      })
      .map((pending) => pending.question_id),
  );

  const report = buildReport(
    sessionId,
    questions,
    answers,
    pendingQuestionIds,
  );

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 p-6 pb-10">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
            <span aria-hidden="true">🧸</span>
            面试报告
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            会话 ID：{sessionId}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/interview/new?from=${encodeURIComponent(sessionId)}`}
            className="rounded-pill bg-mint px-4 py-2 text-sm font-semibold text-ink shadow-soft transition-colors hover:bg-mint-200"
          >
            重新面试
          </Link>
          <Link
            href={`/interview/${sessionId}`}
            className="rounded-pill border border-blush-100 bg-surface px-4 py-2 text-sm font-medium text-ink shadow-soft transition-colors hover:bg-blush-50"
          >
            返回答题页
          </Link>
        </div>
      </header>

      <Card className="overflow-hidden rounded-card bg-surface py-0 shadow-card ring-0">
        <div className="flex flex-col gap-5 bg-[linear-gradient(135deg,var(--color-blush-50)_0%,var(--color-cream)_45%,var(--color-mint-50)_100%)] p-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-ink-soft">总分</p>
            <p className="mt-1 text-5xl font-bold leading-none text-ink">
              {formatAverage(report.total_score)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ScorePill
              label="表达清晰度"
              value={formatAverage(report.dimension_averages.clarity)}
            />
            <ScorePill
              label="技术深度"
              value={formatAverage(report.dimension_averages.depth)}
            />
            <ScorePill
              label="岗位相关性"
              value={formatAverage(report.dimension_averages.relevance)}
            />
          </div>
        </div>
      </Card>

      <section className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-card bg-sand px-4 py-3 text-sm text-ink-soft shadow-soft">
        <span>
          已评估：{report.evaluated_questions} / {report.total_questions}
        </span>
        <span>待评估：{report.pending_questions}</span>
        <span>
          未作答：
          {report.total_questions -
            report.evaluated_questions -
            report.pending_questions}
        </span>
        <span>异常题目：{report.fallback_count}</span>
        <span className="text-xs text-ink-soft">
          总分与维度均分不含兜底评分题与待评估题；全为兜底、待评估或无作答时显示「—」
        </span>
      </section>

      {report.fallback_count > 0 && (
        <Alert className="gap-1 rounded-card border-0 bg-peach-50 px-4 py-3 text-sm text-peach-700 shadow-soft">
          <p className="font-medium">
            共 {report.fallback_count} 道题使用兜底评分，成绩仅供参考
          </p>
          <p className="text-xs text-peach-700/80">
            涉及题目：{report.fallback_question_ids.join('、')}
          </p>
        </Alert>
      )}

      {report.evaluated_questions === 0 && (
        <Card className="rounded-card bg-surface py-0 shadow-card ring-0">
          <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
            <RunningRabbit className="h-28 w-auto shrink-0" />
            <p className="text-sm font-semibold text-ink">
              正在评估中，请等待……
            </p>
            <p className="max-w-sm text-xs leading-5 text-ink-soft">
              逐题明细会标注「未评估」或「未作答」，完成统一评估后这里会展示得分与评语。
            </p>
          </div>
        </Card>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">逐题明细</h2>

        {report.items.map((item, index) => (
          <article
            key={item.question_id}
            className={
              item.is_fallback
                ? 'space-y-3 rounded-card bg-blush-50 p-4 shadow-card'
                : 'space-y-3 rounded-card bg-surface p-4 shadow-card'
            }
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="secondary"
                    className="h-auto rounded-pill bg-blush-100 px-3 py-1 text-xs font-semibold text-blush-700"
                  >
                    第 {index + 1} 题
                  </Badge>
                  {item.is_fallback && (
                    <Badge
                      variant="secondary"
                      className="h-auto rounded-pill bg-peach-50 px-3 py-1 text-xs font-semibold text-peach-700"
                    >
                      兜底评分
                    </Badge>
                  )}
                  {item.evaluation_pending && (
                    <Badge
                      variant="secondary"
                      className="h-auto rounded-pill bg-peach-100 px-3 py-1 text-xs font-semibold text-peach-700"
                    >
                      未评估
                    </Badge>
                  )}
                  {!item.answered && !item.evaluation_pending && (
                    <Badge
                      variant="secondary"
                      className="h-auto rounded-pill bg-sand px-3 py-1 text-xs font-medium text-ink-soft"
                    >
                      未作答
                    </Badge>
                  )}
                </div>
                <p className="text-sm leading-6 text-ink">{item.question_text}</p>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-2xl font-bold text-ink">
                  {formatAverage(item.score)}
                </p>
                <p className="text-xs text-ink-soft">
                  {item.evaluation_pending ? '未评估' : '得分'}
                </p>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <PointList
                title="已覆盖要点"
                points={item.covered_points}
                emptyText={
                  item.evaluation_pending ? '待评估后生成' : '暂无命中要点'
                }
                tone="covered"
              />
              <PointList
                title="遗漏要点"
                points={item.missed_points}
                emptyText={
                  item.evaluation_pending ? '待评估后生成' : '暂无遗漏要点'
                }
                tone="missed"
              />
            </div>

            <div>
              <h3 className="text-xs font-semibold text-ink-soft">评语</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink">
                {item.comment ??
                  (item.evaluation_pending ? '待评估' : '—')}
              </p>
            </div>
          </article>
        ))}
      </section>

      <footer className="pt-2">
        <Link
          href={`/interview/${sessionId}`}
          className="text-sm font-medium text-ink underline decoration-blush decoration-2 underline-offset-4"
        >
          返回答题页继续面试
        </Link>
      </footer>
    </main>
  );
}

function ScorePill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-pill border border-blush-100 bg-surface/90 px-3 py-1.5 text-xs shadow-soft">
      <span className="text-ink-soft">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </span>
  );
}

function PointList({
  title,
  points,
  emptyText,
  tone,
}: {
  title: string;
  points: string[];
  emptyText: string;
  tone: 'covered' | 'missed';
}) {
  return (
    <div
      className={
        tone === 'covered'
          ? 'rounded-control bg-mint-50 p-3'
          : 'rounded-control bg-peach-50 p-3'
      }
    >
      <h3 className="text-xs font-semibold text-ink-soft">{title}</h3>
      {points.length > 0 ? (
        <ul className="mt-1 list-disc space-y-1 pl-4 text-sm">
          {points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-sm text-ink-soft">{emptyText}</p>
      )}
    </div>
  );
}

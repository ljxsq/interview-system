'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { WaitingIllustration } from '@/components/illustrations/waiting-illustration';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type ExtractKind = 'resume' | 'jd';
type Phase = 'idle' | 'extracting' | 'generating';

interface ExtractResult {
  text: string;
  truncated: boolean;
  original_length: number;
}

const MAX_TEXT_LENGTH = 5000;

// 未提交草稿的本地键；仅存用户输入，不含会话或身份信息。
const DRAFT_RESUME_KEY = 'interview.new.resumeDraft';
const DRAFT_JD_KEY = 'interview.new.jdDraft';

function truncateNotice(result: ExtractResult): string | null {
  return result.truncated
    ? `原文 ${result.original_length} 字，已截断保留前 ${MAX_TEXT_LENGTH} 字，可自行删减后生成`
    : null;
}

const RESUME_ACCEPT =
  '.pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown';
const JD_ACCEPT = '.png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp';

export default function NewInterviewPage() {
  const router = useRouter();
  const [resumeText, setResumeText] = useState('');
  const [jdText, setJdText] = useState('');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [jdFile, setJdFile] = useState<File | null>(null);
  // 两侧各自维护识别状态，互不影响对方的输入与选择。
  const [resumeExtracting, setResumeExtracting] = useState(false);
  const [jdExtracting, setJdExtracting] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [jdError, setJdError] = useState<string | null>(null);
  const [resumeNotice, setResumeNotice] = useState<string | null>(null);
  const [jdNotice, setJdNotice] = useState<string | null>(null);
  const [resumeOverwritten, setResumeOverwritten] = useState(false);
  const [jdOverwritten, setJdOverwritten] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [prefillError, setPrefillError] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(true);
  // 带 from 预填时只读取会话内容，不把会话文本写回本地草稿，
  // 以免覆盖用户此前未提交的草稿。
  const prefillFromRef = useRef(false);
  // 隐藏的原生 file input 由自定义按钮触发，选完即识别。
  const resumeInputRef = useRef<HTMLInputElement>(null);
  const jdInputRef = useRef<HTMLInputElement>(null);

  const anyExtracting = resumeExtracting || jdExtracting;
  // busy 只用于提交互斥（含提交前的补提取），不再用于两侧控件禁用。
  const busy = loading || anyExtracting || phase === 'extracting';
  const resumeBusy = loading || resumeExtracting || phase === 'extracting';
  const jdBusy = loading || jdExtracting || phase === 'extracting';

  useEffect(() => {
    if (!loading) {
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [loading]);

  // 首次进入：有 from 时读取该会话的简历/JD，否则恢复本地草稿。
  // 两者都存在时以会话内容为准，保证「重新面试」看到的是原会话文本。
  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const from = new URLSearchParams(window.location.search).get('from');

      try {
        if (from) {
          prefillFromRef.current = true;

          const response = await fetch(
            `/api/interview/${encodeURIComponent(from)}`,
          );

          if (response.status === 401) {
            if (!cancelled) {
              redirectToLogin();
            }
            return;
          }

          const payload = (await response.json().catch(() => null)) as
            | { resume_text?: string; jd_text?: string; error?: string }
            | null;

          if (!response.ok) {
            throw new Error(
              payload?.error ?? `无法加载会话内容（HTTP ${response.status}）`,
            );
          }

          if (!cancelled) {
            setResumeText(payload?.resume_text ?? '');
            setJdText(payload?.jd_text ?? '');
          }
          return;
        }

        let resumeDraft = '';
        let jdDraft = '';

        try {
          resumeDraft = window.localStorage.getItem(DRAFT_RESUME_KEY) ?? '';
          jdDraft = window.localStorage.getItem(DRAFT_JD_KEY) ?? '';
        } catch {
          // localStorage 不可用（隐私模式/配额）时按空草稿处理。
        }

        if (!cancelled) {
          setResumeText(resumeDraft);
          setJdText(jdDraft);
        }
      } catch (hydrateError) {
        if (!cancelled) {
          setPrefillError(
            hydrateError instanceof Error
              ? hydrateError.message
              : String(hydrateError),
          );
        }
      } finally {
        if (!cancelled) {
          setHydrating(false);
        }
      }
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  // 输入即存草稿；水合完成前（hydrating=true）不写，避免首屏空值覆盖已有草稿。
  // 带 from 的预填页不写草稿，保证不覆盖用户原有的未提交内容。
  useEffect(() => {
    if (hydrating || prefillFromRef.current) {
      return;
    }

    try {
      window.localStorage.setItem(DRAFT_RESUME_KEY, resumeText);
      window.localStorage.setItem(DRAFT_JD_KEY, jdText);
    } catch {
      // localStorage 不可用时静默跳过，不影响正常生成流程。
    }
  }, [resumeText, jdText, hydrating]);

  /** 登录失效统一跳转登录页（与答题页保持一致的强制跳转行为）。 */
  function redirectToLogin() {
    setError('登录状态已失效，正在跳转登录页…');
    window.location.assign('/login');
  }

  /** 调用提取接口；401 沿用既有跳登录逻辑并返回 null。 */
  async function requestExtract(
    kind: ExtractKind,
    file: File,
  ): Promise<ExtractResult | null> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('kind', kind);

    const response = await fetch('/api/interview/extract', {
      method: 'POST',
      body: formData,
    });

    if (response.status === 401) {
      redirectToLogin();
      return null;
    }

    const payload = (await response.json().catch(() => null)) as
      | {
          success?: boolean;
          text?: string;
          truncated?: boolean;
          original_length?: number;
          error?: string;
        }
      | null;

    if (
      !response.ok ||
      typeof payload?.text !== 'string' ||
      payload.text.length === 0
    ) {
      throw new Error(
        payload?.error ?? `提取文案失败（HTTP ${response.status}）`,
      );
    }

    return {
      text: payload.text,
      truncated: payload.truncated === true,
      original_length:
        typeof payload.original_length === 'number'
          ? payload.original_length
          : Array.from(payload.text).length,
    };
  }

  /**
   * 选中文件后立即识别并回填。
   * 失败时保留已选文件与 textarea 现有内容；成功时直接覆盖并给出轻提示。
   */
  async function handleFileSelected(kind: ExtractKind, file: File) {
    const previousText = kind === 'resume' ? resumeText : jdText;

    setError(null);

    if (kind === 'resume') {
      setResumeFile(file);
      setResumeError(null);
      setResumeNotice(null);
      setResumeOverwritten(false);
    } else {
      setJdFile(file);
      setJdError(null);
      setJdNotice(null);
      setJdOverwritten(false);
    }

    if (kind === 'resume') {
      setResumeExtracting(true);
    } else {
      setJdExtracting(true);
    }

    try {
      const result = await requestExtract(kind, file);

      if (result === null) {
        return;
      }

      if (kind === 'resume') {
        setResumeText(result.text);
        setResumeNotice(truncateNotice(result));
        setResumeOverwritten(previousText.trim() !== '');
      } else {
        setJdText(result.text);
        setJdNotice(truncateNotice(result));
        setJdOverwritten(previousText.trim() !== '');
      }
    } catch (extractError) {
      // 网络层失败（fetch 抛 TypeError）转成可读文案；服务端 4xx/5xx 已带可读原因。
      const message =
        extractError instanceof TypeError
          ? '网络异常，未能完成识别，请检查网络后重试'
          : extractError instanceof Error
            ? extractError.message
            : String(extractError);

      if (kind === 'resume') {
        setResumeError(message);
      } else {
        setJdError(message);
      }
    } finally {
      if (kind === 'resume') {
        setResumeExtracting(false);
      } else {
        setJdExtracting(false);
      }
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (busy) {
      return;
    }

    setError(null);
    setResumeError(null);
    setJdError(null);

    let resume = resumeText;
    let jd = jdText;

    try {
      // 只选了文件却没提取时，提交前先自动提取，避免提交空文本。
      if (resume.trim() === '' && resumeFile) {
        setPhase('extracting');
        const extracted = await requestExtract('resume', resumeFile);

        if (extracted === null) {
          return;
        }

        resume = extracted.text;
        setResumeText(extracted.text);
        setResumeNotice(truncateNotice(extracted));
      }

      if (jd.trim() === '' && jdFile) {
        setPhase('extracting');
        const extracted = await requestExtract('jd', jdFile);

        if (extracted === null) {
          return;
        }

        jd = extracted.text;
        setJdText(extracted.text);
        setJdNotice(truncateNotice(extracted));
      }

      if (resume.trim() === '') {
        throw new Error('请填写简历文本，或上传简历文件后提取');
      }

      if (jd.trim() === '') {
        throw new Error('请填写岗位描述文本，或上传 JD 截图后提取');
      }

      setPhase('generating');
      setLoading(true);
      setElapsed(0);

      const response = await fetch('/api/interview/prep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume_text: resume,
          jd_text: jd,
        }),
      });

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; error?: string; session_id?: string }
        | null;

      if (!response.ok || !payload?.session_id) {
        throw new Error(
          payload?.error ?? `生成面试题失败（HTTP ${response.status}）`,
        );
      }

      try {
        window.localStorage.removeItem(DRAFT_RESUME_KEY);
        window.localStorage.removeItem(DRAFT_JD_KEY);
      } catch {
        // 草稿清理失败不影响进入下一环节。
      }

      router.push(`/interview/${payload.session_id}`);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : String(submitError),
      );
    } finally {
      setResumeExtracting(false);
      setJdExtracting(false);
      setLoading(false);
      setPhase('idle');
    }
  }

  function handleFileChange(
    kind: ExtractKind,
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const input = event.currentTarget;
    const file = input.files?.[0] ?? null;

    // 立刻清空 value：再次选择同名文件时 onChange 仍会触发。
    input.value = '';

    if (!file || (kind === 'resume' ? resumeBusy : jdBusy)) {
      return;
    }

    void handleFileSelected(kind, file);
  }

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold text-ink">面试准备-生成面试题</h1>
        <p className="mt-1 text-sm text-ink-soft">
          填写或上传简历与岗位描述，AI 将根据两者生成面试题（通常需要 40–60 秒）。
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">
        {prefillError && (
          <p className="rounded-control bg-blush-50 px-4 py-3 text-sm text-blush-700 shadow-soft">
            {prefillError}
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="resume-text" className="text-sm font-semibold text-ink">
            简历
          </Label>
          <Textarea
            id="resume-text"
            value={resumeText}
            onChange={(event) => setResumeText(event.target.value)}
            disabled={resumeBusy}
            rows={7}
            maxLength={5000}
            className="min-h-40 rounded-control border-blush-100 bg-surface px-4 py-3 text-ink shadow-soft placeholder:text-ink-soft/70 focus-visible:border-blush-200 focus-visible:ring-0 disabled:bg-sand disabled:text-ink-soft disabled:opacity-100"
            placeholder="粘贴简历文本，或选择文件后自动识别"
          />
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={resumeInputRef}
              type="file"
              accept={RESUME_ACCEPT}
              disabled={resumeBusy}
              onChange={(event) => handleFileChange('resume', event)}
              className="hidden"
              tabIndex={-1}
            />
            <Button
              type="button"
              onClick={() => resumeInputRef.current?.click()}
              disabled={resumeBusy}
              aria-label="选择文件并识别"
              className="h-10 rounded-pill border border-mint-200 bg-mint-50 px-4 text-sm font-semibold text-mint-700 shadow-soft transition-colors hover:bg-mint-100 focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resumeExtracting ? '识别中…' : '选择文件并识别'}
            </Button>
            {resumeFile && (
              <span className="min-w-0 break-all text-xs text-ink-soft">
                已选择：{resumeFile.name}（
                {Math.ceil(resumeFile.size / 1024)} KB）
              </span>
            )}
            {resumeOverwritten && (
              <span className="text-xs font-medium text-mint-700">
                已由文件覆盖
              </span>
            )}
          </div>
          <p className="text-xs text-ink-soft">
            支持 PDF / DOCX / TXT / MD，单文件 ≤ 10 MB
          </p>
        </div>

        {resumeError && (
          <p className="rounded-control bg-blush-50 px-4 py-3 text-sm text-blush-700 shadow-soft">
            {resumeError}
          </p>
        )}

        {resumeNotice && (
          <p className="rounded-control bg-peach-50 px-4 py-3 text-sm text-peach-700 shadow-soft">
            {resumeNotice}
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="jd-text" className="text-sm font-semibold text-ink">
            岗位描述（JD）
          </Label>
          <Textarea
            id="jd-text"
            value={jdText}
            onChange={(event) => setJdText(event.target.value)}
            disabled={jdBusy}
            rows={7}
            maxLength={5000}
            className="min-h-40 rounded-control border-blush-100 bg-surface px-4 py-3 text-ink shadow-soft placeholder:text-ink-soft/70 focus-visible:border-blush-200 focus-visible:ring-0 disabled:bg-sand disabled:text-ink-soft disabled:opacity-100"
            placeholder="粘贴岗位描述文本，或上传截图后自动识别"
          />
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={jdInputRef}
              type="file"
              accept={JD_ACCEPT}
              disabled={jdBusy}
              onChange={(event) => handleFileChange('jd', event)}
              className="hidden"
              tabIndex={-1}
            />
            <Button
              type="button"
              onClick={() => jdInputRef.current?.click()}
              disabled={jdBusy}
              aria-label="上传图片并识别"
              className="h-10 rounded-pill border border-mint-200 bg-mint-50 px-4 text-sm font-semibold text-mint-700 shadow-soft transition-colors hover:bg-mint-100 focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {jdExtracting ? '识别中…' : '上传图片并识别'}
            </Button>
            {jdFile && (
              <span className="min-w-0 break-all text-xs text-ink-soft">
                已选择：{jdFile.name}（{Math.ceil(jdFile.size / 1024)} KB）
              </span>
            )}
            {jdOverwritten && (
              <span className="text-xs font-medium text-mint-700">
                已由文件覆盖
              </span>
            )}
          </div>
          <p className="text-xs text-ink-soft">
            支持 PNG / JPG / JPEG / WEBP，单文件 ≤ 10 MB
          </p>
        </div>

        {jdError && (
          <p className="rounded-control bg-blush-50 px-4 py-3 text-sm text-blush-700 shadow-soft">
            {jdError}
          </p>
        )}

        {jdNotice && (
          <p className="rounded-control bg-peach-50 px-4 py-3 text-sm text-peach-700 shadow-soft">
            {jdNotice}
          </p>
        )}

        {error && (
          <p className="rounded-control bg-blush-50 px-4 py-3 text-sm text-blush-700 shadow-soft">
            {error}
          </p>
        )}

        {phase === 'extracting' && (
          <div className="rounded-control bg-mint-50 px-4 py-3 text-sm text-mint-700 shadow-soft">
            正在提取文案，请稍候…
          </div>
        )}

        {loading && (
          <div className="flex items-center gap-3 rounded-control bg-peach-50 px-4 py-3 text-sm text-peach-700 shadow-soft">
            <WaitingIllustration
              className="h-16 w-auto shrink-0"
              label="正在生成面试题"
            />
            <div>
              <p className="font-semibold">正在生成面试题，请勿关闭页面…</p>
              <p className="mt-1">已等待 {elapsed} 秒，预计 40–60 秒。</p>
            </div>
          </div>
        )}

        <Button
          type="submit"
          disabled={
            busy ||
            hydrating ||
            (!resumeText.trim() && !resumeFile) ||
            (!jdText.trim() && !jdFile)
          }
          title={
            anyExtracting ? '文件识别中，请等待识别完成后再生成' : undefined
          }
          className="h-11 w-full rounded-control bg-blush px-6 text-base font-semibold text-ink shadow-float transition-colors hover:bg-blush-200 focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {loading ? '生成中…' : '生成面试题'}
        </Button>
      </form>
    </main>
  );
}

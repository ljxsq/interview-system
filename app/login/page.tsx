'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { WelcomeRabbit } from '@/components/illustrations/welcome-rabbit';

type Mode = 'login' | 'register';

// 与 app/api/auth/register/route.ts 保持一致，避免前端放行后端必然拒绝的输入。
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 72;

const MODE_COPY: Record<Mode, { title: string; subtitle: string; submit: string; pending: string }> = {
  login: {
    title: '登录',
    subtitle: '登录后即可进入 AI 模拟面试。',
    submit: '登录',
    pending: '登录中…',
  },
  register: {
    title: '注册',
    subtitle: '创建账号后返回登录，不会自动登录。',
    submit: '注册',
    pending: '注册中…',
  },
};

const FEATURES = [
  {
    icon: '📄',
    tone: 'blush',
    title: '简历与岗位驱动出题',
    description: '粘贴或上传简历与 JD（PDF/DOCX/截图），Coze 生成针对性题目。',
  },
  {
    icon: '🎬',
    tone: 'mint',
    title: '逐题视频作答',
    description: '浏览器内录制，录完即传，可回看、可重录，统一评估。',
  },
  {
    icon: '📊',
    tone: 'peach',
    title: '多维评分与报告',
    description: '按清晰度、技术深度、岗位相关性评分，标注覆盖、遗漏与兜底。',
  },
] as const;

const FEATURE_TONE: Record<(typeof FEATURES)[number]['tone'], string> = {
  blush: 'bg-blush-100',
  mint: 'bg-mint-100',
  peach: 'bg-peach-100',
};

interface AuthResponse {
  success?: boolean;
  error?: string;
  user?: { id: string; email: string; created_at: string };
}

function validateRegister(email: string, password: string): string | null {
  if (email.trim() === '') {
    return '请输入邮箱';
  }

  if (!EMAIL_PATTERN.test(email.trim().toLowerCase())) {
    return '邮箱格式不正确';
  }

  if (password === '') {
    return '请输入密码';
  }

  if (
    password.length < PASSWORD_MIN_LENGTH ||
    password.length > PASSWORD_MAX_LENGTH
  ) {
    return `密码长度需为 ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} 位`;
  }

  return null;
}

export default function LoginPage() {
  const router = useRouter();
  const baseId = useId();
  const emailId = `${baseId}-email`;
  const passwordId = `${baseId}-password`;
  const passwordHintId = `${baseId}-password-hint`;
  const panelId = `${baseId}-panel`;

  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const copy = MODE_COPY[mode];

  function selectMode(next: Mode, focusTab = false) {
    if (next === mode) {
      return;
    }

    setMode(next);
    setError(null);
    setNotice(null);

    if (focusTab) {
      document.getElementById(`${baseId}-tab-${next}`)?.focus();
    }
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return;
    }

    event.preventDefault();
    selectMode(mode === 'login' ? 'register' : 'login', true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setError(null);
    setNotice(null);

    const normalizedEmail = email.trim();

    if (mode === 'register') {
      const validationError = validateRegister(normalizedEmail, password);

      if (validationError) {
        setError(validationError);
        return;
      }
    }

    setLoading(true);

    try {
      const response = await fetch(
        mode === 'register' ? '/api/auth/register' : '/api/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: normalizedEmail, password }),
        },
      );

      const payload = (await response.json().catch(() => null)) as
        | AuthResponse
        | null;

      if (!response.ok || !payload?.success) {
        // 原样展示后端文案（如 409「该邮箱已注册」），不吞错误。
        throw new Error(
          payload?.error ??
            `${mode === 'register' ? '注册' : '登录'}失败（HTTP ${response.status}）`,
        );
      }

      if (mode === 'register') {
        // 先注册再登录：切回登录模式并带入邮箱，不自动登录、不回填密码。
        setMode('login');
        setPassword('');
        setNotice('注册成功，请登录');
        return;
      }

      router.push('/interview/new');
    } catch (submitError) {
      setError(
        submitError instanceof TypeError
          ? '网络异常，无法连接服务器，请稍后重试'
          : submitError instanceof Error
            ? submitError.message
            : String(submitError),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 pt-6 pb-4 sm:px-6">
      <header className="flex items-center gap-4">
        <WelcomeRabbit className="h-[72px] w-[72px] shrink-0 sm:h-24 sm:w-24" />
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-ink sm:text-2xl">
            智能面试系统
          </h1>
          <p className="mt-1 text-xs text-ink-soft sm:text-sm">
            上传简历与岗位描述，录制视频作答，自动生成多维面试报告。
          </p>
        </div>
      </header>

      <ul aria-label="功能概览" className="grid gap-3 md:grid-cols-3">
        {FEATURES.map((feature) => (
          <li
            key={feature.title}
            className="rounded-card bg-surface p-3 shadow-soft ring-1 ring-blush-100"
          >
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className={`flex size-7 shrink-0 items-center justify-center rounded-full text-sm ${FEATURE_TONE[feature.tone]}`}
              >
                {feature.icon}
              </span>
              <p className="text-sm font-semibold text-ink">
                {feature.title}
              </p>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-ink-soft">
              {feature.description}
            </p>
          </li>
        ))}
      </ul>

      <Card className="mx-auto w-full max-w-lg gap-3 rounded-card bg-surface px-6 py-4 shadow-card ring-0 sm:px-7 lg:py-5">
        <CardHeader className="px-0">
          <div>
            <h2 className="text-xl font-bold text-ink">{copy.title}</h2>
            <p className="mt-0.5 text-sm text-ink-soft">{copy.subtitle}</p>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 px-0">
      <div
        role="tablist"
        aria-label="登录或注册"
        className="grid grid-cols-2 gap-1 rounded-pill bg-blush-50 p-1 shadow-soft"
      >
        {(['login', 'register'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`${baseId}-tab-${tab}`}
            aria-selected={mode === tab}
            aria-controls={panelId}
            tabIndex={mode === tab ? 0 : -1}
            onClick={() => selectMode(tab)}
            onKeyDown={handleTabKeyDown}
            className={`min-h-10 rounded-pill px-3 py-1.5 text-sm font-semibold transition-colors ${
              mode === tab
                ? 'bg-surface text-ink shadow-soft'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            {MODE_COPY[tab].title}
          </button>
        ))}
      </div>

      <form
        id={panelId}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${mode}`}
        onSubmit={handleSubmit}
        aria-busy={loading}
        noValidate={mode === 'register'}
        className="space-y-3"
      >
        <div className="space-y-1">
          <Label htmlFor={emailId} className="text-sm font-semibold text-ink">
            邮箱
          </Label>
          <Input
            id={emailId}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            className="h-10 rounded-control border-blush-100 bg-surface px-4 text-ink shadow-soft placeholder:text-ink-soft/70 focus-visible:border-blush-200 focus-visible:ring-0"
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor={passwordId} className="text-sm font-semibold text-ink">
            密码
          </Label>
          <Input
            id={passwordId}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete={
              mode === 'register' ? 'new-password' : 'current-password'
            }
            aria-describedby={mode === 'register' ? passwordHintId : undefined}
            className="h-10 rounded-control border-blush-100 bg-surface px-4 text-ink shadow-soft placeholder:text-ink-soft/70 focus-visible:border-blush-200 focus-visible:ring-0"
            placeholder="请输入密码"
          />
        </div>

        {mode === 'register' && (
          <p id={passwordHintId} className="text-xs text-ink-soft">
            密码长度需为 {PASSWORD_MIN_LENGTH}-{PASSWORD_MAX_LENGTH} 位。
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-control bg-blush-50 px-4 py-2.5 text-sm text-blush-700 shadow-soft"
          >
            {error}
          </p>
        )}

        {notice && (
          <p
            role="status"
            aria-live="polite"
            className="rounded-control bg-mint-50 px-4 py-2.5 text-sm text-mint-700 shadow-soft"
          >
            {notice}
          </p>
        )}

        <Button
          type="submit"
          disabled={loading}
          className="h-10 w-full rounded-control bg-blush px-4 text-base font-semibold text-ink shadow-float transition-colors hover:bg-blush-200 focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? copy.pending : copy.submit}
        </Button>
      </form>
        </CardContent>
      </Card>
    </main>
  );
}

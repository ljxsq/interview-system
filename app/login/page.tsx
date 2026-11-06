'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
    icon: 'scroll',
    title: '简历与岗位驱动出题',
    description: '粘贴或上传简历与 JD（PDF/DOCX/截图），Coze 生成针对性题目。',
  },
  {
    icon: 'lantern',
    title: '逐题视频作答',
    description: '浏览器内录制，录完即传，可回看、可重录，统一评估。',
  },
  {
    icon: 'slips',
    title: '多维评分与报告',
    description: '按清晰度、技术深度、岗位相关性评分，标注覆盖、遗漏与兜底。',
  },
] as const;

/** 古风线稿图标：卷轴 / 灯笼 / 竹简，替代原先的 emoji。 */
function FeatureIcon({ kind }: { kind: (typeof FEATURES)[number]['icon'] }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-4"
    >
      {kind === 'scroll' && (
        <>
          <rect x="7" y="5" width="10" height="14" rx="1" />
          <path d="M7 5c-2 0-2 3 0 3M17 5c2 0 2 3 0 3M7 19c-2 0-2-3 0-3M17 19c2 0 2-3 0-3" />
          <path d="M10 9h4M10 12h4M10 15h3" />
        </>
      )}
      {kind === 'lantern' && (
        <>
          <path d="M12 3v3" />
          <ellipse cx="12" cy="12" rx="6" ry="7" />
          <path d="M6 9h12M6 15h12" />
          <path d="M12 19v2" />
        </>
      )}
      {kind === 'slips' && (
        <>
          <path d="M8 4v16M12 4v16M16 4v16" />
          <path d="M6 8h12M6 16h12" />
        </>
      )}
    </svg>
  );
}

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
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-12 px-4 pt-10 pb-10 sm:px-6">
      <header className="flex items-center gap-4 border-b border-rule pb-6">
        <Image
          src="/login-portrait.png"
          alt=""
          width={474}
          height={629}
          priority
          className="login-portrait h-auto w-[72px] shrink-0 sm:w-24"
        />
        <div className="min-w-0">
          {/* 标题上方的极细横线，本页唯一的页头装饰 */}
          <div
            aria-hidden="true"
            className="mb-3 h-px w-14 bg-daiqing-600/40"
          />
          <h1 className="text-xl font-medium text-daiqing-700 sm:text-2xl">
            智能面试系统
          </h1>
          <p className="mt-2 text-xs text-ink-soft sm:text-sm">
            上传简历与岗位描述，录制视频作答，自动生成多维面试报告。
          </p>
        </div>
      </header>

      {/* 功能概览：一格一事，用淡墨细线分格 */}
      <ul
        aria-label="功能概览"
        className="panel grid divide-y divide-rule-soft overflow-hidden md:grid-cols-3 md:divide-x md:divide-y-0"
      >
        {FEATURES.map((feature) => (
          <li key={feature.title} className="p-5">
            <div className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-pill border border-rule bg-surface text-daiqing-600"
              >
                <FeatureIcon kind={feature.icon} />
              </span>
              <p className="text-sm font-medium text-ink">
                {feature.title}
              </p>
            </div>
            <p className="mt-2 text-xs leading-5 text-ink-soft">
              {feature.description}
            </p>
          </li>
        ))}
      </ul>

      <Card className="panel mx-auto w-full max-w-lg gap-4 px-6 py-8 sm:px-8">
        <CardHeader className="px-0">
          <div>
            <h2 className="text-xl font-medium text-daiqing-700">{copy.title}</h2>
            <p className="mt-1 text-sm text-ink-soft">{copy.subtitle}</p>
          </div>
        </CardHeader>

        <CardContent className="space-y-4 px-0">
      <div
        role="tablist"
        aria-label="登录或注册"
        className="grid grid-cols-2 gap-1 rounded-control border border-edge bg-surface p-1"
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
            className={`min-h-10 border-b border-transparent px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === tab
                ? 'border-daiqing-600 bg-surface text-daiqing-700'
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
        className="space-y-5"
      >
        <div className="space-y-1">
          <Label htmlFor={emailId} className="text-sm font-medium text-ink">
            邮箱
          </Label>
          <Input
            id={emailId}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
            className="h-11 rounded-control border-edge bg-surface px-4 text-ink placeholder:text-ink-soft focus-visible:border-daiqing-600 focus-visible:ring-0"
            placeholder="you@example.com"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor={passwordId} className="text-sm font-medium text-ink">
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
            className="h-11 rounded-control border-edge bg-surface px-4 text-ink placeholder:text-ink-soft focus-visible:border-daiqing-600 focus-visible:ring-0"
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
            className="rounded-control border border-daiqing-600 bg-daiqing-50 px-4 py-2.5 text-sm text-daiqing-700"
          >
            {error}
          </p>
        )}

        {notice && (
          <p
            role="status"
            aria-live="polite"
            className="rounded-control border border-daiqing-600 bg-daiqing-100 px-4 py-2.5 text-sm text-daiqing-700"
          >
            {notice}
          </p>
        )}

        <Button
          type="submit"
          disabled={loading}
          className="h-11 w-full rounded-control bg-daiqing-700 px-4 text-base font-medium text-surface transition-colors hover:bg-daiqing-800 focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? copy.pending : copy.submit}
        </Button>
      </form>
        </CardContent>
      </Card>
    </main>
  );
}

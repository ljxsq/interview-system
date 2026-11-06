import { expect, test } from '@playwright/test';

const PASSWORD = 'E2E-Flow-2026!';

// 简历/JD 只要满足 prep 的最小长度要求即可，内容为虚构测试数据。
const RESUME_TEXT =
  '张三，前端工程师，五年 React 与 TypeScript 开发经验，负责过中后台系统与数据可视化项目，熟悉 Node.js、性能优化与组件库建设。';
const JD_TEXT =
  '招聘高级前端工程师，要求熟练掌握 React、TypeScript，具备大型项目架构与性能优化经验，熟悉工程化与团队协作。';

test('登录 → 创建面试 → 生成题目 → 答题提交 → 查看报告', async ({
  page,
  request,
}) => {
  test.setTimeout(360_000);

  const email = `e2e.${Date.now()}@example.com`;
  console.log(`[e2e] 测试账号: ${email} / ${PASSWORD}`);

  // 1. 注册唯一账号（不会自动登录），随后走真实登录流程。
  const registerResponse = await request.post('/api/auth/register', {
    data: { email, password: PASSWORD },
  });
  expect(registerResponse.status()).toBe(201);

  // 2. 登录成功应跳转 /interview/new。
  await page.goto('/login');
  await page.getByLabel('邮箱').fill(email);
  await page.getByLabel('密码').fill(PASSWORD);
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/interview\/new$/, { timeout: 20_000 });
  console.log('[e2e] 登录成功，已进入 /interview/new');

  // 3. 创建面试并生成题目（真实调用 Coze prep，约 40–60 秒）。
  await page.locator('#resume-text').fill(RESUME_TEXT);
  await page.locator('#jd-text').fill(JD_TEXT);
  await page.getByRole('button', { name: '生成面试题' }).click();

  await page.waitForURL(/\/interview\/[0-9a-f-]{36}$/, { timeout: 150_000 });
  const sessionId = page.url().split('/interview/')[1];
  console.log(`[e2e] 会话 ID: ${sessionId}`);

  // 题目文本非空，且首题处于未录制状态。
  const firstQuestion = page.locator('main p.text-base').first();
  await expect(firstQuestion).toBeVisible();
  const questionText = (await firstQuestion.innerText()).trim();
  expect(questionText.length).toBeGreaterThan(10);
  await expect(page.getByText('第 1 题', { exact: true })).toBeVisible();
  await expect(page.getByText('未录制', { exact: true })).toBeVisible();
  console.log(`[e2e] 首题文本: ${questionText.slice(0, 40)}…`);

  // 4. 用假摄像头/麦克风录制真实 MediaRecorder 视频，录完自动上传。
  await page.getByRole('button', { name: '开始答题' }).click();
  await expect(page.getByText('● 正在录制…', { exact: true })).toBeVisible();
  await page.waitForTimeout(2500);
  await page.getByRole('button', { name: '答题结束' }).click();

  await expect(page.getByText('已录制待评估').first()).toBeVisible({
    timeout: 60_000,
  });
  console.log('[e2e] 首题已录制并上传，状态为已录制待评估');

  // 5. 仅录制首题，直接到最后一题提交统一评估。
  const submitButton = page.getByRole('button', { name: '提交并统一评估' });
  for (let index = 0; index < 30; index += 1) {
    if (await submitButton.count()) {
      break;
    }
    await page.getByRole('button', { name: '下一题' }).click();
  }
  await expect(submitButton).toBeVisible();
  await expect(
    page.getByText(/还有 \d+ 题已录制待评估/).first(),
  ).toBeVisible();

  await submitButton.click();
  await page.waitForURL(/\/interview\/[0-9a-f-]{36}\/report$/, {
    timeout: 120_000,
  });
  console.log('[e2e] 统一评估完成，已进入报告页');

  // 6. 报告页应有真实数据，而不是空态。
  await expect(page.getByText('总分', { exact: true })).toBeVisible();
  await expect(page.getByText('表达清晰度').first()).toBeVisible();
  await expect(page.getByText('技术深度').first()).toBeVisible();
  await expect(page.getByText('岗位相关性').first()).toBeVisible();
  await expect(page.getByText('逐题明细', { exact: true })).toBeVisible();
  await expect(page.getByText('第 1 题', { exact: true })).toBeVisible();
  await expect(page.getByText(/已评估：\d+ \/ \d+/)).toBeVisible();
  await expect(page.getByText('正在评估中，请等待……')).toHaveCount(0);
});

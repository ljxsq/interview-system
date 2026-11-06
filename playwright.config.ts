import path from 'node:path';

import { defineConfig, devices } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  // 单条链路测试：串行执行，避免并发写入 data/interview.json 与共享 Coze 配额。
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 360_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  // 报告与 trace 落在系统临时目录，避免污染仓库。
  outputDir: path.join(
    process.env.TEMP ?? '/tmp',
    'trae-playwright-results',
  ),
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: 'retain-on-failure',
    video: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // 环境无法下载 Playwright 自带 Chromium 时，退回系统已安装的 Chromium 内核 Edge。
        channel: 'msedge',
        // 用 Chromium 假摄像头/麦克风，保留真实 MediaRecorder 视频流。
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
          ],
        },
        permissions: ['camera', 'microphone'],
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: `${BASE_URL}/login`,
    // 已有服务（dev 或生产）时直接复用，避免端口冲突。
    reuseExistingServer: true,
    timeout: 180_000,
  },
});

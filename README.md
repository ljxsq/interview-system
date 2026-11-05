# 智能面试系统

简历与岗位描述驱动出题，在浏览器中逐题录制视频作答，全部录完后统一评估，并生成多维面试报告。

## 功能特性

### 出题

- 支持直接粘贴简历 / JD 文本，也支持上传文件自动提取：
  - 简历：PDF、DOCX、TXT、MD；
  - JD：PNG、JPG、JPEG、WEBP 截图，经 Coze 图片识别工作流转成文字。
- 文本超过 5000 字时在提取阶段截断，并返回 `truncated` / `original_length` 提示。
- 由 Coze 备课工作流生成题目（题干、评分要点、难度），写入会话后进入答题页。

### 答题

- 使用浏览器 `MediaRecorder` 录制（优先 MP4，浏览器不支持时回退 WebM）。
- 录完只上传视频、不立即评估；上传成功后该题标记为「已录制待评估」，可继续下一题。
- 支持回看已上传视频、重录同一题（重录会覆盖待评估记录并把已完成会话退回待评估状态）。
- 最后一题统一提交，按题目顺序逐题调用评估接口；支持单题失败后重试。

### 报告

- 总分，以及三维均分：表达清晰度、技术深度、岗位相关性。
- 每题的已覆盖要点、遗漏要点与评语。
- 兜底评分题单独标记，总分与维度均分不计入兜底题与待评估题。
- 提供「重新面试」入口（携带原会话的简历 / JD 预填）与返回答题页入口。

## 技术栈

| 类别 | 实际使用 |
|---|---|
| 框架 | Next.js 16.4.5（App Router，`proxy.ts` 请求拦截） |
| 运行时 UI | React 19.3.0 / React DOM 19.3.0 |
| 语言 | TypeScript ^5 |
| 样式 | Tailwind CSS v4（`@tailwindcss/turbopack`） |
| 组件 | shadcn/ui，预设 `base-nova`（基于 Base UI `@base-ui/react`），图标 `lucide-react` |
| 认证 | `jose`（HS256 JWT）+ `bcryptjs`（口令哈希） |
| 文档解析 | `unpdf`（PDF 文字层）+ `mammoth`（DOCX） |
| 外部服务 | Coze 工作流：出题（prep）、评估（eval）、图片 OCR |

依赖版本以 `package.json` 为准。

## 快速开始

```bash
npm install
```

在项目根目录创建 `.env.local`（变量见下表，**不要提交到版本库**），然后：

```bash
npm run dev        # 开发模式，默认 http://localhost:3000
npm run build      # 生产构建
npm start          # 启动生产服务（需先 build）
npm run lint       # ESLint
```

`package.json` 中只有 `dev`、`build`、`start`、`lint` 四个脚本，没有测试脚本。

## 环境变量

| 变量名 | 用途 | 是否必需 |
|---|---|---|
| `COZE_PAT` | 调用 Coze 工作流、上传视频与图片的访问令牌 | 是（出题、答题上传、JD OCR） |
| `COZE_WORKFLOW_ID_PREP` | 出题工作流 ID | 是 |
| `COZE_WORKFLOW_ID_EVAL` | 评估工作流 ID | 是 |
| `AUTH_SECRET` | 登录 JWT 的 HS256 签名密钥 | 是 |

说明：

- 图片 OCR 工作流 ID 目前硬编码在 `app/api/interview/extract/route.ts`，**不读取环境变量**。
- 这些变量只在服务端读取；代码中没有任何 `NEXT_PUBLIC_*` 变量。

## 目录结构

| 路径 | 职责 |
|---|---|
| `app/` | 页面（登录、新建面试、答题、报告）与 `/api/*` 路由 |
| `components/` | 通用组件与 `VideoRecorder` 录制组件 |
| `components/illustrations/` | 内联 SVG 萌图（欢迎兔、奔跑兔）及共享配色常量 |
| `lib/` | 认证、Coze 调用、文件存储、报告聚合、类型与工具函数 |
| `proxy.ts` | 拦截 `/interview/:path*`，校验登录 Cookie |
| `public/` | 静态资源 |
| `data/` | 单机文件存储：`interview.json` 与 `videos/` |

## 接口一览

| 方法 | 路径 | 鉴权 | 作用 |
|---|---|---|---|
| POST | `/api/auth/register` | 公开 | 注册用户（邮箱 + 口令，口令 8–72 字符） |
| POST | `/api/auth/login` | 公开 | 登录，成功后写入 HttpOnly Cookie |
| POST | `/api/auth/logout` | 公开 | 清除登录 Cookie |
| POST | `/api/interview/extract` | 登录 | `multipart/form-data`，`file` + `kind=resume\|jd`，返回提取文本 |
| POST | `/api/interview/prep` | 登录 | JSON `resume_text` / `jd_text`，生成题目并创建会话 |
| GET | `/api/interview/[sessionId]` | 登录 + 归属 | 返回会话、题目、已评估答案、待评估记录、原始简历 / JD |
| POST | `/api/interview/upload` | 登录 + 归属 | 上传单题视频（`file`、`session_id`、`question_id`），保存 Coze `file_id` 与本地副本 |
| GET | `/api/interview/video` | 登录 + 归属 | 按 `session_id` + `question_id` 流式回看，支持单段 Range（206） |
| POST | `/api/interview/eval` | 登录 + 归属 | 评估单题（可用已上传的 `file_id`），写入评分并清理待评估记录 |
| GET | `/api/test-coze` | 登录（非生产） | 调试：触发出题工作流；**生产环境直接 404** |
| POST | `/api/test-eval` | 登录（非生产） | 调试：触发评估工作流；**生产环境直接 404** |

归属校验失败时统一返回 404，不暴露资源是否存在。

## 数据存储

- `data/interview.json`：单文件 JSON，包含 `users`、`sessions`、`questions`、`answers`、`pending_answers` 五个集合。
- `data/videos/<sessionId>/<questionId>.mp4|webm`：上传成功后的本地视频副本，用于跨刷新回看；评估参数仍使用 Coze `file_id`。
- JSON 写入采用「临时文件 + rename」保证原子性，所有读写经同一 Promise 队列串行执行，并按请求缓存。
- 会话状态为 `prep_done`（已出题 / 部分待评估）与 `completed`（全部题目已评估）。
- 这是**单机文件存储**，不是生产级方案：没有数据库事务、横向扩展与多实例并发保证。

## 认证与安全

- 登录签发 HS256 JWT，有效期 7 天，写入 Cookie `interview_auth`：`HttpOnly`、`SameSite=Lax`、`Path=/`，生产环境带 `Secure`。
- `proxy.ts` 仅保护 `/interview/:path*` 页面；JWT 缺失、签名错误或过期时重定向到 `/login`。
- API 路由通过 `getRequiredSessionUser` 校验 Cookie，未登录返回 401；会话与题目均校验归属，越权统一 404。
- 注册口令使用 bcrypt 哈希存储；登录对「账号不存在」与「口令错误」返回同一提示，避免枚举用户。
- 调用 Coze 工作流时仅在 HTTP 429 且确认限流后重试：最多 2 次，优先使用 `Retry-After`，否则按 1s、2s 指数退避。

## 已知限制

- 文件存储不可横向扩展，多实例部署会出现数据不一致；无数据库。
- 视频文件没有 TTL 或清理任务，也没有删除会话 / 视频的接口，磁盘会持续增长。
- 扫描版 PDF（无文字层）不会被 OCR，直接返回 422；目前只有 JD 截图走图片识别。
- JD OCR 依赖 Coze 模型，识别结果可能错字或漏字，没有人工校对环节。
- 简历 / JD 单文件上限 10 MB；提取文本超过 5000 字会截断，`/api/interview/prep` 对超过 5000 字符的入参同样拒绝。
- 视频上传单文件上限 50 MB，仅接受 `video/mp4` 与 `video/webm`；评估工作流无法解析视频时返回 422 并提示重录。
- 429 重试的 `Retry-After` 只支持整数 / 小数秒，不支持 HTTP-date（解析失败时回退指数退避）。
- 无自动化测试与 CI；注册无邮箱验证，登录无失败次数限流。
- JWT 为无状态凭证，登出只清除 Cookie，不能服务端吊销已签发的 token。

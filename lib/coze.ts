import 'server-only';

const COZE_WORKFLOW_RUN_URL = 'https://api.coze.cn/v1/workflow/run';
const COZE_MAX_RETRIES = 2;
const COZE_RETRY_BASE_DELAY_MS = 1000;

interface WorkflowFetchResult {
  response: Response;
  rawBody: string;
}

interface CozeWorkflowResponse {
  code?: number;
  msg?: string;
  data?: unknown;
}

/**
 * 服务端调用 Coze 工作流。
 * Coze 返回的 `data` 是 JSON 字符串，这里统一解析后返回。
 */
export async function runWorkflow(
  workflowId: string,
  parameters: Record<string, unknown>,
): Promise<unknown> {
  const pat = process.env.COZE_PAT;
  if (!pat) {
    throw new Error(
      `Coze 工作流调用失败：缺少环境变量 COZE_PAT（workflowId=${workflowId}）`,
    );
  }

  const { response, rawBody } = await fetchWorkflowWithRetry(
    workflowId,
    pat,
    parameters,
  );

  if (!response.ok) {
    throw new Error(
      `Coze 工作流请求失败：HTTP ${response.status} ${response.statusText}（workflowId=${workflowId}），响应：${truncate(rawBody)}`,
    );
  }

  let payload: CozeWorkflowResponse;
  try {
    payload = JSON.parse(rawBody) as CozeWorkflowResponse;
  } catch {
    throw new Error(
      `Coze 工作流响应解析失败：响应不是合法 JSON（workflowId=${workflowId}），响应：${truncate(rawBody)}`,
    );
  }

  if (payload.code !== 0) {
    throw new Error(
      `Coze 工作流执行失败：code=${payload.code}，msg=${payload.msg ?? '(empty)'}（workflowId=${workflowId}）`,
    );
  }

  if (typeof payload.data !== 'string') {
    throw new Error(
      `Coze 工作流响应解析失败：data 不是 JSON 字符串（实际类型 ${typeof payload.data}，workflowId=${workflowId}）`,
    );
  }

  try {
    return JSON.parse(payload.data);
  } catch {
    throw new Error(
      `Coze 工作流响应解析失败：data 不是合法 JSON（workflowId=${workflowId}），data：${truncate(payload.data)}`,
    );
  }
}

/**
 * 仅在 429 且确认属于限流时重试，最多重试 COZE_MAX_RETRIES 次。
 * 其它状态码（含 429 但 X-RateLimit-Remaining > 0）原样返回，交由调用方抛错。
 */
async function fetchWorkflowWithRetry(
  workflowId: string,
  pat: string,
  parameters: Record<string, unknown>,
): Promise<WorkflowFetchResult> {
  let retries = 0;

  for (;;) {
    let response: Response;
    try {
      response = await fetch(COZE_WORKFLOW_RUN_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${pat}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ workflow_id: workflowId, parameters }),
      });
    } catch (error) {
      throw new Error(
        `Coze 工作流请求失败：网络错误（workflowId=${workflowId}）：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const rawBody = await response.text();

    if (response.status !== 429 || !isRateLimited(response)) {
      return { response, rawBody };
    }

    if (retries >= COZE_MAX_RETRIES) {
      throw new Error(
        `Coze 工作流请求失败：HTTP ${response.status} ${response.statusText}（workflowId=${workflowId}），已重试 ${COZE_MAX_RETRIES} 次仍限流，响应：${truncate(rawBody)}`,
      );
    }

    await sleep(retryDelayMs(response.headers.get('Retry-After'), retries));
    retries += 1;
  }
}

function isRateLimited(response: Response): boolean {
  const header = response.headers.get('X-RateLimit-Remaining');
  if (header === null) {
    return true;
  }

  const remaining = Number(header.trim());
  return !Number.isFinite(remaining) || remaining <= 0;
}

function retryDelayMs(retryAfter: string | null, retryIndex: number): number {
  if (retryAfter !== null) {
    const seconds = Number(retryAfter.trim());
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1000;
    }
  }

  return COZE_RETRY_BASE_DELAY_MS * 2 ** retryIndex;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(value: string, maxLength = 300): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

/**
 * OpenAI 兼容的模型客户端。
 *
 * 这是 app 里唯一发起模型请求的地方。它直接打用户在设置里填的 Base URL，
 * 中间没有我们的服务器——key 和对话内容不经过第三方。
 *
 * 两个刻意的保守设计：
 *   - 工具调用按分片增量累积。实测某 OpenAI 兼容网关的 gemini-3.7-flash-high 会在单帧里
 *     下发完整的 tool_calls，但换成别的 provider 就会分片，用户填什么 endpoint 都得能跑。
 *   - 流式用 expo/fetch 而不是全局 fetch。RN 的 fetch 是 XMLHttpRequest 的 polyfill，
 *     没有 response.body 流；expo/fetch 才有真正的 ReadableStream。它按需动态载入，
 *     并且可以由 fetchImpl 覆盖，这样这个模块能脱离 RN 直接跑集成测试。
 */

export type TextPart = { type: "text"; text: string };
export type ImagePart = { type: "image_url"; image_url: { url: string } };
export type ContentPart = TextPart | ImagePart;

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | ContentPart[] }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; content: string; tool_call_id: string };

export type ToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  body: { getReader(): { read(): Promise<{ done: boolean; value?: Uint8Array }> } } | null;
}>;

export type ProviderConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** 只在测试里注入。留空则用 expo/fetch。 */
  fetchImpl?: FetchLike;
};

export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "reasoning"; delta: string }
  | { type: "tool_call_start"; index: number; name: string }
  | { type: "done" };

export type Completion = {
  content: string;
  reasoning: string;
  toolCalls: ToolCall[];
  finishReason: string | null;
  usage: { promptTokens: number; completionTokens: number } | null;
};

export class ProviderError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ProviderError";
    this.status = status;
  }
}

/** 去掉末尾斜杠和用户可能连 /v1 一起粘进来的后缀。 */
export function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "").replace(/\/v1$/, "");
}

function endpoint(baseUrl: string, path: string): string {
  return `${normalizeBaseUrl(baseUrl)}/v1${path}`;
}

function headers(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

async function failure(response: Response | { status: number; text(): Promise<string> }): Promise<ProviderError> {
  let detail = "";
  try {
    detail = (await response.text()).slice(0, 400);
  } catch {
    detail = "";
  }
  const hint =
    response.status === 401 || response.status === 403
      ? "API Key 无效或已过期"
      : response.status === 404
        ? "Base URL 可能不对，检查是否需要去掉 /v1"
        : response.status === 429
          ? "请求过于频繁或额度已用尽"
          : "模型服务返回错误";
  return new ProviderError(response.status, detail ? `${hint}（${response.status}）：${detail}` : `${hint}（${response.status}）`);
}

/** 拉可用模型列表。设置页的“测试连接”就用这个，一次调用同时验证 Base URL 和 Key。 */
export async function listModels(config: Pick<ProviderConfig, "baseUrl" | "apiKey">): Promise<string[]> {
  const response = await fetch(endpoint(config.baseUrl, "/models"), {
    headers: headers(config.apiKey),
  });
  if (!response.ok) throw await failure(response);
  const body = (await response.json()) as { data?: { id?: string }[] };
  return (body.data ?? []).map((entry) => entry.id).filter((id): id is string => Boolean(id));
}

type Accumulator = {
  content: string;
  reasoning: string;
  calls: Map<number, { id: string; name: string; args: string }>;
  finishReason: string | null;
  usage: Completion["usage"];
};

function absorb(acc: Accumulator, payload: any, emit: (event: StreamEvent) => void): void {
  const choice = payload?.choices?.[0];
  if (payload?.usage) {
    acc.usage = {
      promptTokens: payload.usage.prompt_tokens ?? 0,
      completionTokens: payload.usage.completion_tokens ?? 0,
    };
  }
  if (!choice) return;
  if (choice.finish_reason) acc.finishReason = choice.finish_reason;

  // 流式给 delta，非流式给 message；两条路走同一套累积逻辑。
  const part = choice.delta ?? choice.message;
  if (!part) return;

  if (typeof part.content === "string" && part.content) {
    acc.content += part.content;
    emit({ type: "text", delta: part.content });
  }
  if (typeof part.reasoning_content === "string" && part.reasoning_content) {
    acc.reasoning += part.reasoning_content;
    emit({ type: "reasoning", delta: part.reasoning_content });
  }

  for (const raw of part.tool_calls ?? []) {
    const index = typeof raw.index === "number" ? raw.index : acc.calls.size;
    const existing = acc.calls.get(index);
    if (!existing) {
      acc.calls.set(index, {
        id: raw.id ?? `call_${index}`,
        name: raw.function?.name ?? "",
        args: raw.function?.arguments ?? "",
      });
      if (raw.function?.name) emit({ type: "tool_call_start", index, name: raw.function.name });
    } else {
      if (raw.id) existing.id = raw.id;
      if (raw.function?.name && !existing.name) {
        existing.name = raw.function.name;
        emit({ type: "tool_call_start", index, name: existing.name });
      }
      if (raw.function?.arguments) existing.args += raw.function.arguments;
    }
  }
}

function settle(acc: Accumulator): Completion {
  return {
    content: acc.content,
    reasoning: acc.reasoning,
    toolCalls: [...acc.calls.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, call]) => ({
        id: call.id,
        type: "function" as const,
        function: { name: call.name, arguments: call.args || "{}" },
      })),
    finishReason: acc.finishReason,
    usage: acc.usage,
  };
}

export type ChatOptions = {
  messages: ChatMessage[];
  tools?: ToolDef[];
  stream?: boolean;
  signal?: AbortSignal;
  onEvent?: (event: StreamEvent) => void;
  /** 视觉抽取要 JSON，对话不要。 */
  responseFormat?: { type: "json_object" };
};

export async function chat(config: ProviderConfig, options: ChatOptions): Promise<Completion> {
  const acc: Accumulator = {
    content: "",
    reasoning: "",
    calls: new Map(),
    finishReason: null,
    usage: null,
  };
  const emit = options.onEvent ?? (() => {});
  const body: Record<string, unknown> = {
    model: config.model,
    messages: options.messages,
    stream: options.stream ?? false,
  };
  if (options.tools?.length) body.tools = options.tools;
  if (options.responseFormat) body.response_format = options.responseFormat;

  if (!body.stream) {
    const response = await fetch(endpoint(config.baseUrl, "/chat/completions"), {
      method: "POST",
      headers: headers(config.apiKey),
      body: JSON.stringify(body),
      signal: options.signal,
    });
    if (!response.ok) throw await failure(response);
    absorb(acc, await response.json(), emit);
    emit({ type: "done" });
    return settle(acc);
  }

  const streamFetch = config.fetchImpl ?? ((await import("expo/fetch")).fetch as unknown as FetchLike);
  const response = await streamFetch(endpoint(config.baseUrl, "/chat/completions"), {
    method: "POST",
    headers: headers(config.apiKey),
    body: JSON.stringify(body),
    signal: options.signal,
  });
  if (!response.ok) throw await failure(response);
  if (!response.body) throw new ProviderError(0, "该端点不支持流式响应，请在设置里关闭流式输出");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE 事件以空行分隔；只取最后一个完整边界之前的内容，剩下的留到下一轮。
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");

      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          absorb(acc, JSON.parse(data), emit);
        } catch {
          // 半个 JSON 帧不该让整个回合失败，跳过继续读。
        }
      }
    }
  }

  emit({ type: "done" });
  return settle(acc);
}

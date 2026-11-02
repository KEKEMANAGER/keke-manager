// ai.ts — one call to the model, made the way each model family accepts it,
// retried once when the failure is the kind that passes, and explained in a
// form that is safe to log.
//
// What is never logged or shown from here: the API key, the request body and
// the API's own error message (it can quote the request). Only the HTTP status,
// the error type, a short known hint, the request id and the model name.

export type ModelProfile = 'classic' | 'v5';

/**
 * How a model takes the request.
 *
 * classic — Claude Sonnet 4.5 / 4.6 and the other 4.x models: a forced tool
 *   call, no thinking unless asked for.
 * v5 — the 5.x models (claude-sonnet-5-5 and later): forced tool choice and
 *   sampling parameters are rejected with a 400, thinking runs unless set to
 *   its lowest setting, and thinking tokens count toward max_tokens. Source:
 *   the Sonnet 5.5 migration guide on platform.claude.com.
 */
export function profileFor(model: string): ModelProfile {
  return /^claude-[a-z]+-5(?:$|[-.])/.test(model.trim()) ? 'v5' : 'classic';
}

export type ToolSpec = { name: string; description: string; input_schema: unknown };

export type RequestOptions = {
  model: string;
  system: string;
  tool: ToolSpec;
  content: unknown;
  maxTokens: number;
  /** v5 only: output_config.effort. */
  effort?: 'low' | 'medium' | 'high';
};

/** The request body for the model's profile. No temperature: v5 rejects it, classic never needed it. */
export function buildRequest(o: RequestOptions): Record<string, unknown> {
  const profile = profileFor(o.model);
  const messages = [{ role: 'user', content: o.content }];
  if (profile === 'classic') {
    return {
      model: o.model,
      max_tokens: o.maxTokens,
      system: o.system,
      tools: [o.tool],
      tool_choice: { type: 'tool', name: o.tool.name },
      messages,
    };
  }
  return {
    model: o.model,
    // max_tokens covers thinking as well as the answer on these models.
    max_tokens: Math.max(16000, o.maxTokens),
    system: `${o.system}\n\nAnswer only by calling the ${o.tool.name} tool, exactly once. Do not answer in text.`,
    tools: [o.tool],
    tool_choice: { type: 'auto' },
    thinking: { type: 'between_tools' },
    output_config: { effort: o.effort ?? 'medium' },
    messages,
  };
}

export type AiFailureKind = 'no_key' | 'http' | 'timeout' | 'network' | 'no_tool' | 'refusal' | 'context';

export type AiFailure = {
  kind: AiFailureKind;
  status: number | null;
  /** The API's error type ("invalid_request_error", "overloaded_error"). */
  type: string | null;
  /** A short, known reading of the error — never its text. */
  hint: string | null;
  requestId: string | null;
  attempts: number;
  model: string;
};

export type AiUsage = { input: number; output: number };

export type AiResult =
  | { ok: true; toolInput: unknown; truncated: boolean; attempts: number; requestId: string | null; usage: AiUsage | null; model: string }
  | { ok: false; failure: AiFailure };

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504, 529]);
/** A second attempt starts only when this much of the request's time is left. */
export const MIN_RETRY_MS = 20_000;

function hintFor(status: number | null, type: string | null, message: string): string | null {
  const m = message.toLowerCase();
  if (m.includes('credit balance')) return 'credit_balance';
  if (m.includes('tool_choice')) return 'tool_choice_unsupported';
  if (/\b(temperature|top_p|top_k)\b/.test(m)) return 'sampling_unsupported';
  if (m.includes('thinking')) return 'thinking_setting';
  if (m.includes('max_tokens')) return 'max_tokens_invalid';
  if (status === 401 || type === 'authentication_error') return 'auth';
  if (status === 403 || type === 'permission_error') return 'permission';
  if (status === 404 || type === 'not_found_error') return 'model_not_found';
  if (status === 413 || type === 'request_too_large') return 'too_large';
  if (status === 429 || type === 'rate_limit_error') return 'rate_limit';
  if (status === 529 || type === 'overloaded_error') return 'overloaded';
  if (status !== null && status >= 500) return 'server_error';
  return null;
}

export type CallOptions = {
  apiKey: string;
  body: Record<string, unknown>;
  toolName: string;
  /** Cap for one attempt. */
  timeoutMs: number;
  /** When the whole request must have answered (epoch ms). */
  deadline: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
};

/**
 * One tool call to the Messages API. Retries once on a failure that passes
 * (429, 529, 5xx, a dropped connection, or a 5.x model that answered without
 * calling the tool) when there is time left; never on a 4xx that will fail
 * again, and never after a timeout — that time is already gone.
 */
export async function callTool(o: CallOptions): Promise<AiResult> {
  const model = String(o.body.model ?? '');
  const now = o.now ?? Date.now;
  const sleep = o.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const doFetch = o.fetchImpl ?? fetch;
  if (!o.apiKey) {
    return { ok: false, failure: { kind: 'no_key', status: null, type: null, hint: 'no_key', requestId: null, attempts: 0, model } };
  }

  let attempts = 0;
  let last: AiFailure | null = null;
  while (attempts < 2) {
    attempts += 1;
    const left = o.deadline - now();
    const timeout = Math.max(1, Math.min(o.timeoutMs, left));
    let res: Response;
    try {
      res = await doFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': o.apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify(o.body),
        signal: AbortSignal.timeout(timeout),
      });
    } catch (e) {
      const name = (e as { name?: string })?.name;
      if (name === 'TimeoutError' || name === 'AbortError') {
        return { ok: false, failure: { kind: 'timeout', status: null, type: null, hint: 'timeout', requestId: null, attempts, model } };
      }
      last = { kind: 'network', status: null, type: null, hint: 'network', requestId: null, attempts, model };
      if (attempts < 2 && o.deadline - now() >= MIN_RETRY_MS) {
        await sleep(1200);
        continue;
      }
      return { ok: false, failure: last };
    }

    const requestId = res.headers.get('request-id');
    if (!res.ok) {
      let type: string | null = null;
      let message = '';
      try {
        const j = await res.json();
        type = typeof j?.error?.type === 'string' ? j.error.type : null;
        message = typeof j?.error?.message === 'string' ? j.error.message : '';
      } catch {
        /* not JSON */
      }
      last = { kind: 'http', status: res.status, type, hint: hintFor(res.status, type, message), requestId, attempts, model };
      if (RETRYABLE_STATUS.has(res.status) && attempts < 2 && o.deadline - now() >= MIN_RETRY_MS) {
        const after = Number(res.headers.get('retry-after'));
        await sleep(Number.isFinite(after) && after > 0 ? Math.min(after * 1000, 3000) : 1200);
        continue;
      }
      return { ok: false, failure: last };
    }

    let json: any;
    try {
      json = await res.json();
    } catch {
      return { ok: false, failure: { kind: 'http', status: res.status, type: 'invalid_json', hint: null, requestId, attempts, model } };
    }
    const usage: AiUsage | null = json?.usage
      ? { input: Number(json.usage.input_tokens ?? 0), output: Number(json.usage.output_tokens ?? 0) }
      : null;
    const stop = String(json?.stop_reason ?? '');
    if (stop === 'refusal') {
      return { ok: false, failure: { kind: 'refusal', status: 200, type: null, hint: 'refusal', requestId, attempts, model } };
    }
    if (stop === 'model_context_window_exceeded') {
      return { ok: false, failure: { kind: 'context', status: 200, type: null, hint: 'context_window', requestId, attempts, model } };
    }
    const blocks: any[] = Array.isArray(json?.content) ? json.content : [];
    const tool = blocks.find((b) => b?.type === 'tool_use' && b?.name === o.toolName) ?? blocks.find((b) => b?.type === 'tool_use');
    if (!tool || tool.input == null || typeof tool.input !== 'object') {
      last = { kind: 'no_tool', status: 200, type: null, hint: stop === 'max_tokens' ? 'truncated' : 'no_tool_call', requestId, attempts, model };
      // A 5.x model may answer in text instead of calling the tool: ask once more.
      if (stop !== 'max_tokens' && attempts < 2 && o.deadline - now() >= MIN_RETRY_MS) continue;
      return { ok: false, failure: last };
    }
    return { ok: true, toolInput: tool.input, truncated: stop === 'max_tokens', attempts, requestId, usage, model };
  }
  return { ok: false, failure: last ?? { kind: 'network', status: null, type: null, hint: null, requestId: null, attempts, model } };
}

const SAFE = /^[A-Za-z0-9_.:-]{1,80}$/;
const safe = (v: unknown) => (typeof v === 'string' && SAFE.test(v) ? v : v == null ? '-' : 'x');

/** One line about a failure that can go into a log: no key, no request, no personal data. */
export function failureCode(f: AiFailure): string {
  return [
    `ai_failed kind=${f.kind}`,
    `status=${f.status ?? '-'}`,
    `type=${safe(f.type)}`,
    `hint=${safe(f.hint)}`,
    `attempts=${f.attempts}`,
    `model=${safe(f.model)}`,
    `req=${safe(f.requestId)}`,
  ].join(' ');
}

/** What the agency is told — plain Georgian, nothing from the API's own text. */
export function failureMessageKa(f: AiFailure): string {
  switch (f.kind) {
    case 'timeout':
      return 'AI წაკითხვამ ძალიან დიდხანს გასტანა.';
    case 'refusal':
      return 'AI-მ ეს მოთხოვნა არ წაიკითხა.';
    case 'no_tool':
    case 'context':
      return 'AI-ს პასუხი არასრული იყო.';
    case 'network':
      return 'AI სერვისს ვერ დავუკავშირდი — სცადე ცოტა ხანში.';
    case 'no_key':
      return 'AI წაკითხვა გამორთულია.';
    case 'http':
      if (f.hint === 'rate_limit' || f.hint === 'overloaded' || f.hint === 'server_error') {
        return 'AI სერვისი ახლა გადატვირთულია — სცადე ცოტა ხანში.';
      }
      return 'AI წაკითხვა დროებით მიუწვდომელია.';
  }
}

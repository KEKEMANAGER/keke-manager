// Test harness for booking-import: the real handler, with every network call
// answered here. No Supabase project, no Anthropic API, no real data. The
// "model" answers are written by the tests themselves.

// The tests read fixed dates in November and December 2026; the clock is held
// at 1 November 2026 so "a date in the past" means the same thing every run.
export const TEST_NOW = Date.parse('2026-11-01T10:00:00Z');
Date.now = () => TEST_NOW;

Deno.env.set('SUPABASE_URL', 'http://supabase.test');
Deno.env.set('SUPABASE_ANON_KEY', 'anon-test-key');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test-secret');

export const FAKE_API_KEY = 'sk-ant-test-0000000000000000';

export type ModelReply =
  | { kind: 'tool'; input: unknown; name?: string; stop_reason?: string; text?: string }
  | { kind: 'text'; text: string }
  | { kind: 'http'; status: number; body: unknown; headers?: Record<string, string> }
  | { kind: 'network' }
  | { kind: 'hang' };

export type RunOptions = {
  apiKey?: boolean;
  userId?: string;
  role?: string | null;
  /** The role lookup itself fails. */
  roleFails?: boolean;
  learned?: { label: string; field: string }[];
  /** Imports this company made in the last 24 h. */
  importsToday?: number;
  /** One reply per model call, in order; the last one repeats. */
  replies?: ModelReply[];
};

export type RunResult = {
  status: number;
  json: any;
  modelRequests: any[];
  logRows: any[];
  rememberCalls: any[];
  approvals: any[];
  consoleLines: string[];
};

export const COMPANY = '00000000-0000-4000-8000-00000000c0de';

const state = {
  opts: {} as RunOptions,
  modelRequests: [] as any[],
  logRows: [] as any[],
  rememberCalls: [] as any[],
  approvals: [] as any[],
  replyIndex: 0,
};

const j = (v: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(v), { status, headers: { 'content-type': 'application/json', ...headers } });

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const body = init?.body ? String(init.body) : '';
  const o = state.opts;
  const uid = o.userId ?? COMPANY;
  if (url.includes('/auth/v1/user')) {
    return j({ id: uid, aud: 'authenticated', role: 'authenticated', email: 'test@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });
  }
  if (url.includes('/rest/v1/users')) {
    if (o.roleFails) return j({ message: 'unavailable' }, 500);
    return j(o.role === null ? null : { role: o.role ?? 'company' });
  }
  if (url.includes('/rest/v1/company_import_labels')) return j(o.learned ?? []);
  if (url.includes('/rest/v1/booking_import_log')) {
    if (method === 'HEAD' || method === 'GET') {
      const n = o.importsToday ?? 0;
      return new Response(method === 'HEAD' ? null : '[]', { status: 200, headers: { 'content-range': `0-0/${n}` } });
    }
    state.logRows.push(JSON.parse(body || '{}'));
    return new Response(null, { status: 201 });
  }
  if (url.includes('/rest/v1/booking_import_approvals')) {
    const row = JSON.parse(body || '{}');
    const id = `00000000-0000-4000-8000-${String(state.approvals.length + 1).padStart(12, '0')}`;
    state.approvals.push({ id, ...row });
    return j({ id }, 201);
  }
  if (url.includes('/rest/v1/rpc/remember_import_labels')) {
    state.rememberCalls.push(JSON.parse(body || '{}'));
    return j(1);
  }
  if (url.includes('api.anthropic.com')) {
    state.modelRequests.push({ headers: init?.headers, body: JSON.parse(body || '{}') });
    const replies = o.replies ?? [];
    const r = replies[Math.min(state.replyIndex, replies.length - 1)];
    state.replyIndex += 1;
    if (!r) return j({ type: 'error', error: { type: 'api_error', message: 'no scripted reply' } }, 500);
    if (r.kind === 'network') throw new TypeError('network connection lost');
    if (r.kind === 'http') return j(r.body, r.status, { 'request-id': 'req_test_0001', ...(r.headers ?? {}) });
    if (r.kind === 'hang') {
      return await new Promise<Response>((_, reject) => {
        const sig = init?.signal;
        sig?.addEventListener('abort', () => reject(sig.reason ?? new DOMException('aborted', 'AbortError')));
      });
    }
    if (r.kind === 'text') {
      return j({ id: 'msg_t', type: 'message', role: 'assistant', stop_reason: 'end_turn', content: [{ type: 'text', text: r.text }], usage: { input_tokens: 10, output_tokens: 5 } }, 200, { 'request-id': 'req_test_0002' });
    }
    const content: any[] = [];
    if (r.text) content.push({ type: 'thinking', thinking: '', signature: 'sig' });
    content.push({ type: 'tool_use', id: 'toolu_t', name: r.name ?? 'submit_program', input: r.input });
    return j({ id: 'msg_t', type: 'message', role: 'assistant', stop_reason: r.stop_reason ?? 'tool_use', content, usage: { input_tokens: 1000, output_tokens: 200 } }, 200, { 'request-id': 'req_test_0003' });
  }
  throw new Error('unexpected fetch ' + method + ' ' + url);
}) as typeof fetch;

const consoleLines: string[] = [];
for (const level of ['log', 'error', 'warn'] as const) {
  const orig = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    consoleLines.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
    if (Deno.env.get('BOOKING_IMPORT_TEST_VERBOSE')) orig(...args);
  };
}

const mod = await import('../handler.ts');
export const handler = mod.handler;
export const internals = mod;

export async function run(payload: unknown, opts: RunOptions = {}): Promise<RunResult> {
  state.opts = opts;
  state.modelRequests = [];
  state.logRows = [];
  state.rememberCalls = [];
  state.approvals = [];
  state.replyIndex = 0;
  consoleLines.length = 0;
  if (opts.apiKey === false) Deno.env.delete('ANTHROPIC_API_KEY');
  else Deno.env.set('ANTHROPIC_API_KEY', FAKE_API_KEY);
  const res = await handler(new Request('http://localhost/booking-import', {
    method: 'POST',
    headers: { Authorization: 'Bearer test-user-token', 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  }));
  const json = await res.json();
  // fire-and-forget writes (label lessons) land a moment later
  await new Promise((r) => setTimeout(r, 40));
  return {
    status: res.status,
    json,
    modelRequests: state.modelRequests.map((m) => m.body),
    logRows: state.logRows,
    rememberCalls: state.rememberCalls,
    approvals: state.approvals,
    consoleLines: [...consoleLines],
  };
}

const FIXTURES = new URL('./fixtures/', import.meta.url);

export async function fixtureFile(name: string): Promise<{ fileName: string; contentBase64: string }> {
  const bytes = await Deno.readFile(new URL(name, FIXTURES));
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { fileName: name, contentBase64: btoa(s) };
}

export async function fixtureText(name: string): Promise<string> {
  return await Deno.readTextFile(new URL(name, FIXTURES));
}

export function textFile(text: string, fileName = 'order.txt') {
  return { fileName, contentBase64: btoa(unescape(encodeURIComponent(text))) };
}

export const tool = (input: unknown, extra: Partial<{ stop_reason: string; name: string }> = {}): ModelReply => ({ kind: 'tool', input, ...extra });
export const program = (...services: unknown[]): ModelReply => ({ kind: 'tool', name: 'submit_program', input: { services } });
export const single = (input: unknown): ModelReply => ({ kind: 'tool', name: 'submit_booking', input });

/** Tbilisi wall clock of an instant, "YYYY-MM-DD HH:MM". */
export function tb(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(Date.parse(iso) + 4 * 3600e3).toISOString().slice(0, 16).replace('T', ' ');
}

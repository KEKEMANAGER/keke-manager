// The model-call layer: one request shape per model family, retries only where
// they help, and failure lines that are safe to log.
import { assert, assertEquals } from './assert.ts';
import { buildRequest, callTool, callWithFallback, failureClientCode, failureCode, failureMessageKa, profileFor, usageCode } from '../ai.ts';

const tool = { name: 'submit_program', description: 'x', input_schema: { type: 'object', properties: {} } };
const base = { system: 'S', tool, content: 'C', maxTokens: 8192 };

Deno.test('profiles: 4.x models are classic, 5.x models are v5', () => {
  assertEquals(profileFor('claude-sonnet-4-5'), 'classic');
  assertEquals(profileFor('claude-sonnet-4-5-20250929'), 'classic');
  assertEquals(profileFor('claude-sonnet-4-6'), 'classic');
  assertEquals(profileFor('claude-haiku-4-5'), 'classic');
  assertEquals(profileFor('claude-sonnet-5-5'), 'v5');
  assertEquals(profileFor('claude-sonnet-5'), 'v5');
  assertEquals(profileFor('claude-haiku-5-5'), 'v5');
});

Deno.test('classic request: forced tool, no thinking, no sampling parameters', () => {
  const b = buildRequest({ ...base, model: 'claude-sonnet-4-6' });
  assertEquals(b.tool_choice, { type: 'tool', name: 'submit_program' });
  assertEquals(b.max_tokens, 8192);
  for (const k of ['thinking', 'temperature', 'top_p', 'top_k', 'output_config']) assert(!(k in b), k);
});

Deno.test('v5 request (claude-sonnet-5-5): auto tool choice, lowest thinking, effort, room for thinking, no sampling', () => {
  const b = buildRequest({ ...base, model: 'claude-sonnet-5-5', effort: 'low' });
  assertEquals(b.tool_choice, { type: 'auto' });
  assertEquals(b.thinking, { type: 'between_tools' });
  assertEquals(b.output_config, { effort: 'low' });
  assert((b.max_tokens as number) >= 16000);
  assert(String(b.system).includes('submit_program'));
  for (const k of ['temperature', 'top_p', 'top_k']) assert(!(k in b), k);
});

function fakeFetch(replies: (() => Response | Promise<Response>)[]) {
  let i = 0;
  const seen: RequestInit[] = [];
  const f = ((_url: string, init?: RequestInit) => {
    seen.push(init ?? {});
    const r = replies[Math.min(i, replies.length - 1)];
    i += 1;
    return Promise.resolve(r());
  }) as unknown as typeof fetch;
  return { f, seen, count: () => i };
}
const ok = (input: unknown, stop = 'tool_use') => () => new Response(JSON.stringify({ stop_reason: stop, content: [{ type: 'thinking', thinking: '' }, { type: 'tool_use', name: 'submit_program', input }], usage: { input_tokens: 5, output_tokens: 3 } }), { status: 200, headers: { 'request-id': 'req_ok' } });
const err = (status: number, type: string, message: string) => () => new Response(JSON.stringify({ type: 'error', error: { type, message } }), { status, headers: { 'request-id': 'req_err' } });
const call = (f: typeof fetch, now = 0) => callTool({ apiKey: 'sk-ant-secret-xyz', body: { model: 'claude-sonnet-4-6' }, toolName: 'submit_program', timeoutMs: 1000, deadline: 1e15, fetchImpl: f, sleep: async () => {}, now: () => now });

Deno.test('callTool: reads the tool input past a thinking block', async () => {
  const { f } = fakeFetch([ok({ services: [1] })]);
  const r = await call(f);
  assert(r.ok);
  if (r.ok) assertEquals([r.toolInput, r.attempts, r.usage], [{ services: [1] }, 1, { input: 5, output: 3 }]);
});

Deno.test('callTool: one retry on 529, 429, 5xx and a dropped connection; none on 400/401/404', async () => {
  for (const [status, type] of [[529, 'overloaded_error'], [429, 'rate_limit_error'], [500, 'api_error'], [503, 'api_error']] as const) {
    const { f, count } = fakeFetch([err(status, type, 'x'), ok({ services: [] })]);
    const r = await call(f);
    assertEquals([r.ok, count()], [true, 2], String(status));
  }
  const net = fakeFetch([() => { throw new TypeError('connection reset'); }, ok({})]);
  assertEquals((await call(net.f)).ok, true);
  for (const [status, type, hint] of [[400, 'invalid_request_error', 'credit_balance'], [401, 'authentication_error', 'auth'], [404, 'not_found_error', 'model_not_found']] as const) {
    const { f, count } = fakeFetch([err(status, type, status === 400 ? 'Your credit balance is too low' : 'x'), ok({})]);
    const r = await call(f);
    assertEquals([r.ok, count()], [false, 1]);
    if (!r.ok) assertEquals(r.failure.hint, hint);
  }
});

Deno.test('callTool: no retry when the time left is too short', async () => {
  const { f, count } = fakeFetch([err(529, 'overloaded_error', 'x'), ok({})]);
  const r = await callTool({ apiKey: 'k', body: { model: 'm' }, toolName: 'submit_program', timeoutMs: 1000, deadline: 10_000, fetchImpl: f, sleep: async () => {}, now: () => 0 });
  assertEquals([r.ok, count()], [false, 1]);
});

Deno.test('callTool: refusal, cut-off answer, and an answer with no tool call', async () => {
  const refusal = await call(fakeFetch([ok({}, 'refusal')]).f);
  assert(!refusal.ok && refusal.failure.kind === 'refusal');
  const cut = await call(fakeFetch([ok({ services: [1] }, 'max_tokens')]).f);
  assert(cut.ok && cut.truncated);
  const text = () => new Response(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'here you go' }] }), { status: 200 });
  const { f, count } = fakeFetch([text, text]);
  const r = await call(f);
  assert(!r.ok && r.failure.kind === 'no_tool');
  assertEquals(count(), 2);
  const retried = await call(fakeFetch([text, ok({ services: [] })]).f);
  assert(retried.ok);
});

Deno.test('callTool: no key means no request at all', async () => {
  const { f, count } = fakeFetch([ok({})]);
  const r = await callTool({ apiKey: '', body: { model: 'm' }, toolName: 't', timeoutMs: 1000, deadline: 1e15, fetchImpl: f });
  assert(!r.ok && r.failure.kind === 'no_key');
  assertEquals(count(), 0);
});

Deno.test('failure lines carry status, type, hint and request id — never the key or the API text', async () => {
  const { f } = fakeFetch([err(400, 'invalid_request_error', 'Your credit balance is too low; your request had Pieter +31 6 1234 5678')]);
  const r = await call(f);
  assert(!r.ok);
  if (!r.ok) {
    const line = failureCode(r.failure);
    assertEquals(line, 'ai_failed kind=http status=400 type=invalid_request_error hint=credit_balance attempts=1 model=claude-sonnet-4-6 req=req_err');
    assert(!line.includes('sk-ant') && !line.includes('Pieter'));
    assertEquals(failureMessageKa(r.failure), 'AI წაკითხვა დროებით მიუწვდომელია.');
  }
});

// ---------------------------------------------------------------- a retired model

const fb = (f: typeof fetch, o: Partial<{ model: string; fallbackModel: string | null; deadline: number; now: number }> = {}) =>
  callWithFallback({
    apiKey: 'sk-ant-secret-xyz',
    request: { system: 'S', tool, content: 'C', maxTokens: 8192 },
    model: o.model ?? 'claude-sonnet-4-5',
    fallbackModel: o.fallbackModel === undefined ? 'claude-sonnet-4-6' : o.fallbackModel,
    toolName: 'submit_program',
    timeoutMs: 1000,
    deadline: o.deadline ?? 1e15,
    fetchImpl: f,
    sleep: async () => {},
    now: () => o.now ?? 0,
  });
const modelOf = (init: RequestInit) => JSON.parse(String(init.body)).model;

Deno.test('a retired model (404, or a 400 that says so): one call to the fallback model', async () => {
  for (const reply of [err(404, 'not_found_error', 'model: claude-sonnet-4-5'), err(400, 'invalid_request_error', 'The model claude-sonnet-4-5 has been retired')]) {
    const { f, seen, count } = fakeFetch([reply, ok({ services: [] })]);
    const r = await fb(f);
    assert(r.ok && r.fellBack);
    assertEquals(count(), 2);
    assertEquals(seen.map(modelOf), ['claude-sonnet-4-5', 'claude-sonnet-4-6']);
  }
});

Deno.test('no fallback for other failures, for the same model, without a fallback, or with no time left', async () => {
  const busy = fakeFetch([err(529, 'overloaded_error', 'x'), err(529, 'overloaded_error', 'x'), ok({})]);
  const r1 = await fb(busy.f);
  assert(!r1.ok && !r1.fellBack);
  assertEquals(busy.seen.map(modelOf), ['claude-sonnet-4-5', 'claude-sonnet-4-5']);
  const same = fakeFetch([err(404, 'not_found_error', 'x'), ok({})]);
  assertEquals([(await fb(same.f, { model: 'claude-sonnet-4-6' })).ok, same.count()], [false, 1]);
  const none = fakeFetch([err(404, 'not_found_error', 'x'), ok({})]);
  assertEquals([(await fb(none.f, { fallbackModel: null })).ok, none.count()], [false, 1]);
  const late = fakeFetch([err(404, 'not_found_error', 'x'), ok({})]);
  assertEquals([(await fb(late.f, { deadline: 1000, now: 0 })).ok, late.count()], [false, 1]);
});

Deno.test('the app is told what kind of failure it was, with a code it can translate', () => {
  const f = (kind: string, hint: string | null = null) => ({ kind, hint, status: null, type: null, requestId: null, attempts: 1, model: 'm' }) as any;
  assertEquals(failureClientCode(f('timeout')), 'ai_timeout');
  assertEquals(failureClientCode(f('refusal')), 'ai_refused');
  assertEquals(failureClientCode(f('no_tool')), 'ai_incomplete');
  assertEquals(failureClientCode(f('context')), 'ai_incomplete');
  assertEquals(failureClientCode(f('network')), 'ai_busy');
  assertEquals(failureClientCode(f('no_key')), 'ai_unavailable');
  for (const h of ['rate_limit', 'overloaded', 'server_error']) assertEquals(failureClientCode(f('http', h)), 'ai_busy');
  for (const h of ['credit_balance', 'auth', 'model_not_found', null]) assertEquals(failureClientCode(f('http', h)), 'ai_unavailable');
});

Deno.test('token use is logged as numbers and a model name only', () => {
  assertEquals(usageCode('claude-sonnet-4-6', { input: 1234.4, output: 567 }), 'ai_usage model=claude-sonnet-4-6 in=1234 out=567');
  assertEquals(usageCode('claude-sonnet-4-6', { input: 10, output: 2 }, true), 'ai_usage model=claude-sonnet-4-6 in=10 out=2 fallback=1');
  assertEquals(usageCode('claude-sonnet-4-6', null), null);
  assert(!String(usageCode('sk-ant-api03-SECRET Pieter +31 6', { input: 1, output: 1 })).includes('Pieter'));
});

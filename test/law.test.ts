import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { once } from 'node:events';
import { test } from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createHttpServer } from '../src/http.js';
import { createLawClient, lawApiOrigin, type LawTransport, type LawResponse } from '../src/law/client.js';
import { createLawTools } from '../src/law/tools.js';
import { articleCode, getLawInput, getLawOutput, lawLimits, LawApiError, searchLawsInput, searchLawsOutput } from '../src/law/schema.js';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/law/${name}.json`, import.meta.url), 'utf8'));
const secret = 'fixture-private-credential';
function response(body: unknown, statusCode = 200, headers: LawResponse['headers'] = { 'content-type': 'application/json;charset=UTF-8' }): LawResponse {
  return { statusCode, headers, body: Readable.from([Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]) };
}
const signal = () => new AbortController().signal;
const hasCode = (code: string) => (error: unknown) => error instanceof LawApiError && error.code === code && !error.message.includes(secret);

function setup(transport?: LawTransport) {
  const calls: URL[] = [];
  const client = createLawClient({ oc: secret, transport: transport ?? (async url => { calls.push(url); return response(fixture(url.pathname.endsWith('lawSearch.do') ? 'search' : 'article')); }) });
  return { client, tools: createLawTools(client), calls };
}

test('official sample fixture: search identifiers lead to versioned article, raw subparagraph text and safe evidence', async () => {
  const { tools, calls } = setup();
  const found = searchLawsOutput.parse(await tools.search({ query: '국민연금법', display: 2 }, signal()));
  assert.equal(found.laws[1].lawId, '006709');
  assert.equal(found.laws[1].masterId, '283561');
  assert.equal(found.laws[1].version, '현행');
  const row = found.laws[1];
  const law = getLawOutput.parse(await tools.get({ masterId: row.masterId, effectiveDate: row.effectiveDate, article: 2 }, signal()));
  assert.equal(law.retrievalMode, 'version_by_master');
  assert.equal(law.lawId, row.lawId);
  assert.equal(law.effectiveDate, '20260213');
  assert.equal(law.articles[0].jo, '000200');
  assert.equal(law.articles[0].title, '기준소득월액의 변경 신청');
  assert.match(law.articles[0].text, /②.*대리인/);
  assert.match(law.articles[0].text, /1\. 지역가입자/);
  assert.equal(calls[0].origin, lawApiOrigin);
  assert.equal(calls[0].searchParams.get('OC'), secret);
  assert.equal(calls[0].searchParams.get('target'), 'eflaw');
  assert.equal(calls[0].searchParams.get('type'), 'JSON');
  assert.equal(calls[0].searchParams.get('nw'), '3');
  assert.equal(calls[1].searchParams.get('MST'), row.masterId);
  assert.equal(calls[1].searchParams.get('efYd'), '20260213');
  assert.equal(calls[1].searchParams.get('JO'), '000200');
  assert.ok(!calls[1].searchParams.has('ID'));
  assert.match(law.sourceUrl, /^https:\/\/www.law.go.kr\/LSW\/lsInfoP.do\?/);
  assert.doesNotMatch(JSON.stringify({ found, law }), /fixture-private|OC=/i);
  assert.ok(law.retrievedAt && law.provider);
});

test('ID is current only, full main articles are bounded, and JO branch conversion is exact', async () => {
  const { tools, calls } = setup();
  const law = await tools.get({ lawId: '006709' }, signal());
  assert.equal(law.retrievalMode, 'current_by_id');
  assert.equal(law.masterId, null); // Do not invent an MST missing from API metadata.
  assert.equal(law.scope, 'main_articles');
  assert.equal(calls[0].searchParams.get('ID'), '006709');
  assert.ok(!calls[0].searchParams.has('efYd'));
  assert.ok(!calls[0].searchParams.has('JO'));
  assert.equal(articleCode(10, 2), '001002');
  const data = fixture('article');
  data.법령.조문.조문단위.조문번호 = '10';
  data.법령.조문.조문단위.조문가지번호 = '2';
  const branch = setup(async url => { assert.equal(url.searchParams.get('JO'), '001002'); return response(data); });
  assert.equal((await branch.tools.get({ lawId: '006709', article: 10, articleBranch: 2 }, signal())).articles[0].branch, 2);
});


test('article parser preserves singleton/array paragraph, subparagraph and item text without model rewriting', async () => {
  const data = fixture('article');
  data.법령.조문.조문단위.항 = { 항내용: ['① 원문 첫 줄', '원문 다음 줄'], 호: { 호내용: '1. 호 원문', 목: [{ 목내용: '가. 목 원문' }] } };
  const { tools } = setup(async () => response(data));
  const result = await tools.get({ lawId: '006709', article: 2 }, signal());
  assert.match(result.articles[0].text, /① 원문 첫 줄\n원문 다음 줄\n1\. 호 원문\n가\. 목 원문/);
});

test('input contracts reject invalid IDs, contradictory dates, malformed article requests and excessive search', () => {
  for (const value of [{}, { lawId: 'bad' }, { masterId: '283561' }, { lawId: '006709', masterId: '283561', effectiveDate: '20260213' },
    { lawId: '006709', effectiveDate: '20260213' }, { masterId: '283561', effectiveDate: '20260230' },
    { lawId: '006709', articleBranch: 2 }, { lawId: '006709', article: 0 }, { lawId: '006709', article: 10000 },
    { lawId: '006709', url: 'https://attacker.test' }]) assert.equal(getLawInput.safeParse(value).success, false);
  for (const value of [{ query: '' }, { query: 'x', display: 11 }, { query: 'x', page: 101 }, { query: 'x', OC: secret }, { query: 'x', version: 'future' }]) assert.equal(searchLawsInput.safeParse(value).success, false);
});

test('empty search is genuinely zero; version filters and singleton results preserve API version labels', async () => {
  const { tools } = setup(async () => response(fixture('zero')));
  assert.deepEqual((await tools.search({ query: 'no-match' }, signal())).laws, []);
  for (const [version, nw, label] of [['historical', '1', '연혁'], ['scheduled', '2', '시행예정'], ['all', '1,2,3', '현행']] as const) {
    const data = fixture('search'); data.LawSearch.law = { ...data.LawSearch.law[0], 현행연혁코드: label };
    const { tools } = setup(async url => { assert.equal(url.searchParams.get('nw'), nw); return response(data); });
    assert.equal((await tools.search({ query: '국민연금법', version }, signal())).laws[0].version, label);
  }
  const data = fixture('search'); delete data.LawSearch.law;
  await assert.rejects(setup(async () => response(data)).tools.search({ query: 'x' }, signal()), hasCode('law_api_invalid_response'));
});

test('JSON/XML/schema drift and API errors fail closed instead of inventing evidence or zero results', async t => {
  const logs: unknown[] = []; t.mock.method(console, 'error', (...items: unknown[]) => logs.push(items));
  for (const [code, make] of [
    ['law_api_auth_failed', () => response(secret, 401)],
    ['law_api_auth_failed', () => response(secret, 403)],
    ['law_api_http_error', () => response(secret, 503)],
    ['law_api_redirect_blocked', () => response('', 302, { location: `http://attacker.test/?OC=${secret}` })],
    ['law_api_unexpected_format', () => response('<LawSearch/>', 200, { 'content-type': 'application/xml' })],
    ['law_api_invalid_response', () => response('<html>auth failed</html>')],
    ['law_api_invalid_response', () => response({ changedShape: 'not a success' })],
    ['law_api_rejected', () => response({ LawSearch: { resultCode: '99', target: 'eflaw', totalCnt: '0', page: '1' } })],
    ['law_api_network_error', () => { throw new Error(`request with OC=${secret}`); }],
  ] as const) {
    let requests = 0;
    const { tools } = setup(async () => { requests++; return make(); });
    await assert.rejects(tools.search({ query: 'x' }, signal()), hasCode(code));
    assert.equal(requests, 1); // No redirect or retry including HTTPS -> HTTP.
  }
  assert.deepEqual(logs, []);
});

test('missing credentials, request cancellation, response limits and reflected secrets are safe errors', async () => {
  const unconfigured = createLawTools(createLawClient({ transport: async () => { throw new Error('must not call'); } }));
  await assert.rejects(unconfigured.search({ query: 'x' }, signal()), hasCode('law_api_not_configured'));
  const controller = new AbortController();
  const { tools } = setup(async () => new Promise(() => {}));
  const pending = tools.search({ query: 'x' }, controller.signal); controller.abort();
  await assert.rejects(pending, hasCode('law_api_timeout'));
  await assert.rejects(setup(async () => response('x'.repeat(lawLimits.maxResponseBytes + 1))).tools.search({ query: 'x' }, signal()), hasCode('law_api_response_too_large'));
  const reflected = fixture('search'); reflected.LawSearch.law[0].법령명한글 = secret;
  await assert.rejects(setup(async () => response(reflected)).tools.search({ query: 'x' }, signal()), hasCode('law_api_sensitive_response'));
  const escaped = createLawClient({ oc: 'sp ace\"@' });
  assert.throws(() => escaped.safeOutput({ text: 'sp ace\"@' }), hasCode('law_api_sensitive_response'));
  assert.throws(() => escaped.safeOutput({ text: 'sp+ace%22%40' }), hasCode('law_api_sensitive_response'));
  const link = fixture('search'); link.LawSearch.law[0].법령상세링크 = `https://attacker.test/?OC=${secret}`;
  assert.doesNotMatch(JSON.stringify(await setup(async () => response(link)).tools.search({ query: 'x' }, signal())), /attacker|fixture-private|OC=/i);
});

test('wrong law/version/article and oversized or empty article data cannot become evidence', async () => {
  const data = fixture('article');
  await assert.rejects(setup().tools.get({ lawId: '999999', article: 2 }, signal()), hasCode('law_api_version_mismatch'));
  await assert.rejects(setup().tools.get({ masterId: '283561', effectiveDate: '20250101', article: 2 }, signal()), hasCode('law_api_version_mismatch'));
  await assert.rejects(setup().tools.get({ lawId: '006709', article: 3 }, signal()), hasCode('law_api_article_mismatch'));
  data.법령.조문.조문단위.조문내용 = 'x'.repeat(lawLimits.maxOutputChars + 1);
  await assert.rejects(setup(async () => response(data)).tools.get({ lawId: '006709', article: 2 }, signal()), hasCode('law_api_result_too_large'));
  data.법령.조문.조문단위 = Array.from({ length: 21 }, (_, index) => ({ 조문번호: String(index + 1), 조문여부: '조문', 조문내용: '원문' }));
  await assert.rejects(setup(async () => response(data)).tools.get({ lawId: '006709' }, signal()), hasCode('law_api_result_too_large'));
  data.법령.조문.조문단위 = [];
  await assert.rejects(setup(async () => response(data)).tools.get({ lawId: '006709' }, signal()), hasCode('law_api_no_articles'));
});

test('law budget is shared across search/get and limits concurrent external work', async () => {
  let now = 0;
  const client = createLawClient({ oc: secret, now: () => now, transport: async () => response(fixture('zero')) });
  for (let i = 0; i < lawLimits.maxCallsPerMinute; i++) await client.call(i % 2 ? 'lawSearch.do' : 'lawService.do', {}, signal());
  await assert.rejects(client.call('lawSearch.do', {}, signal()), hasCode('law_api_budget_exceeded'));
  now = 60_000; await client.call('lawSearch.do', {}, signal());
  const releases: (() => void)[] = [];
  const concurrent = createLawClient({ oc: secret, transport: async () => { await new Promise<void>(resolve => releases.push(resolve)); return response(fixture('zero')); } });
  const first = concurrent.call('lawSearch.do', {}, signal()); const second = concurrent.call('lawService.do', {}, signal());
  await assert.rejects(concurrent.call('lawSearch.do', {}, signal()), hasCode('law_api_budget_exceeded'));
  releases.forEach(release => release()); await Promise.all([first, second]);
});

test('MCP feature flag defaults off, only literal true enables tools, no key is needed to start', async t => {
  const previous = process.env.ENABLE_LAW_API;
  const oldOc = process.env.LAW_API_OC;
  delete process.env.LAW_API_OC;
  t.after(() => { if (previous === undefined) delete process.env.ENABLE_LAW_API; else process.env.ENABLE_LAW_API = previous; if (oldOc !== undefined) process.env.LAW_API_OC = oldOc; });
  for (const flag of [undefined, 'false', 'TRUE', 'true']) {
    if (flag === undefined) delete process.env.ENABLE_LAW_API; else process.env.ENABLE_LAW_API = flag;
    const server = createHttpServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); assert.ok(address && typeof address !== 'string');
    const client = new Client({ name: 'law-flag', version: '1' });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`)));
      assert.equal((await client.listTools()).tools.length, flag === 'true' ? 5 : 3);
      const old = await client.callTool({ name: 'check_procedure_readiness', arguments: { procedure: 'test' } }); assert.ok(!old.isError);
      if (flag === 'true') {
        const result = await client.callTool({ name: 'search_official_laws', arguments: { query: '국민연금법' } });
        assert.equal(result.isError, true); assert.equal(result.structuredContent, undefined);
        assert.equal(JSON.parse((result.content[0] as { text: string }).text).error.code, 'law_api_not_configured');
        assert.match(JSON.parse((result.content[0] as { text: string }).text).error.message, /LAW_API_OC/);
      }
    } finally { await client.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  }
});

test('enabled MCP tools preserve content equality and credentials stay private for legacy/modern clients', async t => {
  const server = createHttpServer({ enableLawApi: true, lawOc: secret, lawTransport: async url => response(fixture(url.pathname.endsWith('lawSearch.do') ? 'search' : 'article')) });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  for (const mode of ['legacy', 'auto'] as const) {
    const client = new Client({ name: 'law-http', version: '1' }, { versionNegotiation: { mode } });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`)));
      const search = await client.callTool({ name: 'search_official_laws', arguments: { query: '국민연금법' } });
      assert.ok(!search.isError); searchLawsOutput.parse(search.structuredContent);
      const get = await client.callTool({ name: 'get_official_law', arguments: { masterId: '283561', effectiveDate: '20260213', article: 2 } });
      assert.ok(!get.isError); getLawOutput.parse(get.structuredContent);
      for (const result of [search, get]) {
        assert.deepEqual(JSON.parse((result.content[0] as { text: string }).text), result.structuredContent);
        assert.ok(!JSON.stringify(result).includes(secret));
      }
      const invalid = await client.callTool({ name: 'get_official_law', arguments: { lawId: '006709', effectiveDate: '20260213' } });
      assert.equal(invalid.isError, true);
    } finally { await client.close(); }
  }
});

import assert from 'node:assert/strict';
import { once } from 'node:events';
import { test } from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createHttpServer } from '../src/http.js';
import { createOfficialSourceReader, officialReadLimits, readSourceOutput, sourceListOutput } from '../src/official-sources.js';
import { ResearchError, type Source } from '../src/research/schema.js';

const url = 'https://nps.or.kr/guide';
const link = 'https://nps.or.kr/next';
const text = '기준소득월액 변경 안내의 테스트 원문입니다. 전화 외 신청 경로의 존재와 사용자별 조건은 구분하여 확인해야 합니다.';
const source = (address: string): Source => ({ id: 'fixture', url: address, text, links: [link], retrievedAt: '2026-10-25T00:00:00.000Z' });

test('keyless official tools over legacy and modern HTTP return real fetcher output, links, safe failures and strict inputs', async t => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  t.after(() => { if (previous !== undefined) process.env.OPENAI_API_KEY = previous; });
  const seen: string[] = [];
  const server = createHttpServer({ sourceFetcher: async address => {
    seen.push(address);
    if (address.endsWith('/failure')) throw new ResearchError('source_http_error', 'private upstream details');
    return source(address);
  } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  for (const mode of ['legacy', 'auto'] as const) {
    const client = new Client({ name: 'sources-test', version: '1' }, { versionNegotiation: { mode } });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`)));
      const listed = await client.listTools();
      assert.ok(listed.tools.some(tool => tool.name === 'read_official_source'));
      const seeds = await client.callTool({ name: 'list_official_procedure_sources', arguments: {} });
      assert.ok(!seeds.isError);
      assert.ok(sourceListOutput.parse(seeds.structuredContent).sources.every(item => item.previouslyResearched));
      assert.deepEqual(JSON.parse((seeds.content[0] as { text: string }).text), seeds.structuredContent);
      for (const address of [url, link]) {
        const read = await client.callTool({ name: 'read_official_source', arguments: { url: address } });
        assert.ok(!read.isError);
        const result = readSourceOutput.parse(read.structuredContent);
        assert.equal(result.text, text);
        assert.equal(result.url, address);
        assert.equal(result.institution, '국민연금공단');
        assert.deepEqual(result.links, [link]);
        assert.deepEqual(JSON.parse((read.content[0] as { text: string }).text), result);
      }
      const before = seen.length;
      for (const address of ['http://nps.or.kr/guide', 'https://localhost/', 'https://nps.or.kr.attacker.test/']) {
        const blocked = await client.callTool({ name: 'read_official_source', arguments: { url: address } });
        assert.equal(blocked.isError, true);
        assert.equal(blocked.structuredContent, undefined);
        assert.equal(JSON.parse((blocked.content[0] as { text: string }).text).error.code, 'blocked_url');
      }
      assert.equal(seen.length, before);
      const failed = await client.callTool({ name: 'read_official_source', arguments: { url: 'https://nps.or.kr/failure' } });
      assert.equal(failed.isError, true);
      assert.equal(failed.structuredContent, undefined);
      assert.doesNotMatch(JSON.stringify(failed), /private upstream/);
      if (mode === 'auto') {
        const exhausted = await client.callTool({ name: 'read_official_source', arguments: { url } });
        assert.equal(exhausted.isError, true);
        assert.equal(JSON.parse((exhausted.content[0] as { text: string }).text).error.code, 'source_budget_exceeded');
      }
      const invalid = await client.callTool({ name: 'read_official_source', arguments: { url, name: 'unused' } });
      assert.equal(invalid.isError, true);
    } finally { await client.close(); }
  }
});

test('read budgets count failures and persist across calls, reset after one minute, bound concurrency', async () => {
  let now = 0;
  const reader = createOfficialSourceReader(async address => source(address), () => now);
  for (let count = 0; count < officialReadLimits.maxCallsPerMinute; count++) await assert.rejects(reader('http://nps.or.kr/', new AbortController().signal));
  await assert.rejects(reader(url, new AbortController().signal), error => error instanceof ResearchError && error.code === 'source_budget_exceeded');
  now = 60_000;
  assert.equal((await reader(url, new AbortController().signal)).status, 'read');
  const releases: (() => void)[] = [];
  const concurrent = createOfficialSourceReader(async address => { await new Promise<void>(resolve => releases.push(resolve)); return source(address); });
  const first = concurrent(url, new AbortController().signal);
  const second = concurrent(url, new AbortController().signal);
  await assert.rejects(concurrent(url, new AbortController().signal), error => error instanceof ResearchError && error.code === 'source_budget_exceeded');
  releases.forEach(release => release());
  await Promise.all([first, second]);
});

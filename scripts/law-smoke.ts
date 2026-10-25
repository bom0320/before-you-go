import assert from 'node:assert/strict';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { searchLawsOutput, getLawOutput } from '../src/law/schema.js';

// Separate opt-in smoke: never target the existing public review server by default.
const target = process.argv.slice(2).find(value => !value.startsWith('--')) ?? 'http://127.0.0.1:3002/mcp';
const live = process.argv.includes('--live');
const client = new Client({ name: 'before-you-go-law-smoke', version: '0.1.0' });
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(target)));
  const names = (await client.listTools()).tools.map(tool => tool.name).sort();
  assert.deepEqual(names, ['check_procedure_readiness', 'get_official_law', 'list_official_procedure_sources', 'read_official_source', 'search_official_laws']);
  const test = await client.callTool({ name: 'check_procedure_readiness', arguments: { procedure: 'test' } });
  assert.ok(!test.isError);
  console.log('Opt-in law tools/list and existing test: passed');
  if (live) {
    const result = await client.callTool({ name: 'search_official_laws', arguments: { query: '국민연금법 시행규칙' } });
    assert.ok(!result.isError, JSON.stringify(result.content));
    const search = searchLawsOutput.parse(result.structuredContent);
    assert.deepEqual(JSON.parse((result.content[0] as { text: string }).text), search);
    const match = search.laws.find(law => law.title === '국민연금법 시행규칙');
    assert.ok(match, 'Expected law was not returned by API');
    const called = await client.callTool({ name: 'get_official_law', arguments: { masterId: match.masterId, effectiveDate: match.effectiveDate, article: 2 } });
    assert.ok(!called.isError, JSON.stringify(called.content));
    const law = getLawOutput.parse(called.structuredContent);
    assert.deepEqual(JSON.parse((called.content[0] as { text: string }).text), law);
    assert.equal(law.lawId, match.lawId);
    assert.equal(law.articles[0].jo, '000200');
    console.log('Live law API search → versioned article:', JSON.stringify(law, null, 2));
  } else console.log('Live API not called. For approved credentials configured on the development server, add --live.');
} finally { await client.close(); }

import assert from 'node:assert/strict';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { procedureOutput } from '../src/procedure/schema.js';

const live = process.argv.includes('--live');
const target = process.argv.slice(2).find(value => value !== '--live') ?? 'http://127.0.0.1:3000/mcp';
const client = new Client({ name: 'before-you-go-smoke', version: '0.1.0' });
try {
  await client.connect(new StreamableHTTPClientTransport(new URL(target)));
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map(tool => tool.name), ['check_procedure_readiness']);
  console.log('tools/list:', tools.tools.map(tool => tool.name));
  const called = await client.callTool({ name: 'check_procedure_readiness', arguments: { procedure: 'test' } });
  assert.ok(!called.isError);
  assert.equal((called.structuredContent as Record<string, unknown>)?.status, 'not_evaluated');
  console.log('test call: passed');
  for (const subscriberType of ['unknown', 'other']) {
    const result = await client.callTool({ name: 'check_procedure_readiness', arguments: { procedure: 'national_pension_premium_change', subscriberType } });
    assert.ok(!result.isError);
    const output = procedureOutput.parse(result.structuredContent);
    assert.equal(output.status, subscriberType === 'unknown' ? 'needs_information' : 'unsupported');
    assert.deepEqual(JSON.parse((result.content[0] as { text: string }).text), output);
    console.log(`preflight ${subscriberType}:`, output.status);
  }
  if (live) {
    const result = await client.callTool({ name: 'check_procedure_readiness', arguments: {
      procedure: 'national_pension_premium_change', goal: '국민연금 보험료를 올리고 싶은데 전화가 안 된다',
      subscriberType: 'voluntary', applicant: 'self', changeGoal: 'increase', unavailableChannel: 'phone',
    } }, { timeout: 120_000 });
    if (result.isError) {
      console.error('Live research failed:', result.content);
      process.exitCode = 1;
    } else {
      const output = procedureOutput.parse(result.structuredContent);
      assert.deepEqual(JSON.parse((result.content[0] as { text: string }).text), output);
      assert.ok(output.evidence.length > 0, 'live evidence must exist');
      assert.ok(output.evidence.every(item => item.sourceId && item.quote && item.retrievedAt));
      console.log('Live research:', JSON.stringify(output, null, 2));
    }
  } else console.log('Live API research not run. Use --live explicitly; the server needs OPENAI_API_KEY.');
} finally { await client.close(); }

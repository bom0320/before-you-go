import assert from 'node:assert/strict';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { procedureOutput } from '../src/procedure/schema.js';

const url = new URL(process.argv[2] ?? 'http://127.0.0.1:3000/mcp');
const client = new Client({ name: 'before-you-go-smoke', version: '0.1.0' });
try {
  await client.connect(new StreamableHTTPClientTransport(url));
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map(t => t.name), ['check_procedure_readiness']);
  console.log('tools/list:', JSON.stringify(tools.tools.map(tool => tool.name)));
  const result = await client.callTool({ name: 'check_procedure_readiness', arguments: { procedure: 'test' } });
  assert.equal(result.isError, undefined);
  assert.equal((result.structuredContent as Record<string, unknown>)?.status, 'not_evaluated');
  console.log('tools/call:', JSON.stringify(result));
  const scenarios = [
    { name: 'A', input: { subscriberType: 'unknown' }, status: 'needs_information' },
    { name: 'B', input: { subscriberType: 'voluntary', applicant: 'self', changeGoal: 'increase', unavailableChannel: 'phone' }, status: 'needs_verification' },
    { name: 'C', input: { subscriberType: 'voluntary', applicant: 'family', changeGoal: 'increase', unavailableChannel: 'phone' }, status: 'needs_verification' },
    { name: 'D', input: { subscriberType: 'other', applicant: 'self' }, status: 'unsupported' },
  ];
  for (const scenario of scenarios) {
    const called = await client.callTool({ name: 'check_procedure_readiness', arguments: {
      procedure: 'national_pension_premium_change', ...scenario.input,
    } });
    assert.ok(!called.isError);
    const output = procedureOutput.parse(called.structuredContent);
    assert.equal(output.status, scenario.status);
    assert.deepEqual(JSON.parse((called.content[0] as { text: string }).text), output);
    assert.ok(output.nextActions.every(action => action.kind !== 'use_channel'));
    console.log(`tools/call case ${scenario.name}:`, JSON.stringify({
      status: output.status, channels: output.channels.map(channel => channel.type),
      applicationUrl: output.channels.find(channel => channel.type === 'online')?.applicationUrl ?? null,
      evidenceIds: output.evidence.map(fact => fact.id),
    }));
  }
} finally {
  await client.close();
}

import assert from 'node:assert/strict';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';

const url = new URL(process.argv[2] ?? 'http://127.0.0.1:3000/mcp');
const client = new Client({ name: 'before-you-go-smoke', version: '0.1.0' });
try {
  await client.connect(new StreamableHTTPClientTransport(url));
  const tools = await client.listTools();
  assert.deepEqual(tools.tools.map(t => t.name), ['check_procedure_readiness']);
  console.log('tools/list:', JSON.stringify(tools));
  const result = await client.callTool({ name: 'check_procedure_readiness', arguments: { procedure: 'test' } });
  assert.equal(result.isError, undefined);
  assert.equal((result.structuredContent as Record<string, unknown>)?.status, 'not_evaluated');
  console.log('tools/call:', JSON.stringify(result));
} finally {
  await client.close();
}

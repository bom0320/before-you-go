import assert from 'node:assert/strict';
import { once } from 'node:events';
import { get } from 'node:http';
import { test } from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createHttpServer } from '../src/http.js';

test('HTTP MCP: legacy and modern clients, validation and HTTP guards', async t => {
  const server = createHttpServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const url = new URL(`http://127.0.0.1:${address.port}/mcp`);
  t.after(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  });
  for (const mode of ['legacy', 'auto'] as const) {
    await t.test(`${mode}: tools/list and tools/call`, async () => {
      const client = new Client({ name: 'test', version: '1.0.0' }, { versionNegotiation: { mode } });
      try {
        await client.connect(new StreamableHTTPClientTransport(url));
        assert.equal(client.getProtocolEra(), mode === 'legacy' ? 'legacy' : 'modern');
        const { tools } = await client.listTools();
        assert.deepEqual(tools.map(tool => tool.name), ['check_procedure_readiness']);
        assert.equal(tools[0].inputSchema.type, 'object');
        const result = await client.callTool({ name: 'check_procedure_readiness', arguments: { procedure: 'test' } });
        assert.ok(!result.isError);
        assert.equal((result.structuredContent as Record<string, unknown>)?.mode, 'test');
        assert.equal((result.structuredContent as Record<string, unknown>)?.status, 'not_evaluated');
        assert.deepEqual(JSON.parse((result.content[0] as { text: string }).text), result.structuredContent);
        for (const args of [{}, { procedure: 123 }, { procedure: 'pension' }, { procedure: 'test', secret: 'unused' }]) {
          const invalid = await client.callTool({ name: 'check_procedure_readiness', arguments: args });
          assert.equal(invalid.isError, true);
        }
      } finally { await client.close(); }
    });
  }
  assert.equal((await fetch(new URL('/other', url))).status, 404);
  assert.equal((await fetch(url, { headers: { Origin: 'https://untrusted.example' } })).status, 403);
  const hostStatus = await new Promise<number | undefined>((resolve, reject) => {
    get(url, { headers: { Host: 'untrusted.example' } }, res => {
      res.resume();
      resolve(res.statusCode);
    }).on('error', reject);
  });
  assert.equal(hostStatus, 403);
});

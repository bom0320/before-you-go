import assert from 'node:assert/strict';
import { once } from 'node:events';
import { get } from 'node:http';
import { test } from 'node:test';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { createHttpServer } from '../src/http.js';
import { procedureOutput } from '../src/procedure/schema.js';

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
        assert.deepEqual(result.structuredContent, {
          mode: 'test', status: 'not_evaluated',
          message: 'MCP 도구 호출 성공. 명시적인 테스트 응답이며 실제 행정 업무 준비 상태는 평가하지 않았습니다.',
        });
        assert.deepEqual(JSON.parse((result.content[0] as { text: string }).text), result.structuredContent);
        assert.equal(tools[0].outputSchema?.type, 'object');
        assert.match(JSON.stringify(tools[0].inputSchema), /national_pension_premium_change/);
        const cases = [
          { input: { subscriberType: 'unknown' }, status: 'needs_information' },
          { input: { subscriberType: 'voluntary', applicant: 'self', changeGoal: 'increase', unavailableChannel: 'phone' }, status: 'needs_verification' },
          { input: { subscriberType: 'voluntary', applicant: 'family', changeGoal: 'increase', unavailableChannel: 'phone' }, status: 'needs_verification' },
          { input: { subscriberType: 'other', applicant: 'self' }, status: 'unsupported' },
        ];
        for (const scenario of cases) {
          const called = await client.callTool({ name: 'check_procedure_readiness', arguments: {
            procedure: 'national_pension_premium_change', ...scenario.input,
          } });
          assert.ok(!called.isError);
          const output = procedureOutput.parse(called.structuredContent);
          assert.equal(output.status, scenario.status);
          assert.deepEqual(JSON.parse((called.content[0] as { text: string }).text), output);
          assert.ok(output.nextActions.every(action => action.kind !== 'use_channel'));
          if (scenario.status === 'needs_verification') assert.equal(output.channels.length, 4);
        }
        for (const args of [{}, { procedure: 123 }, { procedure: 'pension' }, { procedure: 'test', secret: 'unused' },
          { procedure: 'national_pension_premium_change', subscriberType: 'employee' },
          { procedure: 'national_pension_premium_change', unavailableChannel: 'fax' },
          { procedure: 'national_pension_premium_change', applicant: null },
          { procedure: 'national_pension_premium_change', name: 'not-collected' }]) {
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

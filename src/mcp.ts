import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';

// Provisional transport-test contract; no administrative eligibility rules.
export const readinessInput = z.strictObject({
  procedure: z.enum(['test']).describe('통신 검증용 고정값 test. 실제 업무명이나 개인정보를 입력하지 마세요.'),
});

export function createMcpServer() {
  const server = new McpServer({ name: 'before-you-go', version: '0.1.0' });
  server.registerTool('check_procedure_readiness', {
    title: '업무 준비 상태 확인 (테스트)',
    description: 'MCP 연결 검증용 테스트 도구입니다. 실제 국민연금 업무 규칙이나 준비 상태를 판단하지 않습니다. procedure에는 test만 입력하세요.',
    inputSchema: readinessInput,
    outputSchema: z.object({
      mode: z.literal('test'),
      status: z.literal('not_evaluated'),
      message: z.string(),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async () => {
    const result = {
      mode: 'test' as const,
      status: 'not_evaluated' as const,
      message: 'MCP 도구 호출 성공. 명시적인 테스트 응답이며 실제 행정 업무 준비 상태는 평가하지 않았습니다.',
    };
    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
  });
  return server;
}

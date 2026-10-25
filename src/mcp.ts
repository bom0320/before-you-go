import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { checkProcedureReadiness } from './procedure/check.js';
import { procedureInput, procedureOutput } from './procedure/schema.js';

const testInput = z.strictObject({ procedure: z.literal('test') });
export const readinessInput = z.discriminatedUnion('procedure', [testInput, procedureInput]);
const testOutput = z.strictObject({
  mode: z.literal('test'), status: z.literal('not_evaluated'), message: z.string(),
});
export const readinessOutput = z.discriminatedUnion('mode', [testOutput, procedureOutput]);

export function createMcpServer() {
  const server = new McpServer({ name: 'before-you-go', version: '0.1.0' });
  server.registerTool('check_procedure_readiness', {
    title: '국민연금 보험료 변경 절차 사전 점검',
    description: '국민연금 임의가입자의 보험료(기준소득월액) 변경, 신청 방법 확인, 전화 연결 실패 시 대체 신청 경로 탐색에 사용합니다. 가입 유형·실제 신청 주체·변경 방향을 확인하고 검증된 경로와 공식 근거, 추가 질문 및 미확인 조건을 반환합니다. 경로 존재와 개인의 이용 가능성을 구분하며 실제 민원 제출·인증·승인·신청 성공을 수행하거나 보장하지 않습니다. 개인정보는 입력하지 마세요. procedure=test는 기존 통신 검증용입니다.',
    inputSchema: readinessInput,
    outputSchema: readinessOutput,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async input => {
    const result = input.procedure === 'test' ? {
      mode: 'test' as const,
      status: 'not_evaluated' as const,
      message: 'MCP 도구 호출 성공. 명시적인 테스트 응답이며 실제 행정 업무 준비 상태는 평가하지 않았습니다.',
    } : checkProcedureReadiness(input);
    return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
  });
  return server;
}

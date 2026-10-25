import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { runResearch } from './research/run-research.js';
import { ResearchError } from './research/schema.js';
import type { ProcedureInput, ProcedureResult } from './procedure/schema.js';
import { procedureInput, procedureOutput } from './procedure/schema.js';

const testInput = z.strictObject({ procedure: z.literal('test') });
export const readinessInput = z.discriminatedUnion('procedure', [testInput, procedureInput]);
const testOutput = z.strictObject({
  mode: z.literal('test'), status: z.literal('not_evaluated'), message: z.string(),
});
export const readinessOutput = z.discriminatedUnion('mode', [testOutput, procedureOutput]);

export type ResearchRunner = (input: ProcedureInput, signal?: AbortSignal) => Promise<ProcedureResult>;
export function createMcpServer(options: { research?: ResearchRunner } = {}) {
  const server = new McpServer({ name: 'before-you-go', version: '0.1.0' });
  server.registerTool('check_procedure_readiness', {
    title: '국민연금 보험료 변경 절차 사전 점검',
    description: '국민연금 임의가입자의 보험료(기준소득월액) 변경, 신청 방법 확인, 전화 연결 실패 시 대체 신청 경로 탐색에 사용합니다. 가입 유형·실제 신청 주체·변경 방향과 짧은 goal을 바탕으로 제한된 실시간 공식 자료 조사와 원문 열람을 수행하고, 근거·경로 후보·추가 질문·미확인 조건을 반환합니다. API 설정 누락이나 조사 실패는 도구 오류입니다. 경로 존재와 개인의 이용 가능성을 구분하며 실제 민원 제출·인증·승인·신청 성공을 수행하거나 보장하지 않습니다. 개인정보는 입력하지 마세요. procedure=test는 기존 통신 검증용입니다.',
    inputSchema: readinessInput,
    outputSchema: readinessOutput,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async (input, context) => {
    try {
      const result = input.procedure === 'test' ? {
        mode: 'test' as const,
        status: 'not_evaluated' as const,
        message: 'MCP 도구 호출 성공. 명시적인 테스트 응답이며 실제 행정 업무 준비 상태는 평가하지 않았습니다.',
      } : await (options.research ?? ((value, signal) => runResearch(value, { signal })))(input, context.mcpReq.signal);
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    } catch (error) {
      // Tool errors are technical failures, not administrative uncertainty; no static fallback.
      const failure = error instanceof ResearchError ? error : new ResearchError('research_failed', '조사 결과를 검증하지 못했습니다.');
      return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: { code: failure.code, message: failure.message } }) }] };
    }
  });
  return server;
}

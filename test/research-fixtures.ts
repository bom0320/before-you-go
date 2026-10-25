import type { ProcedureInput } from '../src/procedure/schema.js';
import type { Completion, ResearchDependencies, ResearchContext, Source } from '../src/research/schema.js';

// Synthetic document fixtures, not statements about live government procedures.
export const businessInput: ProcedureInput = {
  procedure: 'national_pension_premium_change', subscriberType: 'voluntary',
  applicant: 'self', changeGoal: 'increase', unavailableChannel: 'phone',
};
export const fixtureText = '테스트 원문: 임의가입자의 기준소득월액 변경은 인터넷 신청 경로로 안내합니다. 본인 및 대리인의 이용 조건은 별도 확인이 필요합니다.';
export function fixtureCompletion(context: ResearchContext, channel: 'online' | 'visit' = 'online'): Completion {
  const source = context.sources[0];
  return {
    type: 'complete', findings: [{ key: 'route', sourceId: source.id, quote: source.text, claim: `${channel} 경로가 원문에 안내됩니다.`, scope: '테스트 원문의 임의가입자 변경 경로 존재만 확인. 사용자별 이용 조건 미확인.' }],
    draft: {
      mode: 'procedure_check', status: 'needs_verification', summary: `원문에서 ${channel} 경로를 확인했지만 개별 이용 조건은 확인이 필요합니다.`,
      missingInformation: [], uncertainties: [{ code: 'source_pending', message: '본인·대리의 이용 조건 미확인' }],
      checks: [{ id: 'individual-conditions', outcome: 'unverified', explanation: '사용자의 개별 이용 조건을 확인하지 못했습니다.', evidenceIds: [] }],
      channels: [{ id: `channel-${channel}`, type: channel, checkIds: ['individual-conditions'], applicationUrl: null, cautions: [], evidenceIds: ['route'] }],
      nextActions: [{ kind: 'verify_official_information', channelId: `channel-${channel}`, instruction: `공식 원문 ${source.url}에서 개별 조건을 확인하세요.`, evidenceIds: ['route'] }],
    },
  };
}
export function fixtureDependencies(options: {
  text?: string; channel?: 'online' | 'visit';
} = {}): ResearchDependencies {
  return {
    async decide(context) {
      if (context.sources.length) return fixtureCompletion(context, options.channel ?? (context.sources[0].text.includes('방문') ? 'visit' : 'online'));
      if (context.candidates.length) return { type: 'inspect', sourceIds: [context.candidates[0].id] };
      return { type: 'search', queries: ['임의가입자 기준소득월액 변경 신청 공식 안내'] };
    },
    async search() { return ['https://nps.or.kr/fixture-change']; },
    async inspect(candidate) {
      return { ...candidate, text: options.text ?? fixtureText, links: [], retrievedAt: '2026-10-25T00:00:00.000Z' } satisfies Source;
    },
    async review(_context, completion) {
      return { draftSupported: true, reason: 'synthetic review fixture', findings: completion.findings.map(item => ({ key: item.key, verdict: 'supported', reason: 'fixture context supports this narrow claim' })) };
    },
  };
}

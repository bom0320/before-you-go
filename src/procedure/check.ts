import { procedureOutput, type ProcedureInput, type ProcedureResult, type Evidence } from './schema.js';
export function getInputResolution(input: ProcedureInput): ProcedureResult | undefined {
  const result: ProcedureResult = {
    mode: 'procedure_check', status: 'needs_information', summary: '사용자 상황을 먼저 확인해야 합니다.',
    missingInformation: [], uncertainties: [], checks: [], channels: [], nextActions: [], evidence: [],
  };
  if (input.subscriberType === 'other') {
    result.status = 'unsupported';
    result.summary = '현재는 국민연금 임의가입자의 보험료 변경만 지원합니다. 다른 가입 유형의 자격이나 신청 불가를 판단한 것은 아닙니다.';
    result.uncertainties.push({ code: 'outside_scope', message: '다른 가입 유형에는 임의가입자 규칙을 적용하지 않습니다.' });
    result.nextActions.push({
      kind: 'verify_official_information', channelId: null,
      instruction: '해당 가입 유형에 적용되는 변경 절차를 국민연금공단 공식 자료에서 별도로 확인해야 합니다.', evidenceIds: [],
    });
    return result;
  }
  // With a goal, the agent can research how to identify missing information.
  if (input.goal) return undefined;
  // Questions describe product context, not extra administrative eligibility rules.
  if (!input.subscriberType || input.subscriberType === 'unknown') {
    result.missingInformation.push({ field: 'subscriberType', question: '현재 국민연금 가입 유형이 임의가입자인지 알고 계신가요? 모르면 모른다고 알려주세요.' });
  } else if (!input.applicant || input.applicant === 'unknown') {
    result.missingInformation.push({ field: 'applicant', question: '실제 변경 신청을 하려는 사람은 가입자 본인인가요, 가족인가요?' });
  } else if (!input.changeGoal || input.changeGoal === 'unknown') {
    result.missingInformation.push({ field: 'changeGoal', question: '희망하는 보험료 변경 방향은 증액인가요, 감액인가요? 방향만 알려주세요.' });
  }
  if (result.missingInformation.length) {
    result.nextActions = result.missingInformation.map(({ question }) => ({
      kind: 'answer_question', channelId: null, instruction: question, evidenceIds: [],
    }));
    return result;
  }

  return undefined;
}

// Only a validated live draft enters this pure projection. No static data fallback.
export function resolveProcedure(input: ProcedureInput, draft: Omit<ProcedureResult, 'evidence'>, evidence: Evidence[]): ProcedureResult {
  const channels = draft.channels;
  const blockedIds = new Set(channels.filter(channel => channel.type === input.unavailableChannel).map(channel => channel.id));
  const nextActions = draft.nextActions.filter(action => action.channelId === null || !blockedIds.has(action.channelId));
  const referenced = new Set([
    ...draft.checks.flatMap(check => check.evidenceIds),
    ...channels.flatMap(channel => [...channel.evidenceIds, ...channel.cautions.flatMap(caution => caution.evidenceIds)]),
    ...nextActions.flatMap(action => action.evidenceIds),
  ]);
  return procedureOutput.parse({ ...draft, nextActions, evidence: evidence.filter(item => referenced.has(item.id)) });
}

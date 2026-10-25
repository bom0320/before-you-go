import { verifiedChannels, verifiedEvidence } from './data.js';
import type { ProcedureInput, ProcedureResult } from './schema.js';

// Validated product input; no SDK, HTTP, I/O, clock or session state.
export function checkProcedureReadiness(input: ProcedureInput): ProcedureResult {
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

  result.status = 'needs_verification';
  const blocked = verifiedChannels.find(channel => channel.type === input.unavailableChannel);
  result.summary = `${blocked ? `${blocked.label} 경로의 현재 이용 어려움을 반영했습니다. 법적 신청 불가 판정이 아닙니다. ` : ''}공식 신청 경로는 확인되지만 ${input.applicant === 'family' ? '가족의 대리 권한과 경로별 허용 조건' : '본인의 인증과 경로별 이용 조건'}은 추가 확인이 필요합니다.`;
  result.checks.push(
    {
      id: 'procedure-scope', outcome: 'satisfied',
      explanation: '사용자가 밝힌 임의가입 유형은 이 변경 민원의 안내 대상에 포함됩니다. 실제 자격·희망 금액을 확인한 것은 아닙니다.',
      evidenceIds: ['NPS-001-01'],
    },
    {
      id: 'change-goal', outcome: 'unverified',
      explanation: `${input.changeGoal === 'increase' ? '증액' : '감액'} 의향을 확인했습니다. 해당 방향의 허용 범위·금액·예외 조건은 아직 검증되지 않았습니다.`, evidenceIds: [],
    },
    {
      id: 'applicant-authority', outcome: 'unverified',
      explanation: input.applicant === 'family'
        ? '공식 조문에 대리인이 규정되어 있지만, 가족 관계만으로 대리 권한이나 경로별 신청 허용을 인정할 수 없습니다.'
        : '가입자 본인의 신청 의향과 실제 신분·경로별 이용 권한 확인은 별개입니다. 현재 입력으로 완료 여부를 확인하지 않았습니다.',
      evidenceIds: input.applicant === 'family' ? ['NPS-003-01'] : [],
    },
    {
      id: 'preparations', outcome: 'unverified',
      explanation: '별지 제2호서식 규정의 적용과 경로별 대체 입력·추가 서류를 확인해야 합니다. 준비 사항 전체가 확인되거나 면제된 것은 아닙니다.',
      evidenceIds: ['NPS-011-01'],
    },
  );
  result.uncertainties.push(
    { code: 'source_pending', message: '증액·감액의 세부 허용 범위와 예외 조건을 아직 검증하지 않았습니다. 금액·기한을 확정하지 않습니다.' },
    { code: 'source_pending', message: '경로별 신분·인증·신청 주체·구비서류의 전체 조건이 미확인입니다. 경로 존재만으로 이용 가능하다고 판단하지 않습니다.' },
  );
  if (input.applicant === 'family') {
    result.uncertainties.push({ code: 'source_pending', message: '가족의 대리 권한 증명과 경로별 대리 신청 허용 조건은 미검증입니다. 특정 위임 서류를 필수로 단정하지 않습니다.' });
  }

  for (const channel of verifiedChannels) {
    const channelId = `channel-${channel.type}`;
    const checkId = `${channel.type}-conditions`;
    result.checks.push({
      id: checkId, outcome: 'unverified',
      explanation: channel.type === 'online'
        ? '온라인 변경 민원은 인증이 필요합니다. 인증수단·사용자의 인증 완료·세부 이용 조건은 미확인입니다.'
        : `${channel.label} 경로의 사용자별 신청 주체·신분 확인·준비 조건 전체를 확인하지 못했습니다.`,
      evidenceIds: channel.type === 'online' ? ['NPS-009-01'] : [],
    });
    result.channels.push({
      id: channelId, type: channel.type,
      checkIds: ['procedure-scope', 'change-goal', 'applicant-authority', 'preparations', checkId],
      applicationUrl: channel.type === 'online' ? verifiedEvidence['NPS-010-01'].url : null,
      cautions: [
        { text: verifiedEvidence['NPS-002-01'].fact, evidenceIds: ['NPS-002-01'] },
        ...(channel.type === 'online' ? [
          { text: verifiedEvidence['NPS-009-01'].fact, evidenceIds: ['NPS-009-01'] },
          { text: verifiedEvidence['NPS-010-01'].fact, evidenceIds: ['NPS-010-01'] },
        ] : []),
      ],
      evidenceIds: [channel.evidenceId, ...(channel.type === 'online' ? ['NPS-010-01'] : [])],
    });
    // The reported unavailable channel remains visible, but is not a next action.
    // No channel has a verified full condition set: do not emit use_channel.
    if (channel.type !== input.unavailableChannel) {
      result.nextActions.push({
        kind: 'verify_official_information', channelId,
        instruction: channel.type === 'online'
          ? `${blocked ? `${blocked.label} 외 대체 경로 후보로, ` : ''}공식 웹 신청 진입점 ${verifiedEvidence['NPS-010-01'].url} 및 안내 자료에서 인증·신청 주체·변경 방향·구비서류 조건을 확인하세요. 신청 가능성을 확정한 안내는 아닙니다.`
          : `${channel.label}은 공식 안내된 ${blocked ? '대체 경로 후보' : '신청 경로'}입니다. ${verifiedEvidence[channel.evidenceId].url} 의 공식 안내에서 ${input.applicant === 'family' ? '가족 대리 허용·권한 확인, ' : ''}이용 조건과 준비 사항을 추가로 확인하세요.`,
        evidenceIds: [channel.evidenceId, ...(channel.type === 'online' ? ['NPS-009-01', 'NPS-010-01'] : [])],
      });
    }
  }
  result.nextActions.push({
    kind: 'verify_official_information', channelId: null,
    instruction: '공식 시행규칙의 별지 제2호서식 제출 규정과 본인의 변경 신청에 적용되는 범위, 경로별 대체 입력·추가 서류를 확인해야 합니다.',
    evidenceIds: ['NPS-011-01', ...(input.applicant === 'family' ? ['NPS-003-01'] : [])],
  });
  const referenced = new Set([
    ...result.checks.flatMap(check => check.evidenceIds),
    ...result.channels.flatMap(channel => [...channel.evidenceIds, ...channel.cautions.flatMap(caution => caution.evidenceIds)]),
    ...result.nextActions.flatMap(action => action.evidenceIds),
  ]);
  // Return fresh objects so one caller cannot alter facts returned to another.
  result.evidence = Object.values(verifiedEvidence).filter(fact => referenced.has(fact.id)).map(fact => ({ ...fact }));
  return result;
}

import { z } from 'zod';

export const channelType = z.enum(['phone', 'online', 'mobile', 'visit']);
export const procedureInput = z.strictObject({
  procedure: z.literal('national_pension_premium_change'),
  goal: z.string().trim().min(1).max(300).optional()
    .describe('짧은 행정 목표 또는 가입 유형 확인 방법 질문. 개인정보·연락처·인증정보를 포함하지 마세요. 구조화된 값을 변경하지 않습니다.'),
  subscriberType: z.enum(['voluntary', 'other', 'unknown']).optional()
    .describe('가입자가 밝힌 가입 유형. 임의가입자가 아니면 other, 모르면 unknown.'),
  applicant: z.enum(['self', 'family', 'unknown']).optional()
    .describe('실제 신청 예정자가 가입자 본인인지 가족인지. 대화 상대와 구분하며 가족의 권한을 뜻하지 않습니다.'),
  changeGoal: z.enum(['increase', 'decrease', 'unknown']).optional()
    .describe('희망 변경 방향이며 변경 가능 여부를 뜻하지 않습니다.'),
  unavailableChannel: channelType.optional()
    .describe('현재 이용이 어려운 경로 한 개. 전화 연결 실패는 phone. 생략은 보고된 어려움 없음.'),
});
export type ProcedureInput = z.infer<typeof procedureInput>;

const text = z.string().min(1);
const ids = z.array(text).refine(values => new Set(values).size === values.length, 'IDs must be unique');
const httpsUrl = z.url({ protocol: /^https$/ });
export const evidenceSchema = z.strictObject({
  id: text,
  institution: text,
  url: httpsUrl,
  fact: text,
  scope: text,
  verifiedAt: z.iso.date(),
  sourceId: text.optional(),
  quote: z.string().min(20).max(1500).optional(),
  retrievedAt: z.iso.datetime().optional(),
});
export type Evidence = z.infer<typeof evidenceSchema>;

export const procedureOutput = z.strictObject({
  mode: z.literal('procedure_check'),
  status: z.enum(['unsupported', 'needs_information', 'needs_verification', 'not_ready', 'ready']),
  summary: text,
  missingInformation: z.array(z.strictObject({
    field: z.enum(['subscriberType', 'applicant', 'changeGoal', 'unavailableChannel', 'goal']),
    question: text,
  })),
  uncertainties: z.array(z.strictObject({
    code: z.enum(['source_pending', 'source_conflict', 'source_outdated', 'outside_scope', 'research_limit', 'source_unavailable', 'evidence_rejected']),
    message: text,
  })),
  checks: z.array(z.strictObject({
    id: text,
    outcome: z.enum(['satisfied', 'not_satisfied', 'unverified']),
    explanation: text,
    evidenceIds: ids,
  })),
  channels: z.array(z.strictObject({
    id: text,
    type: channelType,
    checkIds: ids.nonempty(),
    applicationUrl: httpsUrl.nullable(),
    cautions: z.array(z.strictObject({ text, evidenceIds: ids.nonempty() })),
    evidenceIds: ids.nonempty(),
  })),
  nextActions: z.array(z.strictObject({
    kind: z.enum(['answer_question', 'verify_official_information', 'prepare', 'use_channel']),
    channelId: text.nullable(),
    instruction: text,
    evidenceIds: ids,
  })),
  evidence: z.array(evidenceSchema),
});
export type ProcedureResult = z.infer<typeof procedureOutput>;

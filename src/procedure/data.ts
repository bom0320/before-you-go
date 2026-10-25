import type { Evidence } from './schema.js';

// Only the verified facts used by this MVP. Scope/limitations are part of each fact.
// Source of truth: docs/sources.md; no live lookup or pending rules.
const detailUrl = 'https://nps.or.kr/elctcvlcpt/comm/getOHAC0000M5.do?menuId=MN24001070';
const listUrl = 'https://nps.or.kr/elctcvlcpt/comm/getOHAC0000M3.do';
const regulationUrl = 'https://law.go.kr/LSW/lumLsLinkPop.do?chrClsCd=010202&lspttninfSeq=70145';
const verifiedAt = '2026-10-25';

export const verifiedEvidence = {
  'NPS-001-01': {
    id: 'NPS-001-01', institution: '국민연금공단', url: detailUrl, verifiedAt,
    fact: '임의가입자는 기준소득월액 변경 민원의 안내 대상에 포함됩니다.',
    scope: '임의가입자의 변경 업무 대상 안내. 희망 방향·금액의 허용 또는 승인을 확정하지 않습니다.',
  },
  'NPS-002-01': {
    id: 'NPS-002-01', institution: '국민연금공단', url: detailUrl, verifiedAt,
    fact: '기준소득월액 변경 민원은 지사 담당직원의 확인 후 처리됩니다.',
    scope: '임의가입자 변경 민원 처리절차. 자동 승인이나 즉시 완료가 아닙니다.',
  },
  'NPS-003-01': {
    id: 'NPS-003-01', institution: '보건복지부 / 국가법령정보센터', url: regulationUrl, verifiedAt,
    fact: '시행규칙 제2조제2항은 영 제10조제1항 단서·제3항에 따른 임의가입자 등의 변경 신청에서 대리인을 규정합니다.',
    scope: '해당 조문 범위의 변경 신청. 가족의 권한 또는 모든 경로에서의 대리 신청을 보장하지 않습니다.',
  },
  'NPS-005': {
    id: 'NPS-005', institution: '국민연금공단', url: detailUrl, verifiedAt,
    fact: '임의가입자의 기준소득월액 변경 신청방법으로 전화가 안내됩니다.',
    scope: '전화 신청 경로의 존재만 확인. 본인 확인 방식·대리 전화 조건은 미확인입니다.',
  },
  'NPS-006': {
    id: 'NPS-006', institution: '국민연금공단', url: detailUrl, verifiedAt,
    fact: '임의가입자의 기준소득월액 변경 신청방법으로 인터넷이 안내됩니다.',
    scope: '온라인 신청 경로의 존재만 확인. 사용자별 이용 조건과 접수 가능성은 미확인입니다.',
  },
  'NPS-007': {
    id: 'NPS-007', institution: '국민연금공단', url: detailUrl, verifiedAt,
    fact: '임의가입자의 기준소득월액 변경 신청방법으로 모바일 앱 내 곁에 국민연금이 안내됩니다.',
    scope: '모바일 신청 경로의 존재만 확인. 실제 양식·인증·대리 조건은 미확인입니다.',
  },
  'NPS-008': {
    id: 'NPS-008', institution: '국민연금공단', url: detailUrl, verifiedAt,
    fact: '임의가입자의 기준소득월액 변경 신청방법으로 방문이 안내됩니다.',
    scope: '방문 신청 경로의 존재만 확인. 지사별 접수·신분 확인·구비서류는 미확인입니다.',
  },
  'NPS-009-01': {
    id: 'NPS-009-01', institution: '국민연금공단', url: listUrl, verifiedAt,
    fact: '기준소득월액 변경 전자민원은 인증이 필요한 업무로 표시됩니다.',
    scope: '온라인 변경 민원의 인증 필요 표시. 허용 인증수단과 사용자별 권한·인증 완료 여부는 미확인입니다.',
  },
  'NPS-010-01': {
    id: 'NPS-010-01', institution: '국민연금공단',
    url: 'https://www.nps.or.kr/elctcvlcpt/dclraply/getOHAC0036M0.do', verifiedAt,
    fact: '공식 신청하기 버튼의 웹 진입 URL을 확인했으며 비로그인 요청에 로그인 필요 안내가 반환됩니다.',
    scope: '웹 신청 진입점만 확인. 인증 후 양식·제출 기능·모바일 직접 URL을 검증한 것은 아닙니다.',
  },
  'NPS-011-01': {
    id: 'NPS-011-01', institution: '보건복지부 / 국가법령정보센터', url: regulationUrl, verifiedAt,
    fact: '시행규칙 제2조제2항은 해당 범위의 변경 신청에서 별지 제2호서식 신청서를 공단에 제출하도록 규정합니다.',
    scope: '영 제10조제1항 단서·제3항의 신청 범위. 전자 대체 입력·첨부 면제·경로별 추가 증빙은 미확인입니다.',
  },
} as const satisfies Record<string, Evidence>;

export const verifiedChannels = [
  { type: 'phone', label: '전화', evidenceId: 'NPS-005' },
  { type: 'online', label: '온라인', evidenceId: 'NPS-006' },
  { type: 'mobile', label: '모바일 앱 내 곁에 국민연금', evidenceId: 'NPS-007' },
  { type: 'visit', label: '방문', evidenceId: 'NPS-008' },
] as const;

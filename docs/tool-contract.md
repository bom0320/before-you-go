# check_procedure_readiness — Tool Contract

## Purpose

사용자 상황에 적용되는 국민연금 보험료 변경 절차와 준비 사항을 공식 근거로 사전 점검한다. 실제 접수·승인·본인 인증을 수행하지 않는다.

**현재 계약**과 **목표 업무 계약**은 다르다. 아래 목표 계약은 다음 구현의 설계 기준이며 현재 서버에 전송하면 입력 오류가 발생한다. 이번 문서 작업은 도구를 변경하지 않는다.

## 현재 통신 검증 계약

입력은 추가 속성을 허용하지 않는 `{ "procedure": "test" }`뿐이다. 출력은 다음이며 `content`의 JSON 텍스트와 `structuredContent`가 동일하다.

```json
{
  "mode": "test",
  "status": "not_evaluated",
  "message": "MCP 도구 호출 성공. 명시적인 테스트 응답이며 실제 행정 업무 준비 상태는 평가하지 않았습니다."
}
```

`not_evaluated`는 업무용 준비 상태가 아니다. 현재 입력 오류는 SDK 도구 오류(`isError: true`)로 반환하며, HTTP 및 프로토콜 오류와 구분한다. 현재 실행 및 검증 명령은 [README](../README.md)에 있다.

## 목표 Input Schema — 미구현

JSON object이며 아래 속성만 허용한다. 실제 업무 계약 전환 시 현재 test 계약의 유지·제거 여부와 클라이언트 전환 방법을 별도 결정하고 문서·테스트를 갱신한다.

| 필드 | 타입 / 값 | 필수 여부와 의미 |
| --- | --- | --- |
| `procedure` | `"national_pension_premium_change"` | 필수. 점검할 업무의 내부 식별자 |
| `subscriberType` | `"voluntary"`, `"other"`, `"unknown"` | 선택. 사용자 진술 기준 가입 유형. other는 현재 지원 밖 유형을 묶는 값 |
| `applicant` | `"self"`, `"family"`, `"unknown"` | 선택. 변경 신청을 누가 하려는지. family는 대리 신청 의향이며 권한 확인을 뜻하지 않음 |
| `changeGoal` | `"increase"`, `"decrease"`, `"unknown"` | 선택. 사용자가 원하는 방향이며 허용 가능한 변경 방향을 선언하는 값이 아님 |

선택 필드의 생략은 `unknown`과 같이 취급한다. 이 필드는 대화와 분기 처리를 위한 제품 모델이며 행정기관이 요구하는 신청 항목 목록이 아니다. 구체 금액·나이·소득·관계 상세·서류 보유 여부는 공식 절차에서 판단 필요성이 확인된 뒤 최소 범위로 추가한다. 이름·주민등록번호·연락처·계정·자유 서술·증빙 파일은 받지 않는다.

## 목표 Output Schema — 미구현

`structuredContent`는 다음 필드를 모두 포함하고, `content`에는 동일한 객체를 JSON 텍스트로 제공한다. 빈 정보는 배열 `[]`로 표시한다. 아래 배열 객체에 정의된 필드는 모두 필수이며, 정의하지 않은 속성은 허용하지 않는다.

| 필드 | 타입 / 내용 |
| --- | --- |
| `mode` | `"procedure_check"` |
| `status` | 아래 Status Semantics의 값 |
| `summary` | 사용자에게 보여줄 짧은 설명 문자열 |
| `missingInformation` | `{ field, question }[]`. field는 선택 입력 필드명, question은 구체적 질문 |
| `uncertainties` | `{ code, message }[]`. code는 `source_pending`, `source_conflict`, `source_outdated`, `outside_scope` 중 하나 |
| `checks` | `{ id, outcome, explanation, evidenceIds }[]`. outcome은 `satisfied`, `not_satisfied`, `unverified` 중 하나. evidenceIds는 사실 ID 문자열 배열 |
| `nextActions` | `{ kind, instruction, evidenceIds }[]`. kind는 `answer_question`, `verify_official_information`, `prepare` 중 하나 |
| `evidence` | `{ id, institution, url, fact, scope, verifiedAt }[]`. verifiedAt은 YYYY-MM-DD, url은 공식 HTTPS 페이지의 직접 URL |

`checks`는 확인한 규칙만 생성한다. `unverified`는 규칙의 적용 여부 등을 확정할 수 없을 때 사용하며 evidenceIds가 비어 있을 수 있다. 이를 확정 요건처럼 설명하지 않는다. `satisfied`·`not_satisfied`와 `prepare` 안내는 적용 가능한 검증 근거를 하나 이상 참조한다. 질문이나 공식 자료 확인 요청은 근거 배열이 비어 있을 수 있다. 반환 evidence는 참조된 verified 사실만 포함한다.

## Status Semantics

| 상태 | 의미 |
| --- | --- |
| `unsupported` | 가입 유형 등 요청 상황이 확정된 MVP 지원 범위 밖임. 자격 없음 판정이 아님 |
| `needs_information` | 분기에 필요한 사용자 상황이 없거나 unknown임. 다음 질문을 제시 |
| `needs_verification` | 상황이 있어도 공식 근거가 미확인·충돌·유효성 재검토 상태여서 판단 보류 |
| `not_ready` | 확인된 적용 요건 중 미충족이 있음. 법적 신청 불가나 영구 부적격을 뜻하지 않음 |
| `ready` | 확인된 적용 절차의 사전 점검 항목을 모두 충족. 접수·승인·변경 완료 보장이 아님 |

상태 선택 순서: 범위 밖이 확정되면 unsupported → 필요한 사용자 정보가 없으면 needs_information → 필요한 근거가 부족하면 needs_verification → 검증된 미충족 항목이 있으면 not_ready → 나머지 점검이 모두 완료되면 ready.

한 상태가 다른 문제를 숨기지 않도록 missingInformation과 uncertainties를 함께 채울 수 있다. `ready`에는 두 배열이 비어 있어야 하며, 검증된 적용 규칙이 하나 이상 존재하고 모든 필수 점검이 완료되어야 한다. 빈 규칙 집합에서 ready를 반환하지 않는다. 아직 공식 요건이 확정되지 않았으므로 현재 자료 상태에서는 ready/not_ready 업무 판단을 만들 수 없다.

## Validation Rules

- 객체 형태·필드명·enum은 Zod로 검증한다. 잘못된 타입·알 수 없는 속성·지원하지 않는 procedure 값은 입력 오류다.
- `subscriberType: "other"`는 유효한 입력이며 업무 결과 unsupported로 처리한다. unknown·생략은 오류가 아니다.
- changeGoal은 의향이다. increase/decrease를 받았다는 이유로 가능한 절차라고 판단하지 않는다.
- 사용자 진술과 출처의 적용 범위가 일치하는지 확인한다. 다른 가입 유형의 규칙을 대입하지 않는다.
- 출력의 evidenceIds는 모두 evidence에 존재해야 한다. verifiedAt과 범위가 없는 사실을 확정 판단에 쓰지 않는다.

## Missing Information Handling

먼저 가입 유형, 다음 신청 주체를 확인한다. 변경 방향은 해당 분기에서 필요한 경우 묻고, 필요성을 확인하기 전 추가 개인 정보를 요구하지 않는다. 질문은 한 번에 답할 수 있도록 구체적으로 작성하고 이미 받은 정보는 다시 묻지 않는다.

가입 유형을 모르는 사람에게 자격 증명을 요구하지 않는다. “현재 가입 유형을 알고 계신가요?”처럼 확인하고 공식 확인 경로 자체가 미검증이면 그 경로도 확인 필요로 표시한다. vooy가 답변을 받아 기존 범주 정보와 합쳐 도구를 재호출한다. 서버 세션 저장을 전제로 하지 않는다.

## Evidence Requirements

[sources.md](sources.md)의 verified 사실만 확정 판단에 사용한다. 각 판단은 해당 사실의 적용 가입 유형·신청 주체·예외와 일치해야 한다. 공식 홈페이지 첫 화면만으로 개별 규칙을 입증하지 않는다. 사용자 진술은 상황 입력이며 공식 근거가 아니다.

근거가 없으면 needs_verification과 확인할 사항을 반환한다. 기관 문의·접수 채널의 이름, 전화번호, 구비 서류, 위임 요건, 기한·금액 역시 공식 근거 확인 전에는 만들어 넣지 않는다.

## Example Requests / Responses — 목표 계약, 실행 불가

예시는 상태 처리 설명을 위한 것이며 행정 규칙의 증거가 아니다.

### 가입 유형 미확인

```json
{ "procedure": "national_pension_premium_change", "subscriberType": "unknown" }
```

```json
{
  "mode": "procedure_check",
  "status": "needs_information",
  "summary": "가입 유형을 먼저 확인해야 합니다.",
  "missingInformation": [
    { "field": "subscriberType", "question": "현재 국민연금 가입 유형이 임의가입자인지 알고 계신가요?" }
  ],
  "uncertainties": [],
  "checks": [],
  "nextActions": [
    { "kind": "answer_question", "instruction": "알고 있는 가입 유형을 알려주세요. 모르면 모른다고 답해 주세요.", "evidenceIds": [] }
  ],
  "evidence": []
}
```

### 임의가입자 본인 / 가족

본인 요청 예시:

```json
{ "procedure": "national_pension_premium_change", "subscriberType": "voluntary", "applicant": "self", "changeGoal": "increase" }
```

현재 출처가 모두 pending인 상태에서의 목표 응답:

```json
{
  "mode": "procedure_check",
  "status": "needs_verification",
  "summary": "임의가입자 본인의 보험료 변경 절차에 대한 공식 근거 확인이 필요합니다.",
  "missingInformation": [],
  "uncertainties": [
    { "code": "source_pending", "message": "변경 가능 범위와 접수 절차를 아직 검증하지 않았습니다." }
  ],
  "checks": [],
  "nextActions": [
    { "kind": "verify_official_information", "instruction": "국민연금공단 공식 자료에서 본인 변경 요건과 절차를 확인해야 합니다.", "evidenceIds": [] }
  ],
  "evidence": []
}
```

가족 요청 예시:

```json
{ "procedure": "national_pension_premium_change", "subscriberType": "voluntary", "applicant": "family", "changeGoal": "decrease" }
```

```json
{
  "mode": "procedure_check",
  "status": "needs_verification",
  "summary": "가족의 대리 신청 가능 여부는 확인되지 않았습니다.",
  "missingInformation": [],
  "uncertainties": [
    { "code": "source_pending", "message": "해당 변경의 허용 범위, 대리 신청 가능 여부와 요건을 검증해야 합니다." }
  ],
  "checks": [],
  "nextActions": [
    { "kind": "verify_official_information", "instruction": "국민연금공단 공식 자료에서 해당 업무의 대리 처리 가능 여부와 조건을 확인해야 합니다.", "evidenceIds": [] }
  ],
  "evidence": []
}
```

## Error Cases

| 경우 | 처리 기준 |
| --- | --- |
| 잘못된 입력 타입·enum·추가 속성 | SDK 입력 검증 오류. ready 등 업무 상태로 대체하지 않음 |
| 선택 상황 누락·unknown | 정상 업무 결과 needs_information |
| 공식 자료 부족·충돌 | 정상 업무 결과 needs_verification |
| 지원 밖 가입 유형 | 정상 업무 결과 unsupported |
| 알 수 없는 도구·잘못된 JSON-RPC | SDK 프로토콜 오류 처리에 위임 |
| 허용하지 않은 Host/Origin | 현재 HTTP 계층에서 403 |
| `/mcp` 외 경로 | 현재 HTTP 계층에서 404 |
| 내부 처리 실패 | 성공 응답으로 위장하지 않고 민감 정보·스택을 노출하지 않음 |

도메인 점검의 불확실성과 서버 장애를 같은 상태로 합치지 않는다. 새 업무 계약 구현 시 오류 형식도 SDK의 실제 동작으로 검증한다.

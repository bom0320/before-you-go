# check_procedure_readiness — Tool Contract

## Purpose

국민연금 임의가입자의 보험료 변경 절차와 준비 사항을 공식 근거로 사전 점검한다. 현재 경로가 막혔을 때 검증된 다른 경로와 다음 행동을 안내한다. 문제 배경은 [problem-definition.md](problem-definition.md), 제품 범위는 [brief.md](brief.md)를 따른다. 실제 접수·승인·본인 인증을 수행하지 않는다.

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

JSON object이며 아래 속성만 허용한다. 다음 업무 구현에서는 같은 도구명을 유지하고 `procedure`를 판별자로 test와 업무 입력을 구분하는 계약을 사용한다. 기존 test 입출력은 유지한다. 업무 입력은 아래 스키마를 적용하고 문서·테스트·README를 함께 갱신한다. 현재는 test 분기만 구현되어 있다.

| 필드 | 타입 / 값 | 필수 여부와 의미 |
| --- | --- | --- |
| `procedure` | `"national_pension_premium_change"` | 필수. 점검할 업무의 내부 식별자 |
| `subscriberType` | `"voluntary"`, `"other"`, `"unknown"` | 선택. 사용자 진술 기준 가입 유형. other는 현재 지원 밖 유형을 묶는 값 |
| `applicant` | `"self"`, `"family"`, `"unknown"` | 선택. 실제 신청 예정자가 가입자 본인(self)인지 가족(family)인지. 대화하는 사람과 구분하며 family는 권한 확인을 뜻하지 않음 |
| `changeGoal` | `"increase"`, `"decrease"`, `"unknown"` | 선택. 사용자가 원하는 방향이며 허용 가능한 변경 방향을 선언하는 값이 아님 |
| `unavailableChannel` | `"phone"`, `"online"`, `"mobile"`, `"visit"` | 선택. 사용자가 현재 이용하기 어렵다고 밝힌 경로 한 개. 전화 연결 실패는 phone. 공식적인 신청 경로의 존재·허용 여부를 뜻하지 않음 |

subscriberType·applicant·changeGoal의 생략은 `unknown`과 같이 취급한다. unavailableChannel의 생략은 “보고된 어려운 경로 없음”이며 모든 경로가 이용 가능하다는 뜻은 아니다. 이 필드는 질문의 필수 대상이 아니다. 복수 경로와 실패 사유 자유 서술은 MVP에서 추가하지 않는다. 이 입력들은 대화와 분기 처리를 위한 제품 모델이며 행정기관이 요구하는 신청 항목 목록이 아니다. 구체 금액·나이·소득·관계 상세·서류 보유 여부는 공식 절차에서 판단 필요성이 확인된 뒤 최소 범위로 추가한다. 이름·주민등록번호·연락처·계정·자유 서술·증빙 파일은 받지 않는다.

## 목표 Output Schema — 미구현

`structuredContent`는 다음 필드를 모두 포함하고, `content`에는 동일한 객체를 JSON 텍스트로 제공한다. 빈 정보는 배열 `[]`로 표시한다. 아래 배열 객체에 정의된 필드는 모두 필수이며, 정의하지 않은 속성은 허용하지 않는다. enum·배열·null로 별도 표기하지 않은 id·설명·질문·기관·사실·scope 등은 비어 있지 않은 문자열이다. evidenceIds와 checkIds는 중복 없는 문자열 배열이고 evidence id는 응답 내 고유하다.

| 필드 | 타입 / 내용 |
| --- | --- |
| `mode` | `"procedure_check"` |
| `status` | 아래 Status Semantics의 값 |
| `summary` | 사용자에게 보여줄 짧은 설명 문자열 |
| `missingInformation` | `{ field, question }[]`. field는 선택 입력 필드명, question은 구체적 질문 |
| `uncertainties` | `{ code, message }[]`. code는 `source_pending`, `source_conflict`, `source_outdated`, `outside_scope` 중 하나 |
| `checks` | `{ id, outcome, explanation, evidenceIds }[]`. outcome은 `satisfied`, `not_satisfied`, `unverified` 중 하나. evidenceIds는 사실 ID 문자열 배열 |
| `channels` | `{ id, type, checkIds, applicationUrl, cautions, evidenceIds }[]`. 공식적인 존재가 verified인 신청 경로만 포함. 세부 정의는 아래 참조 |
| `nextActions` | `{ kind, channelId, instruction, evidenceIds }[]`. kind는 `answer_question`, `verify_official_information`, `prepare`, `use_channel` 중 하나. channelId는 channels의 id 또는 null |
| `evidence` | `{ id, institution, url, fact, scope, verifiedAt }[]`. verifiedAt은 YYYY-MM-DD, url은 공식 HTTPS 페이지의 직접 URL |

`checks`는 검증된 규칙의 점검 또는 명시적인 확인 보류 항목만 생성한다. `unverified`는 규칙의 적용 여부 등을 확정할 수 없을 때 사용하며 evidenceIds가 비어 있을 수 있다. 이를 확정 요건처럼 설명하지 않는다. `satisfied`·`not_satisfied`, `prepare`·`use_channel` 안내는 적용 가능한 검증 근거를 하나 이상 참조한다. 질문이나 공식 자료 확인 요청은 근거 배열이 비어 있을 수 있다. 반환 evidence는 참조된 verified 사실만 포함한다.

## 경로와 다음 행동의 계약

신규 최상위 필드는 `channels` 하나다. 기존 checks는 신청 요건과 경로별 적용 조건을, nextActions의 prepare는 필요한 준비 사항을 표현한다. 별도의 alternatives·requirements·preparations 배열이나 새로운 업무 상태는 만들지 않는다.

### channels 요소

| 필드 | 타입 / 의미 |
| --- | --- |
| `id` | 응답 내 고유 문자열. 예: channel-online. nextActions에서 참조 |
| `type` | phone / online / mobile / visit. 입력과 같은 제품 분류이며 경로 존재를 보장하는 enum이 아님 |
| `checkIds` | checks의 id 문자열 배열. 해당 경로에 적용되는 공통 신청 요건·신청 주체·변경 방향·경로별 조건을 모두 연결 |
| `applicationUrl` | 공식 신청 페이지 HTTPS URL 또는 null. 경로 존재의 근거 URL과 다름. 직접 신청 페이지를 검증한 경우만 채움 |
| `cautions` | `{ text, evidenceIds }[]`. 경로별 공식 주의사항과 근거(각 항목 evidenceIds 최소 1개). 미확인 주의사항은 uncertainties로 표현 |
| `evidenceIds` | 공식 경로 존재와 적용 조건 목록의 범위를 뒷받침하는 verified 사실 ID 배열. 최소 1개 |

각 경로의 checkIds는 비어 있을 수 없다. 조건 목록 자체가 미검증이거나 필요한 상황·요건의 충족 여부를 알 수 없으면 설명이 있는 unverified check를 연결한다. 근거 없는 새 행정 요건을 만들어 넣지 않는다. applicability를 별도 필드에 중복 저장하지 않고 아래처럼 check 결과로 산출한다.

- 하나라도 not_satisfied: 확인된 미충족 조건이 있는 경로.
- not_satisfied는 없고 하나라도 unverified: 이용 조건을 확정할 수 없는 경로.
- 모두 satisfied: 검증된 적용 조건 목록을 빠짐없이 점검한 경로. 자료의 조건 목록이 완전한지 확인되지 않으면 이 결과를 만들 수 없다.

경로의 존재만 verified이고 사용자 조건이 미확인이어도 channels에는 표시할 수 있다. 단, 이용할 수 있는 대안으로 추천하지 않는다. 경로 존재 자체가 pending인 후보는 channels에 넣지 않고 uncertainties에 남긴다. online과 mobile은 공식 구분을 확인한 경우만 각각 등록하고, 하나의 안내를 근거로 다른 경로까지 있다고 추정하지 않는다.

### 반드시 분리할 세 가지 사실

1. **공식적인 존재**: channels에 포함된다는 것은 해당 업무의 신청 경로라는 공식 근거가 있음을 뜻한다. 단순 상담 채널을 신청 경로로 바꾸어 해석하지 않는다.
2. **사용자별 조건**: checkIds가 참조하는 checks로 판단한다. 경로가 존재해도 가족 대리 신청이나 변경 방향 등 조건이 맞지 않을 수 있다.
3. **현재 이용 어려움**: 요청의 unavailableChannel만 사용한다. 이는 사용자 진술이며 공식 evidence가 아니다. 생략은 실제 접근 성공을 뜻하지 않는다.

phone 실패는 전화 신청의 법적 불가나 공식 서비스 중단을 뜻하지 않는다. 다른 사람의 요청이나 영구 규칙 데이터로 전파하지 않는다.

### nextActions와 대체 경로

- answer_question / verify_official_information은 channelId가 null일 수 있다. 경로에 관한 질문·확인이면 해당 channels id를 연결할 수 있다.
- prepare는 검증된 준비 사항을 instruction에 적는다. 공통 사항은 channelId null, 경로 전용이면 해당 id를 연결한다. 아직 확인하지 않은 서류 등을 요구하지 않는다.
- use_channel은 channelId가 반드시 존재하고, 연결된 모든 check가 satisfied이며 type이 unavailableChannel과 달라야 한다. 실제 접수·승인·접근 성공을 보장하지 않는 “검증된 조건에 따른 다음 행동”이다.
- unavailableChannel이 있으면 use_channel 항목이 그 어려운 경로를 대신하는 안내다. instruction에 대체 경로라는 맥락과 조건을 설명한다. 별도 대체 경로 배열을 중복 반환하지 않는다.
- 어려운 경로도 verified이면 channels에 남겨 공식 존재와 사용자 불편을 구분한다. 그 경로만의 prepare/use_channel 행동은 추천하지 않는다.
- 검증된 대안이 없으면 use_channel을 비워 두고 이유와 확인할 사항을 제공한다. “대안이 없다”거나 다른 경로도 불가하다고 단정하지 않는다.

신청 페이지를 확보하지 못한 경우 applicationUrl은 null이다. 온라인·모바일 실행 경로로 use_channel을 안내하려면 직접 신청 페이지와 해당 사용자 적용 조건을 모두 검증해야 한다. 신청 링크만 미확인인 경우에도 존재가 검증된 경로는 표시하되 unverified check로 추천을 보류한다. 주의사항과 신청 URL 각각을 뒷받침하는 사실도 해당 경로의 evidenceIds에 연결한다.

## Status Semantics

| 상태 | 의미 |
| --- | --- |
| `unsupported` | 가입 유형 등 요청 상황이 확정된 MVP 지원 범위 밖임. 자격 없음 판정이 아님 |
| `needs_information` | 분기에 필요한 사용자 상황이 없거나 unknown임. 다음 질문을 제시 |
| `needs_verification` | 상황이 있어도 공식 근거가 미확인·충돌·유효성 재검토 상태여서 판단 보류 |
| `not_ready` | 검증된 미충족 요건 때문에 현재 추천할 경로가 없음. 법적 신청 불가나 영구 부적격을 뜻하지 않음 |
| `ready` | 현재 입력으로 확인할 적용 요건의 점검이 완료되고, 검증된 준비 사항 및 보고된 어려운 경로 외의 실행 경로를 최소 하나 안내할 수 있음. 공식 자격 확정·접수·승인·변경 완료 보장이 아님 |

상태 선택 순서:

1. 가입 유형 등 범위 밖이 확정되면 unsupported.
2. 판단에 필요한 사용자 상황이 없으면 needs_information.
3. 안내에 필요한 공식 근거가 부족하면 needs_verification. 현재 경로가 어렵고 검증된 대안이 없을 때도, 대안의 존재·조건을 확인하지 못했다면 이 상태다.
4. 근거가 충분하고 검증된 조건 미충족 때문에 추천 경로가 없으면 not_ready. 단일 경로 미충족만으로 다른 충족 경로까지 막지 않는다.
5. 적용 요건 점검과 준비 사항 안내가 완료되고 use_channel이 하나 이상 있으면 ready.

한 상태가 다른 문제를 숨기지 않도록 missingInformation과 uncertainties를 함께 채울 수 있다. ready에는 두 배열이 비어 있어야 하며, 검증된 적용 규칙이 하나 이상 존재하고 필수 점검이 완료되어야 한다. 빈 규칙·경로 집합에서 ready를 반환하지 않는다. 추천과 무관한 경로의 미충족 check만으로 ready를 금지하지는 않는다. 서류의 실제 보유 여부는 현재 입력에 없으므로 ready라도 “서류를 모두 갖췄다”고 주장하지 않는다. 준비 사항은 검증된 안내 목록으로 제공한다. 공식 조건을 현재 입력 계약으로 확인할 수 없는 분기는 지원 범위 보류(unsupported, uncertainties의 outside_scope)로 명시하고, 필요한 최소 필드를 계약·스키마에 함께 추가한 뒤 지원한다. 현재 계약에 없는 필드를 missingInformation.field에 임의로 넣지 않는다.

사용자가 보고한 어려움만으로 not_ready를 반환하지 않는다. 공식 근거로 다른 경로의 부재를 입증할 수도 없고 이용 가능한 대안도 제시할 수 없다면 needs_verification으로 보수적으로 처리한다. 아직 공식 요건이 확정되지 않았으므로 현재 자료 상태에서는 ready/not_ready 업무 판단을 만들 수 없다.

## Validation Rules

- 객체 형태·필드명·enum은 Zod로 검증한다. 잘못된 타입·알 수 없는 속성·지원하지 않는 procedure 값은 입력 오류다.
- `subscriberType: "other"`는 유효한 입력이며 업무 결과 unsupported로 처리한다. unknown·생략은 오류가 아니다.
- changeGoal은 의향이다. increase/decrease를 받았다는 이유로 가능한 절차라고 판단하지 않는다.
- 사용자 진술과 출처의 적용 범위가 일치하는지 확인한다. 다른 가입 유형의 규칙을 대입하지 않는다.
- unavailableChannel을 어떤 값으로 받더라도 그 경로가 공식적으로 존재한다고 추론하지 않는다. 생략 자체는 needs_information 사유가 아니다.
- check id와 channel id는 각 배열 내 고유해야 하며 checkIds와 channelId는 실제 응답 요소를 참조해야 한다.
- 같은 type의 경로는 MVP에서 하나로 표현하고, 경로별 조건 차이는 checks와 cautions에 기록한다.
- 출력의 evidenceIds는 모두 evidence에 존재해야 한다. verifiedAt과 범위가 없는 사실을 확정 판단에 쓰지 않는다.

## Missing Information Handling

먼저 가입 유형, 다음 신청 주체를 확인한다. 변경 방향은 해당 분기에서 필요한 경우 묻고, 필요성을 확인하기 전 추가 개인 정보를 요구하지 않는다. 질문은 한 번에 답할 수 있도록 구체적으로 작성하고 이미 받은 정보는 다시 묻지 않는다.

가입 유형을 모르는 사람에게 자격 증명을 요구하지 않는다. “현재 가입 유형을 알고 계신가요?”처럼 확인하고 공식 확인 경로 자체가 미검증이면 그 경로도 확인 필요로 표시한다. vooy가 답변을 받아 기존 범주 정보와 합쳐 도구를 재호출한다. 서버 세션 저장을 전제로 하지 않는다.

## Evidence Requirements

[sources.md](sources.md)의 verified 사실만 확정 판단에 사용한다. 각 판단은 해당 사실의 적용 가입 유형·신청 주체·예외와 일치해야 한다. 공식 홈페이지 첫 화면만으로 개별 규칙을 입증하지 않는다. 사용자 진술은 상황 입력이며 공식 근거가 아니다.

근거가 없으면 needs_verification과 확인할 사항을 반환한다. 기관 문의·접수 채널의 이름, 전화번호, 구비 서류, 위임 요건, 기한·금액 역시 공식 근거 확인 전에는 만들어 넣지 않는다.

## Example Requests / Responses — 목표 계약, 실행 불가

예시는 상태 처리 설명을 위한 것이며 행정 규칙의 증거가 아니다. verified 자료가 없어 실제 신청 경로나 링크를 만들어 넣지 않는다.

### 가입 유형 미확인

```json
{
  "procedure": "national_pension_premium_change",
  "subscriberType": "unknown"
}
```

```json
{
  "mode": "procedure_check",
  "status": "needs_information",
  "summary": "가입 유형을 먼저 확인해야 합니다.",
  "missingInformation": [
    {
      "field": "subscriberType",
      "question": "현재 국민연금 가입 유형이 임의가입자인지 알고 계신가요?"
    }
  ],
  "uncertainties": [],
  "checks": [],
  "channels": [],
  "nextActions": [
    {
      "kind": "answer_question",
      "instruction": "알고 있는 가입 유형을 알려주세요. 모르면 모른다고 답해 주세요.",
      "evidenceIds": [],
      "channelId": null
    }
  ],
  "evidence": []
}
```

### 임의가입자 본인 / 가족

본인 요청 예시:

```json
{
  "procedure": "national_pension_premium_change",
  "subscriberType": "voluntary",
  "applicant": "self",
  "changeGoal": "increase"
}
```

현재 출처가 모두 pending인 상태에서의 목표 응답:

```json
{
  "mode": "procedure_check",
  "status": "needs_verification",
  "summary": "임의가입자 본인의 보험료 변경 절차에 대한 공식 근거 확인이 필요합니다.",
  "missingInformation": [],
  "uncertainties": [
    {
      "code": "source_pending",
      "message": "변경 가능 범위와 접수 절차를 아직 검증하지 않았습니다."
    }
  ],
  "checks": [],
  "channels": [],
  "nextActions": [
    {
      "kind": "verify_official_information",
      "instruction": "국민연금공단 공식 자료에서 본인 변경 요건과 절차를 확인해야 합니다.",
      "evidenceIds": [],
      "channelId": null
    }
  ],
  "evidence": []
}
```

가족 요청 예시:

```json
{
  "procedure": "national_pension_premium_change",
  "subscriberType": "voluntary",
  "applicant": "family",
  "changeGoal": "decrease"
}
```

```json
{
  "mode": "procedure_check",
  "status": "needs_verification",
  "summary": "가족의 대리 신청 가능 여부는 확인되지 않았습니다.",
  "missingInformation": [],
  "uncertainties": [
    {
      "code": "source_pending",
      "message": "해당 변경의 허용 범위, 대리 신청 가능 여부와 요건을 검증해야 합니다."
    }
  ],
  "checks": [],
  "channels": [],
  "nextActions": [
    {
      "kind": "verify_official_information",
      "instruction": "국민연금공단 공식 자료에서 해당 업무의 대리 처리 가능 여부와 조건을 확인해야 합니다.",
      "evidenceIds": [],
      "channelId": null
    }
  ],
  "evidence": []
}
```

### 전화 연결 실패 — 현재 verified 자료 없음

```json
{
  "procedure": "national_pension_premium_change",
  "subscriberType": "voluntary",
  "applicant": "self",
  "changeGoal": "increase",
  "unavailableChannel": "phone"
}
```

```json
{
  "mode": "procedure_check",
  "status": "needs_verification",
  "summary": "전화 연결이 어려운 상황을 반영했습니다. 다른 신청 경로는 공식 확인이 필요합니다.",
  "missingInformation": [],
  "uncertainties": [
    { "code": "source_pending", "message": "이 업무의 전화 신청 경로 존재와 온라인·모바일·방문 대안의 존재 및 적용 조건을 아직 검증하지 않았습니다." }
  ],
  "checks": [],
  "channels": [],
  "nextActions": [
    {
      "kind": "verify_official_information",
      "channelId": null,
      "instruction": "임의가입자 본인의 해당 변경을 처리할 수 있는 다른 경로와 조건을 국민연금공단 공식 자료에서 확인해야 합니다.",
      "evidenceIds": []
    }
  ],
  "evidence": []
}
```

검증 이후 구현에서 반드시 확인할 분기(행정 사실이 아닌 테스트 조건):

| 조건 | 기대 동작 |
| --- | --- |
| phone 어려움 + 다른 경로 존재 verified + 사용자별 조건 모두 충족 | 다른 경로에 use_channel. 나머지 필수 점검도 완료된 경우만 ready |
| 다른 경로 존재 verified + 가족 대리 조건 미확인 | 경로는 channels에 표시하되 unverified check로 추천 보류. 사용자 정보 부족이면 needs_information, 근거 부족이면 needs_verification |
| 한 경로 조건 미충족 + 다른 경로 조건 충족 | 전자의 미충족 때문에 전체 not_ready로 만들지 않음 |
| 모든 경로 존재 pending | channels는 빈 배열. 전화 실패를 불가 판정으로 바꾸지 않고 needs_verification |

## 구현 전환 순서

공식 사실과 경로별 조건 검증 → 최소 Procedure Data 및 순수 점검 함수 → test 분기를 유지한 Zod 업무 계약 등록 → 도구 응답 매핑 → 경로 세 축·상태·근거 참조 테스트 → typecheck/test 및 tools/list·tools/call → 실제 vooy/HTTPS 연결 검증. 이 문서 단계에서는 어느 것도 구현하지 않는다.

## Error Cases

| 경우 | 처리 기준 |
| --- | --- |
| 잘못된 입력 타입·enum·추가 속성 | SDK 입력 검증 오류. ready 등 업무 상태로 대체하지 않음 |
| 판단에 필요한 상황 누락·unknown | 정상 업무 결과 needs_information. unavailableChannel 생략은 제외 |
| 공식 자료 부족·충돌 | 정상 업무 결과 needs_verification |
| 지원 밖 가입 유형 | 정상 업무 결과 unsupported |
| 알 수 없는 도구·잘못된 JSON-RPC | SDK 프로토콜 오류 처리에 위임 |
| 허용하지 않은 Host/Origin | 현재 HTTP 계층에서 403 |
| `/mcp` 외 경로 | 현재 HTTP 계층에서 404 |
| 내부 처리 실패 | 성공 응답으로 위장하지 않고 민감 정보·스택을 노출하지 않음 |

도메인 점검의 불확실성과 서버 장애를 같은 상태로 합치지 않는다. 새 업무 계약 구현 시 오류 형식도 SDK의 실제 동작으로 검증한다.

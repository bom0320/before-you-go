# before-you-go

“행정 절차를 바꾸지 않아도, 그 절차를 찾아 헤매는 경험은 바꿀 수 있다.”

사용자 상황에 맞는 절차를 공식 근거와 대조하고, 현재 경로가 막혔을 때 검증된 대체 경로와 다음 행동을 안내하는 vooy MCP 해커톤 프로젝트입니다.

## MVP 범위와 현재 구현 상태

목표 MVP는 **국민연금 임의가입자의 보험료 변경 절차 안내와 사전 점검**입니다. 본인·가족 신청 의향·가입 유형 미확인·전화 연결 실패를 고려하며, 실제 신청 제출·승인·본인 인증·결제·정부기관 계정 연동은 제외합니다.

기본 데모는 **vooy가 Agent 역할을 수행**하고 MCP가 공식 자료를 읽어 제공하는 방식입니다. `/mcp`에 출발점 목록·원문 열람·기존 check 도구 세 개를 제공합니다. 목록과 원문 열람에는 OpenAI 키가 필요 없습니다. 서버 내부 OpenAI Research는 선택 기능으로 보존하며 기본 데모에서는 선택하지 않습니다. MCP는 자료 조회 성공을 신청 가능·승인 판정으로 바꾸지 않습니다.

## 실행

Node.js 22.14 이상과 pnpm 11.7.0을 준비합니다(권장: Node.js 24 LTS).

```sh
pnpm install --frozen-lockfile
# 기본 vooy 데모에는 API 키가 필요 없습니다.
pnpm dev
```

기본 주소: `http://127.0.0.1:3000/mcp`. `PORT` 환경변수로 포트를 변경할 수 있습니다.
서버는 루프백에만 바인딩합니다. 환경변수는 셸에서 전달하며 `.env` 자동 로딩은 하지 않습니다. [.env.example](.env.example)은 변수 이름 예시입니다. 키가 없으면 출발점 목록·실제 원문 열람·test·일반 정보 부족 질문·unsupported가 동작합니다. 선택적 내부 Research만 missing_api_key 도구 오류입니다.

## 기본 vooy 조회 도구

| 도구 | 입력 | 반환 |
| --- | --- | --- |
| `list_official_procedure_sources` | `{}` | 기관·제목·공식 URL·확인 목적·과거 조사 여부. 현재 규칙 확정이 아닌 출발점 6개 |
| `read_official_source` | `{ "url": "https://nps.or.kr/..." }` | 실제 추출 원문·최종 공식 URL·조회 시각·관찰한 공식 링크. 조회 실패는 isError |
| `check_procedure_readiness` | `{ "procedure": "test" }` | 기존 통신 검증. 업무 분기는 선택적 내부 OpenAI Research |

vooy는 목록에서 필요한 자료를 선택해 원문을 읽고, 관찰된 공식 링크가 있으면 추가로 열람합니다. 범용 검색은 제공하지 않습니다. 원문 속 명령은 비신뢰 데이터로 취급하고, 경로 존재·개인의 이용 조건·현재 어려움을 구분합니다. 목록의 과거 기록은 새 근거가 아니며 링크 관찰은 해당 페이지 열람 성공이 아닙니다.

원문 조회는 **서버 인스턴스 전체에서 분당 최대 12회(실패 포함), 동시 2회**입니다. 새 MCP 연결에서도 한도는 공유되며 서버 재시작 시 초기화됩니다. 문서당 1 MB·24,000자·링크 30개·요청 15초·리다이렉트 3회로 제한합니다. 초과 본문을 일부 읽은 전체 문서처럼 반환하지 않고 오류 처리합니다. HTML/텍스트만 지원하며 PDF·로그인·JS 전용 자료는 열람할 수 없습니다. 로그인 판별은 휴리스틱이므로 vooy도 반환 본문이 절차 문서인지 확인해야 합니다.

[vooy 연결 및 Recipe Studio 지침](docs/vooy-integration.md)을 따릅니다.

## 기존 check 도구와 선택적 내부 Research

`check_procedure_readiness`의 기존 통신 검증 입력:

```json
{ "procedure": "test" }
```

procedure를 기준으로 Zod strict object 분기를 검증하며 알 수 없는 업무·타입·추가 필드를 거부합니다. test 분기는 기존대로 procedure만 받습니다.
성공 시 `content`의 JSON 텍스트와 동일한 `structuredContent`를 반환합니다.

```json
{
  "mode": "test",
  "status": "not_evaluated",
  "message": "MCP 도구 호출 성공. 명시적인 테스트 응답이며 실제 행정 업무 준비 상태는 평가하지 않았습니다."
}
```

선택적 서버 내부 Research 입력 예시(전화 연결 실패, 유효한 OpenAI 키·잔액 필요):

```json
{
  "procedure": "national_pension_premium_change",
  "goal": "국민연금 보험료를 올리고 싶은데 전화가 안 된다",
  "subscriberType": "voluntary",
  "applicant": "self",
  "changeGoal": "increase",
  "unavailableChannel": "phone"
}
```

검색 결과와 실제 읽은 원문에 따라 경로 목록·근거·미확인 사항이 달라집니다. 전화 어려움을 법적 신청 불가로 해석하지 않습니다. 공식 경로 존재와 개인의 이용 가능성을 구분하며, 인증/권한/서류가 불명확하면 unverified로 보류합니다. goal은 선택 사항으로 최대 300자이며 구조화된 값을 덮어쓰지 않습니다. 가입 유형 확인 방법 자체를 조사할 때도 goal로 표현할 수 있습니다. 개인정보는 입력하지 마세요.

가입 유형 미확인과 goal 생략 시 needs_information, other는 unsupported입니다. 기술적 실패는 isError=true와 content의 `{ "error": { "code", "message" } }`로 구분하며 성공 structuredContent를 만들지 않습니다.

```sh
pnpm typecheck
pnpm test
# 별도 터미널에서 pnpm dev를 실행한 상태
pnpm smoke
# 실제 공식 원문 조회 (OpenAI 키 불필요)
pnpm smoke --sources
# 기존 MCP 클라이언트 호환 모드에서도 원문 조회
pnpm smoke --sources --legacy
# 선택적 내부 OpenAI Research (서버에 키·잔액 필요)
pnpm smoke --live
# 외부 엔드포인트도 같은 방법으로 검증
pnpm smoke --sources https://YOUR-HOST/mcp
pnpm smoke --sources --legacy https://YOUR-HOST/mcp
```

기본 smoke는 tools/list의 3개 도구, test, 정보 부족/지원 범위, 출발점 목록과 차단 URL을 확인합니다. --sources는 실제 국민연금공단 원문을 읽고 URL·본문·시각을 출력합니다. --live는 실제 서버의 모델·검색·원문 조회를 호출하고 결과 전체를 출력하며, 실패 시 비정상 종료합니다. pnpm test의 업무 호출은 주입한 Fake 기반 HTTP 테스트이므로 실제 API 성공의 증거가 아닙니다.

이번 단계에서 실제 국민연금 변경 안내 원문 조회와 로컬 modern/legacy MCP 호출을 확인했습니다. Fake 테스트와 실제 조회는 별개입니다. 최신 사용자 확인으로 Cloudflare HTTPS·vooy 사용자 지정 MCP 연결 및 기존 3개 도구 인식은 성공했고 Recipe Studio는 출시 심사 대기 중입니다. 이번 법령 확장 개발에서는 기존 공개 연결을 변경하지 않았으며 신규 도구의 공개/Recipe 호출은 검증하지 않았습니다. 내부 OpenAI Research의 --live 성공도 별도 검증 대상이며 기본 데모의 전제 조건이 아닙니다.

vooy에서는 전송 방식으로 **Streamable HTTP**, 서버 URL로 `https://YOUR-HOST/mcp`를 지정합니다.
SDK v2 `createMcpHandler`의 기본 `legacy: 'stateless'` 지원을 유지하여 기존 클라이언트의 initialize 흐름도 수용합니다.
이전 HTTP+SSE 전용 `/sse` 전송은 제공하지 않습니다. 기존 vooy 연결은 사용자 확인으로 성공했으며 이번 작업에서는 변경하지 않습니다.

## 선택적 법제처 API 확장 (기본 비활성)

심사 중인 기존 서버를 보호하기 위해 별도 `feat/official-law-api` worktree에서 개발합니다. `ENABLE_LAW_API` 미설정/false이면 기존 3개 도구만 제공합니다. 문자열 true일 때만 `search_official_laws`, `get_official_law`를 추가하며 기존 도구 계약·Cloudflare 설정·내부 OpenAI Research는 변경하지 않습니다.

`LAW_API_OC`는 서버에 승인된 인증값을 설정합니다. OpenAI 키는 필요 없으며 OC가 없으면 신규 도구 호출 시 law_api_not_configured를 반환합니다. HTTPS 고정 API만 호출하고 인증값 포함 URL을 결과·출처·로그에 노출하지 않습니다. 법적 규정과 실제 민원 접수 경로는 구분합니다.

```sh
# 공개 서버 디렉터리가 아닌 개발 worktree에서 실행, LAW_API_OC는 안전하게 별도 설정
PORT=3002 ENABLE_LAW_API=true pnpm dev
# 다른 터미널: 도구 등록만 확인
pnpm exec tsx scripts/law-smoke.ts http://127.0.0.1:3002/mcp
# 승인 인증값이 서버에 설정된 경우에만 Live 검색→관련 조문 조회
pnpm exec tsx scripts/law-smoke.ts --live http://127.0.0.1:3002/mcp
```

ID는 현행 조회, MST+시행일은 특정 시행본 조회입니다. 관련 article을 지정하며 크기 초과 시 일부를 전체처럼 반환하지 않습니다. JSON/XML 형식 변화·인증·네트워크 실패는 도구 오류입니다. 정확한 계약·한도·샘플 및 승인 인증값 검증의 차이·운영 반영 절차는 [법령 API 가이드](docs/law-api.md)를 따릅니다. 기본 smoke는 계속 3개 도구 서버를 대상으로 사용합니다.

## 선택적 내부 Research 정책과 제한

- 공식 도메인: nps.or.kr, gov.kr, law.go.kr 및 정확한 하위 도메인. GET 공개 원문만 읽습니다.
- 결정 3라운드, 검색 API 요청 4개, 원문 열람 시도 6개. 전체 90초, HTTP 15초, 모델 호출 30초. SDK 재시도 없음.
- 문서당 1 MB / 추출 24,000자, 리다이렉트 3회. 내부/예약 IP와 공식 밖 리다이렉트를 차단하며 DNS 주소를 연결에 고정합니다.
- HTML/텍스트만 지원합니다. PDF·JS 전용·인증 화면은 미확인으로 남깁니다. 검색 요약만으로 Evidence를 만들지 않습니다.
- 정확한 원문 인용과 별도 모델 문맥 검토 후에도 법적 의미·최신성·개별 적용의 정확성을 보장하지 않습니다. 판단이 불확실하면 보류합니다.
- 한도에서 검증된 사실이 일부 있으면 partial + research_limit, 없으면 research_incomplete 오류입니다. API/키 장애를 행정 결과로 바꾸거나 정적 사실로 대체하지 않습니다.

API 구현 근거: [Responses web_search](https://developers.openai.com/api/docs/guides/tools-web-search), [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). 검색 API 요청당 max_tool_calls=1이며 제공자 내부의 검색 질의 재작성 횟수까지 제어하는 것은 아닙니다.

## HTTPS / cloudflared 연결

[Cloudflare 공식 설치·Named Tunnel 안내](https://developers.cloudflare.com/tunnel/features/locally-managed-tunnels/create-local-tunnel/)에 따라 cloudflared를 준비합니다. 구체 명령과 설정은 [연결 가이드](docs/vooy-integration.md#https-공개)를 따릅니다.
SDK 기본 legacy 응답은 SSE를 사용하므로 **기존 클라이언트와 vooy 검증에는 Named Tunnel을 사용하세요**.
Cloudflare에서 Named Tunnel의 공개 호스트를 만들고 서비스를 `http://127.0.0.1:3000`으로 지정한 뒤,
안내된 cloudflared 실행 명령으로 연결합니다. 정확한 공개 호스트명을 허용하고 서버를 실행합니다.

```sh
ALLOWED_HOSTS=localhost,127.0.0.1,YOUR-HOST pnpm dev
# 별도 터미널
pnpm smoke --sources https://YOUR-HOST/mcp
pnpm smoke --sources --legacy https://YOUR-HOST/mcp
```

토큰은 저장소나 로그에 공유하지 마세요. [Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) 실행은
`cloudflared tunnel --url http://127.0.0.1:3000`이지만, SSE 미지원 제약이 있어 기존 클라이언트 호환 검증을 대신하지 않습니다.

Origin 없는 서버 클라이언트는 허용됩니다. 기본 Origin 허용 목록은 로컬 호스트이며,
브라우저 클라이언트가 필요하면 `ALLOWED_ORIGINS`에 그 클라이언트의 정확한 호스트명을 쉼표로 지정합니다.
SDK Origin 검증은 호스트 기준이며 포트를 구분하지 않습니다. CORS는 별도로 제공하지 않습니다.
인증 없는 공개 데모이므로 개인정보 없는 범주 입력과 짧은 행정 목표만 사용하세요. 서버는 요청 본문·헤더를 로그로 남기지 않으며,
외부 조회는 허용된 공식 원문의 읽기로 제한하며, 파일 접근·외부 쓰기·민원 제출 도구는 제공하지 않습니다. 종료할 때 터널도 중단합니다.

## 관련 설계 문서

1. [문제 정의와 원문 보존 상태](docs/problem-definition.md)
2. [제품 명세와 MVP 범위](docs/brief.md)
3. [현재 및 목표 도구 계약](docs/tool-contract.md)
4. [공식 자료와 검증 상태](docs/sources.md)
5. [현재 구조와 목표 아키텍처](docs/architecture.md)

개발 규칙은 [AGENTS.md](AGENTS.md)를 따릅니다. [sources.md](docs/sources.md)는 과거 조사 기록이며 새 실행의 근거를 대신하지 않습니다. 공개 HTTPS 주소와 vooy Recipe Studio에서 실제 도구 호출까지 확인해야 해커톤 연동 완료입니다. 현재 확인 상태는 [연결 가이드](docs/vooy-integration.md)에 기록합니다.
문제 정의 11개 섹션의 원문은 저장소에 없어 problem-definition.md에 누락 상태와 이번 요청의 배경을 구분해 기록했습니다.
패키지 버전은 package.json과 pnpm-lock.yaml을 기준으로 합니다.

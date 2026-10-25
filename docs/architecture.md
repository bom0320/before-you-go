# Architecture

## 요청 흐름과 책임

```text
User → vooy → MCP Tool → Research Orchestrator
                         ├─ Agent: search / inspect / complete / needs_information 결정
                         ├─ Harness: 한도·공식 도메인·GET·원문 크기·시간 강제
                         └─ 실제 읽은 Source Context → Evidence 검증
                       → Procedure Resolution → Result + Evidence → vooy → User
```

Agent가 조사 목적·질의·열람 대상·근거 충분성·경로 후보와 미확인 조건을 판단한다. Harness는 검색·열람 권한과 예산, 입력·출력 및 출처·인용·참조 검증을 소유한다. vooy는 상황 수집·MCP 호출·결과 안내를 맡는다. 외부 문서는 공식 사이트여도 명령이 아닌 비신뢰 데이터이며, 이미 제공된 구조화 사용자 정보를 자연어 goal로 바꾸지 않는다.

단일 Research Loop이며 별도 서비스·에이전트 조직·DB·큐·workflow framework는 없다. 참고한 ai-workspace의 planning-loop/planner/limits/validate-evidence/project-direction은 결정 계약·예산·제공 컨텍스트에 대한 근거 검증 원칙만 반영했다. 코드를 복사하거나 실행하지 않았다.

## 현재 구현 — 코드에서 확인한 상태

| 파일 | 실제 역할 |
| --- | --- |
| `src/index.ts` | PORT 검사, 허용 Host/Origin 설정 전달, 127.0.0.1 바인딩, 실행·종료 |
| `src/http.ts` | Node HTTP 서버, SDK Host/Origin 검증, `/mcp` 라우팅, 오류 응답, 핸들러 정리 |
| `src/mcp.ts` | test 또는 실제 Research 호출. 정상 결과 텍스트/structuredContent 일치, 기술 실패 isError |
| `src/procedure/schema.ts` | Zod 업무 입출력 계약과 TypeScript 타입 |
| `src/procedure/data.ts` | 과거 조사 스냅샷. 실제 실행에서 import하지 않음 |
| `src/procedure/check.ts` | 순수 입력 사전 확인과 검증된 조사 초안의 결과 매핑. 어려운 경로의 다음 행동 제외 |
| `src/research/run-research.ts` | 결정 실행·예산·전체 타임아웃·실패/부분 결과 제어 |
| `src/research/researcher.ts` | 실제 Responses 구조화 결정 및 원문 문맥 검토 호출 |
| `src/research/search.ts` | 강제 web_search와 도메인 필터, 도구가 반환한 출처 목록만 후보화 |
| `src/research/fetch-source.ts` | 공식 URL·공개 DNS 검증과 연결 IP 고정, GET·리다이렉트·크기/시간 제한, 원문/링크 추출 |
| `src/research/validate-evidence.ts` | 이번 열람 원문·인용·문맥 판정·참조·신청 URL 검사 및 Harness Evidence ID 발급 |
| `src/research/schema.ts` | 결정·컨텍스트·findings·review 계약과 실행 한도 |
| `test/procedure.test.ts` | 질문·지원 범위·Zod 입력 검증 |
| `scripts/smoke.ts` | 실행 중인 서버에 SDK 클라이언트로 연결해 test/정보 부족/지원 범위 확인. --live 시 별도 실제 업무 호출 |
| `test/research.test.ts` | Fake 모델/검색/원문과 실제 SDK 요청 직렬화로 동적 결과·실패·한도·SSRF·근거 검사 |
| `test/http.test.ts` | 실제 HTTP 포트에서 legacy/auto 클라이언트의 test/업무 호출, 입력 거부, Host/Origin 및 경로 검증 |

현재 흐름은 `HTTP → createMcpHandler → createMcpServer → test 또는 runResearch → 검증 → resolveProcedure → Result + Evidence`다. SDK v2 `createMcpHandler`와 `@modelcontextprotocol/node`의 `toNodeHandler`를 사용하며 기본 legacy stateless 지원을 유지한다. 세션 DB나 별도 `/sse` 서버는 없다.

procedure는 test와 national_pension_premium_change를 구분한다. 가입 유형 미확인은 질문, 다른 가입 유형은 unsupported, 상황이 확인된 임의가입자는 경로와 근거를 반환하되 needs_verification으로 보류한다. 원문은 요청마다 조회하며 세션 DB·영속 저장·과거 문서의 자동 갱신은 없다. vooy와 공개 터널의 실제 연결 성공은 아직 검증되지 않았다. 실행 및 cloudflared 제약은 [README](../README.md)를 따른다.

## Research 실행과 강제 한도

기본 한도: 결정 3라운드, Agent가 제출한 검색 질의/API 요청 4개, 원문 열람 시도 6개(실패 포함), 전체 90초, HTTP 15초(DNS 포함), 모델 요청 30초. 문서당 수신 1 MB·추출 24,000문자, 리다이렉트 3회. 동일 URL 재열람은 금지하고 발견 후보는 최대 24개로 제한한다. 한도는 서버가 검사하며 모델이 늘릴 수 없다. SDK 재시도는 0이다. hosted web_search는 요청당 max_tool_calls=1을 사용한다. 제공자 내부의 질의 재작성·검색 엔진 요청 수까지 제어하는 것은 아니며, maxSearchQueries는 서버가 실행하는 검색 API 요청 수다.

보통 search → inspect → complete이며 한 라운드에서 여러 공식 원문을 열 수 있다. 원문 링크도 서버가 확인한 공식 후보로 추가할 수 있다. 부족한 입력이고 goal이 없으면 질문/unsupported를 순수 사전 확인으로 반환한다. goal이 있으면 모델이 정보 확인 질문 또는 가입 유형 확인 방법 조사를 결정할 수 있지만, 이미 알려진 구조화 값을 다시 요구하는 질문은 거부한다.

키 누락·API/모델 검토 장애·전체 타임아웃은 도구 오류다. 일부 문서 실패는 source_unavailable로 명시하고 실패 문서는 Evidence에 쓰지 않는다. 한도까지 전체 초안 검증을 마치지 못했으나 인용·문맥 검토를 통과한 사실이 있으면 research_limit이 붙은 보수적 부분 결과를 반환한다. 근거가 전혀 없으면 research_incomplete 오류다. 부분 결과도 정적 데이터 fallback이 아니다.

## 원문과 Evidence 정책

검색은 OpenAI Responses web_search의 allowed_domains=[nps.or.kr, gov.kr, law.go.kr], include=web_search_call.action.sources를 사용한다. 생성된 요약이나 텍스트의 URL은 후보/근거로 인정하지 않는다. 원문 조회는 HTTPS와 정확한 공식 도메인/하위 도메인만 허용하고 userinfo·다른 포트·내부/예약 IP를 차단한다. DNS의 모든 응답을 검사한 뒤 실제 소켓에 고정하여 재해석 우회를 방지한다. 각 리다이렉트도 재검사하며 쿠키·로그인·쓰기·스크립트 실행은 없다.

현재 HTML/plain text만 지원한다. PDF·이미지·JavaScript 전용 화면은 접근 실패로 기록한다. HTML에서 script/style/입력 컨트롤/navigation 등을 제거하고 실제 본문을 공백 정규화하여 모델에 제공한다. 지시문이 제거되지 않고 본문에 남아도 비신뢰 데이터로만 전달한다. 인증 필요 화면과 일반 페이지의 자동 구분은 보수적인 휴리스틱이므로 실제 양식을 읽었다고 보장하지 않는다.

Finding은 이번 source ID와 20~1,500자 인용이 있어야 한다. 서버는 정규화된 실제 본문에서 인용의 존재를 결정적으로 검사한다. 이후 도구 권한이 없는 Responses 문맥 검토가 주장·시점·업무·가입 유형·신청 주체·예외를 평가한다. 불명확하면 확정 Evidence로 인정하지 않는다. 문자열 일치도 모델 검토도 법적 의미의 정확성 보장은 아니다.

최종 초안의 check/evidence/channel 참조와 관측한 신청 URL을 검사한다. applicationUrl은 실제 읽은 주소나 해당 인용 원문에 관측한 공식 링크여야 하며 안내 페이지를 신청 페이지로 바꾸어 말하지 않도록 문맥도 검토한다. Evidence ID·기관·URL·인용·조회 시각은 Harness가 구성한다. 개인의 신분·인증·권한을 독립 검증하지 못하는 현재 입력 계약에서는 ready/not_ready/use_channel을 차단한다. 이것은 업무별 행정 조건을 하드코딩한 것이 아니라 확정 판단의 증거 경계다.

## 모델과 테스트

OPENAI_API_KEY는 서버 환경에서만 사용하고 OPENAI_MODEL 기본값은 gpt-4.1이다. Responses API와 SDK의 zodTextFormat을 사용한다. 모델 결정 출력은 모든 필드가 필수인 flat object(type, queries, sourceIds, findings, draft, questions)이며 미사용 값은 빈 배열/null이다. 어댑터가 기존 내부 Decision union으로 변환하면서 분기별 필수 값·미사용 필드·HTTPS URL을 검증한다. 모델용 스키마에는 지원되지 않는 URI format을 전송하지 않으며 MCP 출력 계약은 유지한다. review는 기존 필수 필드의 strict object를 사용한다. Agent와 search/inspect/review는 테스트에서만 Fake로 주입한다. 기본 pnpm test는 외부 유료 API를 호출하지 않는다. 실제 검색 성공 여부는 pnpm smoke --live로 별도 검증한다. 구체 설정·공식 문서 링크는 [README](../README.md)를 따른다.

## 경계와 공개 데모

현재는 루프백 서버와 명시적 Host/Origin 허용 목록을 사용한다. 인증 시스템은 없으며 계약에 정의한 범주 값과 짧은 goal만 받는다. 업무 입력은 범주 값과 최대 300자의 짧은 goal로 제한하고 개인정보·계정·증빙 원문을 수집하지 않는다. 인증 시스템 설계나 실제 신청 기능은 이번 범위에 포함하지 않는다.

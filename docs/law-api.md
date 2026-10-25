# 법제처 API — 선택 활성화 확장

## 운영 서버 격리

이번 개발은 `/private/tmp/before-you-go-official-law-api`, `feat/official-law-api` worktree에서 진행했다. 기존 `/Users/omb/orca/before-you-go`의 main 파일·3000번 서버·Cloudflare 설정·vooy 등록은 수정하지 않는다. 의존성은 동일 lockfile로 별도 설치하며 기존 서버의 node_modules를 수정하지 않는다. `/tmp` worktree는 임시 위치이므로 장기 보존하려면 이후 명시적으로 브랜치를 커밋·푸시해야 한다.

`ENABLE_LAW_API`는 문자열 `true`일 때만 활성화된다. 미설정·false·TRUE 등은 기존 3개 도구만 등록한다. `LAW_API_OC`가 없어도 기본 도구·서버 시작은 정상이며, 활성화된 신규 도구를 호출할 때 `law_api_not_configured` 오류를 반환한다. OC나 OpenAI 키를 클라이언트에서 받지 않는다.

## 확인한 공식 사양과 실측 범위

- [시행일 법령 검색 API](https://open.law.go.kr/LSO/openApi/guideResult.do?htmlName=lsEfYdListGuide): lawSearch.do, target=eflaw, OC, type=JSON, query, nw, display, page.
- [시행일 법령 본문 API](https://open.law.go.kr/LSO/openApi/guideResult.do?htmlName=lsEfYdInfoGuide): lawService.do, target=eflaw, ID 또는 MST, MST에는 efYd, 조문 JO는 6자리다.
- 문서의 공개 샘플 OC=test를 HTTPS로 호출하여 검색·검색 0건·ID 조문·MST+efYd 조문 응답을 확인했다(2026-10-25). 리다이렉트 없이 HTTPS 200 JSON이 반환됐다. ID=006709 및 MST=283561/efYd=20260213/JO=000200에서 같은 시행규칙 제2조가 반환됐다. 이 번호·날짜를 실행 규칙이나 상수로 고정하지 않는다.
- 해당 샘플 응답에서 OC 포함 상세 링크와 불필요한 연락처 메타데이터를 제거하여 test/fixtures/law에 회귀 자료로 보존했다. fixture는 현재 실행의 최신 Evidence가 아니다. 실제 응답은 Zod로 검증하며 새 형식은 안전하게 오류 처리한다.
- 인증값 없는 공식 열람 URL `https://www.law.go.kr/LSW/lsInfoP.do?lsId=006709`의 HTTPS 200 및 국민연금법 시행규칙 제목을 확인했다. 시행본 URL도 `lsiSeq`와 `efYd`를 사용하여 확인했다.
- 승인된 LAW_API_OC는 작업 환경에 없어 **승인 인증값을 사용한 신규 MCP 도구 Live E2E는 미검증**이다. 공개 샘플 HTTPS 확인·fixture 기반 MCP 테스트·실제 승인 인증값 검증을 구분한다. 테스트나 제품에서 OC=test를 자동 대체값으로 사용하지 않는다.

## 입력·출력 계약

### search_official_laws

입력은 strict object다.

```json
{ "query": "국민연금법", "version": "current", "display": 5, "page": 1 }
```

- query: trim 후 1~100자, 필수. 법령명 검색(search=1). 개인정보를 넣지 않는다.
- version: 선택, 기본 current. current→nw=3, scheduled→2, historical→1, all→1,2,3.
- display: 선택, 기본 5, 최대 10. page: 선택, 기본 1, 최대 100.
- 반환: mode=official_law_search, provider, retrievedAt, page, totalCount, versionFilter, laws, notice.
- laws: title, lawId(법령ID), masterId(법령일련번호/MST), version(API 현행연혁코드 원문), effectiveDate(YYYYMMDD), sourceUrl(OC 없는 공식 열람 주소).
- 검색 0건은 laws=[]다. 형식 오류·인증 오류를 0건으로 바꾸지 않는다. 법령명 검색 결과는 법적 요건이나 개인별 적용을 확인한 결과가 아니다.

### get_official_law

입력은 strict object이며 ID와 MST의 역할을 분리한다.

```json
{ "lawId": "006709", "article": 2 }
```

ID는 **현행 본문** 조회다. effectiveDate를 함께 넣으면 API가 날짜를 무시하므로, 입력 단계에서 이를 거부한다. 과거·예정 법령을 ID로 재조회하면 해당 버전이 보존되지 않으므로 검색 응답의 masterId와 시행일을 사용한다.

```json
{ "masterId": "283561", "effectiveDate": "20260213", "article": 2 }
```

- lawId 또는 masterId 중 정확히 하나: 숫자 문자열 1~12자리. 검색 결과의 두 ID를 서로 대체하지 않는다.
- masterId에는 effectiveDate(실제 날짜 YYYYMMDD)가 필수다.
- article: 선택, 1~9999. articleBranch: 선택, 1~99, article과 함께만 사용. 제2조→000200, 제10조의2→001002로 JO를 구성한다.
- 조문을 생략할 수도 있지만 본문 조문이 20개 또는 24,000자를 넘으면 `law_api_result_too_large` 오류다. 임의로 앞부분만 잘라 전체 법령으로 반환하지 않는다. 관련 조문 번호를 다시 지정해야 한다.
- 반환: mode=official_law_text, provider, retrievedAt, title, lawId, masterId, effectiveDate, retrievalMode, sourceUrl, scope, articles, notice.
- retrievalMode는 current_by_id 또는 version_by_master다. masterId는 MST 요청값이며 API 기본정보에 없는 일련번호를 추정하지 않는다. ID 조회 결과의 masterId는 null이다.
- articles는 number, branch, jo, title(null 가능), effectiveDate(null 가능), text를 포함한다. 조문·항·호·목의 검증한 텍스트를 원래 순서대로 줄바꿈 연결하며 모델이 요약하지 않는다. 부칙·별표·서식·개정이유는 포함하지 않는다. scope는 requested_article 또는 main_articles로 반환 범위를 표시한다.
- 응답의 법령ID(ID 요청 시), 시행일(MST 요청 시), 조번호를 요청과 대조한다. API가 다른 조문·시행일을 반환하면 오류다. MST 번호 자체는 본문 기본정보에 없으므로 독립 비교하지 못한다.

성공 결과의 content JSON과 structuredContent는 같다. 실패는 isError=true와 `{ error: { code, message } }`만 반환하며 성공 structuredContent나 가짜 법령 원문을 만들지 않는다.

## 보안과 한도

- 고정된 `https://www.law.go.kr/DRF/lawSearch.do`와 `lawService.do`만 GET 호출한다. 사용자 URL·호스트·endpoint를 입력받지 않는다. HTTP 전환·리다이렉트·재시도는 하지 않는다.
- OC는 서버 환경에서 주입하고 쿼리 URL은 요청 내부에서만 사용한다. 원본 URL·헤더·응답·예외를 로그나 에러에 출력하지 않는다. upstream의 OC 포함 법령상세링크를 사용하지 않고 숫자 식별자로 공개 열람 주소를 구성한다. 정규화된 출력에 인증값이 반사되면 `law_api_sensitive_response`로 차단한다.
- 요청 전체 15초, 응답 1MB, 검색 최대 10건, 본문 최대 20조·24,000자. 신규 법령 API 전체 예산은 서버당 60초 고정 구간 12회·동시 2회다. 실패 요청도 소비하며 검색과 본문이 공유한다. 기존 read_official_source 예산과는 별개다. 서버 재시작 시 초기화된다.
- UTF-8 JSON 응답만 지원한다. XML·HTML·압축·비정상 JSON·Zod 구조 불일치는 명확한 오류다. XML 자동 전환이나 인증 우회를 하지 않는다. JSON으로 요청했는데 XML로 바뀐 경우에도 법령을 확인했다고 보고하지 않는다.
- 오류 코드: law_api_not_configured, law_api_auth_failed(HTTP 401/403), law_api_rejected(API 오류 코드), law_api_http_error, law_api_redirect_blocked, law_api_unexpected_format, law_api_invalid_response, law_api_timeout, law_api_network_error, law_api_response_too_large, law_api_result_too_large, law_api_budget_exceeded, law_api_version_mismatch, law_api_article_mismatch, law_api_no_articles, law_api_sensitive_response.
- JSON 오류 코드가 불명확하거나 HTTP 200 XML 오류만 돌아오면 인증 실패로 추정하지 않고 형식/응답 오류로 보고한다. 외부 본문은 실행 명령이 아닌 데이터다. 기술 실패를 근거 부족·신청 불가라는 행정 결과로 바꾸지 않는다.

## 독립 실행·검증

기존 공개 서버의 worktree·프로세스·Cloudflare 서비스 대상은 그대로 둔다. 같은 디렉터리에서 tsx watch를 실행 중이라면 파일 수정만으로 재시작될 수 있으므로 **개발 worktree에서만** 아래를 수행한다.

```sh
cd /private/tmp/before-you-go-official-law-api
pnpm typecheck
pnpm test
# 기본 3개 도구 회귀용. 기존 3000번 서버를 사용하지 않음
PORT=3001 ENABLE_LAW_API=false pnpm dev
# 별도 터미널
pnpm smoke http://127.0.0.1:3001/mcp
pnpm smoke --sources http://127.0.0.1:3001/mcp
```

별도 개발 터미널에서 승인받은 LAW_API_OC를 안전한 환경변수로 설정한다. 인증값은 채팅·Git·로그로 전달하지 않는다. .env 파일을 자동 로드하지 않는다.

```sh
# LAW_API_OC는 이 서버 셸에만 설정. 없어도 시작되며 호출 시 설정 오류
PORT=3002 ENABLE_LAW_API=true pnpm dev
# 별도 터미널: 도구 등록과 기존 test만 검증, 외부 API 호출 없음
pnpm exec tsx scripts/law-smoke.ts http://127.0.0.1:3002/mcp
# 승인 인증값이 서버에 설정된 경우에만 실제 검색 → 제2조 호출
pnpm exec tsx scripts/law-smoke.ts --live http://127.0.0.1:3002/mcp
```

## 이후 vooy에 노출하기

현재 출시 심사 서버를 재시작하거나 플래그를 켜지 않는다. 출시·심사 일정과 별도로 개발 서버의 승인 인증값 Live E2E를 먼저 확인한다. 이후 명시적인 배포 작업에서 변경을 검토·반영하고, 지정 서버에만 ENABLE_LAW_API=true와 LAW_API_OC를 설정한다. 새로운 HTTPS 개발 주소를 사용할 경우 기존 터널을 바꾸지 않고 별도 SSE 지원 터널·정확한 Host/Origin을 구성한다. 이번 작업에서는 배포·기존 터널·vooy Recipe를 변경하지 않는다.

활성화 후 vooy에서 도구 목록을 새로 조회하면 기존 3개에 search_official_laws/get_official_law가 추가되어야 한다. Recipe는 민원 안내 원문→대리 조건 확인 필요→법령 검색→MST+시행일+관련 조문 원문→두 자료 비교 순서로 사용한다. 일반 대리 규정만으로 가족의 권한·온라인 접수 가능성을 확정하지 않는다. 최종 안내는 vooy가, 개인별 조건 확인과 신청 결정은 사람이 맡는다. MCP는 vooy 자유 형식 답변을 검증했다고 주장하지 않는다.

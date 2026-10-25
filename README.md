# before-you-go

“행정 절차를 바꾸지 않아도, 그 절차를 찾아 헤매는 경험은 바꿀 수 있다.”

사용자 상황에 맞는 절차를 공식 근거와 대조하고, 현재 경로가 막혔을 때 검증된 대체 경로와 다음 행동을 안내하는 vooy MCP 해커톤 프로젝트입니다.

## MVP 범위와 현재 구현 상태

목표 MVP는 **국민연금 임의가입자의 보험료 변경 절차 안내와 사전 점검**입니다. 본인·가족 신청 의향·가입 유형 미확인·전화 연결 실패를 고려하며, 실제 신청 제출·승인·본인 인증·결제·정부기관 계정 연동은 제외합니다.

현재는 TypeScript/Node.js 및 공식 MCP SDK v2 기반 `/mcp` Streamable HTTP와 테스트 도구 한 개만 구현했습니다. 아래 임시 계약만 실행할 수 있으며, 업무 판단·신청 경로 및 대안 안내는 아직 구현하지 않았습니다. 프론트엔드·DB·로그인도 없습니다.

## 실행

Node.js 22.14 이상과 pnpm 11.7.0을 준비합니다(권장: Node.js 24 LTS).

```sh
pnpm install --frozen-lockfile
pnpm dev
```

기본 주소: `http://127.0.0.1:3000/mcp`. `PORT` 환경변수로 포트를 변경할 수 있습니다.
서버는 루프백에만 바인딩합니다. 환경변수는 셸에서 전달하며 `.env` 자동 로딩은 하지 않습니다.

## 도구와 검증

`check_procedure_readiness`의 입력:

```json
{ "procedure": "test" }
```

Zod strict object로 검증하며 다른 업무명, 타입, 추가 필드를 거부합니다.
성공 시 `content`의 JSON 텍스트와 동일한 `structuredContent`를 반환합니다.

```json
{
  "mode": "test",
  "status": "not_evaluated",
  "message": "MCP 도구 호출 성공. 명시적인 테스트 응답이며 실제 행정 업무 준비 상태는 평가하지 않았습니다."
}
```

```sh
pnpm typecheck
pnpm test
# 별도 터미널에서 pnpm dev를 실행한 상태
pnpm smoke
# 외부 엔드포인트도 같은 방법으로 검증
pnpm smoke https://YOUR-HOST/mcp
```

`smoke`는 공식 SDK 클라이언트로 initialize 후 `tools/list`, `tools/call`을 호출하고 결과를 출력·검증합니다.
`test`는 실제 임시 HTTP 포트에서 기존 프로토콜(legacy) 및 최신 프로토콜(auto)의 도구 목록·호출,
잘못된 입력 거부, Host/Origin 검증, 404를 확인합니다. 소켓 실행이 가능한 환경이 필요합니다.
브라우저 주소창의 GET은 MCP 도구 호출이 아닙니다. stateless 기존 프로토콜에서 GET/DELETE의 405는 정상입니다.

vooy에서는 전송 방식으로 **Streamable HTTP**, 서버 URL로 `https://YOUR-HOST/mcp`를 지정합니다.
SDK v2 `createMcpHandler`의 기본 `legacy: 'stateless'` 지원을 유지하여 기존 클라이언트의 initialize 흐름도 수용합니다.
이전 HTTP+SSE 전용 `/sse` 전송은 제공하지 않습니다. 실제 vooy 연결은 별도 검증이 필요합니다.

## cloudflared 연결

[Cloudflare 공식 설치 안내](https://developers.cloudflare.com/tunnel/get-started/)에 따라 cloudflared를 준비합니다.
SDK 기본 legacy 응답은 SSE를 사용하므로 **기존 클라이언트와 vooy 검증에는 Named Tunnel을 사용하세요**.
Cloudflare에서 Named Tunnel의 공개 호스트를 만들고 서비스를 `http://127.0.0.1:3000`으로 지정한 뒤,
안내된 cloudflared 실행 명령으로 연결합니다. 정확한 공개 호스트명을 허용하고 서버를 실행합니다.

```sh
ALLOWED_HOSTS=localhost,127.0.0.1,YOUR-HOST pnpm dev
# 별도 터미널
pnpm smoke https://YOUR-HOST/mcp
```

토큰은 저장소나 로그에 공유하지 마세요. [Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) 실행은
`cloudflared tunnel --url http://127.0.0.1:3000`이지만, SSE 미지원 제약이 있어 기존 클라이언트 호환 검증을 대신하지 않습니다.

Origin 없는 서버 클라이언트는 허용됩니다. 기본 Origin 허용 목록은 로컬 호스트이며,
브라우저 클라이언트가 필요하면 `ALLOWED_ORIGINS`에 그 클라이언트의 정확한 호스트명을 쉼표로 지정합니다.
SDK Origin 검증은 호스트 기준이며 포트를 구분하지 않습니다. CORS는 별도로 제공하지 않습니다.
인증 없는 공개 데모이므로 테스트 입력만 사용하세요. 서버는 요청 본문·헤더를 로그로 남기지 않으며,
외부 데이터 조회·파일 접근·쓰기 작업을 수행하는 도구를 노출하지 않습니다. 종료할 때 터널도 중단합니다.

## 관련 설계 문서

1. [문제 정의와 원문 보존 상태](docs/problem-definition.md)
2. [제품 명세와 MVP 범위](docs/brief.md)
3. [현재 및 목표 도구 계약](docs/tool-contract.md)
4. [공식 자료와 검증 상태](docs/sources.md)
5. [현재 구조와 목표 아키텍처](docs/architecture.md)

개발 규칙은 [AGENTS.md](AGENTS.md)를 따릅니다. 목표 업무 계약은 아직 미구현이며, 공식 행정 근거는 pending입니다.
문제 정의 11개 섹션의 원문은 저장소에 없어 problem-definition.md에 누락 상태와 이번 요청의 배경을 구분해 기록했습니다.
패키지 버전은 package.json과 pnpm-lock.yaml을 기준으로 합니다.

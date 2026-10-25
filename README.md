# before-you-go

vooy MCP 해커톤용 최소 TypeScript/Node.js MCP 서버. `/mcp`에서 Streamable HTTP를 제공합니다.
실제 국민연금 업무 규칙, 프론트엔드, 데이터베이스, 로그인은 구현하지 않았습니다.

이 체크아웃은 작업 시작 당시 `.git`만 있었으며 `AGENTS.md`와 `docs/`는 없었습니다.
아래 입력 계약은 통신 검증을 위한 임시 계약입니다. 프로젝트 문서가 제공되면 확인해야 합니다.

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
임시 Quick Tunnel은 다음과 같이 실행할 수 있습니다.

```sh
cloudflared tunnel --url http://127.0.0.1:3000
```

출력된 `https://random-name.trycloudflare.com`의 **정확한 호스트명**을 허용하고 서버를 실행(또는 재시작)합니다.
와일드카드를 사용하지 않습니다.

```sh
ALLOWED_HOSTS=localhost,127.0.0.1,random-name.trycloudflare.com pnpm dev
pnpm smoke https://random-name.trycloudflare.com/mcp
```

[Quick Tunnel은 SSE를 지원하지 않습니다](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).
SDK 기본 legacy 응답은 SSE를 사용하므로 **vooy 검증에는 Named Tunnel을 사용하세요**.
Cloudflare에서 Named Tunnel의 공개 호스트를 만들고 서비스를 `http://127.0.0.1:3000`으로 지정한 뒤,
안내된 cloudflared 실행 명령으로 연결합니다. 해당 공개 호스트를 `ALLOWED_HOSTS`에 추가하고
`pnpm smoke https://YOUR-HOST/mcp`로 검증합니다. 토큰은 저장소나 로그에 공유하지 마세요.
Quick Tunnel은 최신 프로토콜의 JSON 응답 확인에 한정할 수 있으며 기존 클라이언트 호환 검증을 대신하지 않습니다.

Origin 없는 서버 클라이언트는 허용됩니다. 기본 Origin 허용 목록은 로컬 호스트이며,
브라우저 클라이언트가 필요하면 `ALLOWED_ORIGINS`에 그 클라이언트의 정확한 호스트명을 쉼표로 지정합니다.
SDK Origin 검증은 호스트 기준이며 포트를 구분하지 않습니다. CORS는 별도로 제공하지 않습니다.
인증 없는 공개 데모이므로 테스트 입력만 사용하세요. 서버는 요청 본문·헤더를 로그로 남기지 않으며,
외부 데이터 조회·파일 접근·쓰기 작업을 수행하는 도구를 노출하지 않습니다. 종료할 때 터널도 중단합니다.

## 파일 구성과 다음 단계

- `src/mcp.ts`: Zod 계약과 MCP 도구 등록
- `src/http.ts`: HTTP 경로, SDK 어댑터, Host/Origin 검증
- `src/index.ts`: 환경 설정, 실행과 종료
- `scripts/smoke.ts`: 실행 중인 서버 호출 검증
- `test/http.test.ts`: HTTP 통합 테스트

다음 작업: 누락된 프로젝트 문서 확인, 정식 입력·출력 계약 확정, 근거 있는 업무 규칙 설계,
실제 vooy/Named Tunnel 연결 검증. 실제 개인정보나 업무 기능을 추가하기 전 인증·운영 정책을 설계해야 합니다.

API 근거: [공식 SDK v2 HTTP 및 기존 클라이언트 호환 안내](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/migration/support-2026-07-28.md).
패키지 버전은 `pnpm-lock.yaml`에 고정됩니다.

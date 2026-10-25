# Architecture

## 목표 요청 흐름과 책임

```text
User → vooy → MCP (/mcp) → Procedure Checker → Result → vooy → User
```

이 흐름의 Procedure Checker는 **목표 역할**이며 현재 구현된 모듈명이 아니다.

| 경계 | 책임 |
| --- | --- |
| User | 자신의 상황과 요청을 제공하고 확인 질문에 응답 |
| vooy | 대화 문맥에서 입력 구성, 도구 호출, 결과와 추가 질문을 사용자에게 전달 |
| MCP 서버 | Zod 입력 검증, 도구 계약 준수, 업무 판단 결과와 근거 반환 |
| Procedure Checker (목표) | 사용자 상황을 검증된 규칙에 대조하고 정보 부족·근거 부족·다음 행동 구분 |
| 공식 기관 | 행정 절차의 원출처 및 실제 접수·최종 판단 |

vooy가 가입 유형이나 대리 권한을 추정한 값은 공식 사실로 취급하지 않는다. 서버는 대화 기록 전체를 요구하지 않으며 전달된 입력만으로 판단한다. 추가 질문은 결과로 반환하고 vooy가 대화를 이어간다. 서버가 직접 신청하거나 사용자를 인증하지 않는다.

## 현재 구현 — 코드에서 확인한 상태

| 파일 | 실제 역할 |
| --- | --- |
| `src/index.ts` | PORT 검사, 허용 Host/Origin 설정 전달, 127.0.0.1 바인딩, 실행·종료 |
| `src/http.ts` | Node HTTP 서버, SDK Host/Origin 검증, `/mcp` 라우팅, 오류 응답, 핸들러 정리 |
| `src/mcp.ts` | McpServer 생성, 도구 한 개 등록, Zod 입출력 스키마, 고정 테스트 응답 |
| `scripts/smoke.ts` | 실행 중인 서버에 SDK 클라이언트로 연결해 tools/list·tools/call 확인 |
| `test/http.test.ts` | 실제 HTTP 포트에서 legacy/auto 클라이언트, 입력 거부, Host/Origin 및 경로 검증 |

현재 흐름은 `HTTP → createMcpHandler → createMcpServer → 고정 테스트 응답`이다. SDK v2 `createMcpHandler`와 `@modelcontextprotocol/node`의 `toNodeHandler`를 사용하며 기본 legacy stateless 지원을 유지한다. 세션 DB나 별도 `/sse` 서버는 없다.

`procedure: "test"`만 허용한다. 실제 규칙 대조, 질문 생성, 근거 조회·저장·갱신 기능은 없다. vooy와 공개 터널의 실제 연결 성공은 아직 검증되지 않았다. 실행 및 cloudflared 제약은 [README](../README.md)를 따른다.

## 목표 구조 — 다음 구현의 기준

MCP 도구 핸들러는 입력 검증 후 업무 점검 함수를 호출하고, 결과를 `structuredContent`와 같은 내용의 JSON 텍스트 `content`로 감싼다. 업무 함수는 가입 유형·신청 주체·변경 목표와 검증된 규칙을 받아 결과 객체를 만든다. HTTP Request/Response, SDK transport를 업무 함수에 전달하지 않는다.

업무 규칙은 전송 계층의 HTTP 분기에 넣지 않는다. 구현 시 작은 업무 함수와 필요한 규칙 데이터만 추가하며 저장소·서비스 계층·플러그인 체계를 미리 만들지 않는다. 목표 계약은 [tool-contract.md](tool-contract.md)에 정의한다. 아직 해당 함수나 파일은 존재하지 않는다.

## 공식 행정 정보 관리

[sources.md](sources.md)에 출처, 확인한 사실, 적용 범위, 예외, 검증 날짜와 상태를 기록한다. 사실마다 식별자를 두어 결과의 판단 근거와 연결한다. `verified` 사실만 규칙으로 전환하며 pending 항목은 질문 또는 불확실성으로 남긴다.

초기 MVP는 검토한 문서와 최소한의 코드 내 규칙으로 충분하다. 자동 크롤러·실시간 검색·외부 DB·자동 갱신기는 설계하지 않는다. 추후 코드에 규칙을 넣을 때 출처 사실 ID와 대응 테스트를 함께 관리한다. 변경·충돌·유효성 재검토가 필요한 사실은 다시 pending으로 돌리고 관련 확정 안내를 중단한다.

## 경계와 공개 데모

현재는 루프백 서버와 명시적 Host/Origin 허용 목록을 사용한다. 인증은 없으며 테스트 범주 값만 받는다. 목표 업무 입력도 최소 범주 값으로 한정하고 개인정보·계정·증빙 원문을 수집하지 않는다. 인증 시스템 설계나 실제 신청 기능은 이번 범위에 포함하지 않는다.

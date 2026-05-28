# map-dyoa-server

`map-dyoa` 서비스용 백엔드 API 서버입니다.  
Bun + Elysia + Drizzle(PostgreSQL) 기반으로 동작합니다.

## 주요 기능

- 일정(`schedules`), 스트리머(`streamers`), 클립(`clips`), 게임(`games`) API 제공
- 치지직 메타/라이브 상태 조회 API 제공
- 요청 단위 `requestId` 추적 및 JSON 구조 로그 출력(Fly/Loki 친화)
- 공통 에러 응답 포맷 및 5xx 예외 로깅

## 기술 스택

- Runtime: `bun`
- Web Framework: `elysia`
- DB ORM: `drizzle-orm`
- DB Driver: `postgres`
- Validation: `zod`
- Monitoring(옵션): `@sentry/elysia`

## 시작하기

### 1) 의존성 설치

```bash
npm install
```

또는

```bash
bun install
```

### 2) 환경변수 설정

루트의 `.env`를 사용합니다. 주요 항목:

- `DATABASE_URL`: PostgreSQL 연결 문자열
- `PORT`: 서버 포트(기본값 `3001`)
- `LOG_FORMAT`: `json` 또는 `text`
  - 미설정 시 production/Fly에서는 JSON 로그
- `SENTRY_DSN`: Sentry 사용 시 설정
- `SENTRY_TRACES_SAMPLE_RATE`: 성능 트레이스 샘플링(기본 `0`)

### 3) 개발 서버 실행

```bash
bun run dev
```

### 4) 프로덕션 실행

```bash
bun run start
```

## 스크립트

- `bun run dev`: watch 모드 개발 실행
- `bun run start`: 서버 실행
- `bun run typecheck`: 타입 검사
- `bun run db:introspect`: DB 스키마 introspect
- `bun run db:generate`: Drizzle 마이그레이션 생성
- `bun run db:push`: DB 반영
- `bun run db:studio`: Drizzle Studio
- `bun run sentry:verify`: Sentry 연결 확인

## API 헬스체크

- `GET /` : 서비스 상태
- `GET /health` : DB 연결 포함 헬스체크

## 로깅/에러 추적

이 프로젝트는 요청 단위로 `x-request-id`를 보장합니다.

- 모든 HTTP 요청은 `http_request` JSON 로그로 기록
- 4xx/5xx는 `outcome` 필드(`client_error`, `server_error`)로 구분
- 예외(특히 5xx)는 스택 포함 에러 로그로 별도 기록
- 응답 본문에도 `requestId`가 포함되어 로그와 상호 추적 가능

로그 예시(요약):

```json
{
  "ts": "2026-05-28T09:00:00.000Z",
  "level": "info",
  "msg": "http_request",
  "method": "GET",
  "path": "/chzzk/live-status",
  "status": 200,
  "durationMs": 12,
  "requestId": "..."
}
```

## Fly.io 배포

### 배포

```bash
fly deploy
```

### 로그 보기

```bash
fly logs -a <앱이름>
```

특정 요청 추적:

```bash
fly logs -a <앱이름> | rg "<requestId>"
```

에러 로그만 보기:

```bash
fly logs -a <앱이름> | rg "\"level\":\"error\""
```

## 디렉터리 구조(요약)

- `src/routes`: HTTP 라우트
- `src/services`: 비즈니스 로직
- `src/lib`: 공통 유틸/스키마/로깅
- `src/db`: DB 스키마/연결
- `drizzle`: 마이그레이션 파일

## 참고

- 프론트엔드와 연동 시 `requestId`를 에러 UI에 노출하면 운영 추적이 쉬워집니다.
- 로그 볼륨이 많아지면 Loki/Grafana에서 `msg="http_request"` 기준으로 필터링해 조회하는 것을 권장합니다.

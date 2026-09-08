# 마음의 여백

Groq API를 사용하는 한국어 AI 상담 웹사이트입니다. API 키는 서버에서만 읽으며 브라우저로 노출하지 않습니다.

## 실행

```bash
npm install
npm start
```

브라우저에서 `http://localhost:3000`을 엽니다.

`.env`에 `GROQ_API_KEY`를 설정해야 상담 API가 동작합니다. 기존 키를 옮길 때는 다음처럼 작성하세요.

```env
GROQ_API_KEY=your_key_here
PORT=3000
```

## 계정과 사용자 대화

헤더의 `로그인 / 가입`에서 계정을 만들면 `마음 친구` 탭을 사용할 수 있습니다. 로그인한 사용자끼리는 WebSocket 기반 1:1 실시간 대화를 할 수 있습니다. 계정 정보는 로컬의 `accounts.json`에 비밀번호 원문 없이 저장되며, 이 파일은 `.gitignore`로 제외됩니다.

현재 구조는 로컬 단일 서버용입니다. 여러 서버로 배포할 때는 계정과 세션을 PostgreSQL/Redis 같은 영속 저장소로 옮기고 HTTPS/WSS를 사용하세요.

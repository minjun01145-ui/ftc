# 프런트엔드 AI 계층

현재 화면에서는 이 폴더의 모듈을 사용하지 않습니다. AI 기능을 실제로 추가할 때만 필요한 화면/서비스에서 가져옵니다.

의존 방향:

`화면 -> aiClient -> transport -> 서버 gateway`

금지 사항:

- 화면에서 Ollama/Firebase/교육청 API를 직접 호출하지 않기
- 브라우저 코드에 API 키/토큰을 넣지 않기
- AI 공급자별 응답 형식을 화면 코드로 새어나오게 하지 않기

향후 Firebase를 교육청 API 게이트웨이로 교체할 때는 `transports` 또는 서버 endpoint 설정만 교체하는 것을 목표로 합니다.

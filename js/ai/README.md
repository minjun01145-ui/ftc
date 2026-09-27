# 프런트엔드 AI 계층

PDF/HWPX 일정 초안 가져오기에서 이 폴더의 AI client를 사용합니다. `aiConfig.js`의 주소가 비어 있으면 client는 `AI_NOT_CONFIGURED`를 반환하고, 일정은 변경하지 않습니다.

의존 방향:

`화면 -> 일정 가져오기 서비스 -> aiClient -> multipart transport -> aiDocumentGateway`

금지 사항:

- 화면에서 Ollama/Firebase/교육청 API를 직접 호출하지 않기
- 브라우저 코드에 API 키/토큰을 넣지 않기
- AI 공급자별 응답 형식을 화면 코드로 새어나오게 하지 않기
- 문서 바이트를 JSON이나 base64로 보내지 않기
- 문서 본문은 문서 gateway의 메모리 처리에만 사용하기

향후 Firebase를 교육청 API 게이트웨이로 교체할 때는 `transports` 또는 서버 endpoint 설정만 교체하는 것을 목표로 합니다.

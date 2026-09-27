# AI 연동 구조

PDF/HWPX 현장체험학습 일정 가져오기는 별도 Firebase Functions 코드베이스 `ai-functions/`에 구현합니다. 기본정보의 학교 조회 코드베이스와 배포, 설정, 시크릿, 의존성을 공유하지 않습니다.

## 의존 방향

```text
사업 일정 화면
  -> js/services/scheduleDocumentImport.js
  -> js/ai/aiClient.js
  -> multipart HTTP transport
  -> Firebase aiDocumentGateway
  -> 메모리 multipart parser
  -> PDF.js / HWPX ZIP XML 추출기
  -> trip-schedule-from-document capability
  -> provider factory / Ollama Cloud
```

문서 바이너리는 JSON 또는 base64로 보내지 않습니다. 서버는 PDF.js로 페이지 순서에 맞게 PDF 텍스트를 추출하고, HWPX는 `Preview/PrvText.txt`를 우선 사용한 뒤 `Contents/sectionN.xml`을 번호 순서로 읽습니다. OCR은 하지 않습니다. 문서와 추출 텍스트는 요청 처리 중 메모리에만 두고, 로그·localStorage·Firebase Storage에는 쓰지 않습니다.

## 보안과 응답

- 문서 gateway는 multipart 파일 한 개, 최대 10 MiB, `.pdf` 및 `.hwpx`만 받습니다. `.hwp`는 거절합니다.
- PDF는 확장자, MIME, PDF 서명을 확인합니다. HWPX MIME은 클라이언트마다 달라 확장자와 ZIP 서명/구조로 형식을 확인합니다.
- 크기, 요청 필드, 파일 개수와 capability를 AI 호출 전에 검증합니다. 추출 텍스트에도 크기 제한을 둡니다.
- 프런트엔드는 capability와 프로젝트 문맥만 보냅니다. 모델, provider, prompt는 서버 설정 및 capability가 결정합니다.
- capability는 문서 업로드 endpoint에서만 호출할 수 있고, 결과의 배열·필드·날짜·시간·길이를 서버에서 다시 검증합니다.
- 일정은 브라우저의 편집 가능한 초안으로만 표시합니다. 가져오기 자체는 저장하지 않습니다.
- AI 키는 Firebase Secret Manager의 `AI_PROVIDER_SECRETS`에만 저장합니다.

일반 JSON 호출의 `/aiGateway`와 64 KiB 요청 한도는 유지합니다. 문서 업로드는 `/aiDocumentGateway` 별도 함수와 multipart transport를 사용합니다.

## 현재 연결 설정

저장소에는 `.firebaserc`와 프로젝트별 AI 환경 파일이 없고 `js/ai/aiConfig.js`는 `enabled: false`, 빈 `gatewayUrl` 상태입니다. 2026-09-27에 기존 설정에 적힌 `ftc1-6b064` 프로젝트를 조회한 결과 `schoolInfoGateway`만 배포되어 있었습니다. 브라우저는 현재 `AI_NOT_CONFIGURED` 상태를 표시하며, 모델과 Secret Manager 설정 및 AI 배포를 마친 뒤에만 URL과 활성화 값을 넣습니다.

AI Functions를 배포할 때:

1. `ai-functions/.env.example`을 `.env.<프로젝트ID>`로 복사하고 provider, model, allowed origins를 설정합니다.
2. `AI_PROVIDER_SECRETS` Secret Manager 값에 provider API key를 JSON으로 저장합니다.
3. `firebase deploy --only functions:ai`를 실행합니다.
4. 공통 Firebase Functions 기본 주소를 `aiConfig.js`의 `gatewayUrl`에 넣고 `enabled`를 켭니다. AI 키는 프런트엔드 설정에 넣지 않습니다.

현재 구현 provider는 `ai-functions/src/ai/providers/ollamaProvider.js`입니다. 새 기능은 registry에 고정 capability를 등록하고 서버에서 request/payload/output을 검증합니다.

# AI 연동 기반 구조

이 버전은 AI 기능을 실제 화면에 연결하지 않습니다. 향후 AI 기능을 붙일 때 기존 계산/화면 코드를 공급자에 종속시키지 않기 위한 기반만 포함합니다.

## 의존 방향

```text
화면 또는 업무 서비스
  -> js/ai/aiClient.js
  -> js/ai/transports/*
  -> Firebase HTTPS Function(aiGateway)
  -> capability registry
  -> provider factory
  -> provider 구현(Ollama / 향후 교육청 API)
```

## 중요한 원칙

1. 브라우저에는 API 키를 저장하지 않습니다.
2. API 키를 입력하는 관리자페이지도 만들지 않습니다.
3. 비밀값은 Firebase Secret Manager에만 저장합니다.
4. 클라이언트는 임의의 prompt/model/provider를 서버에 넘길 수 없습니다.
5. 서버는 등록된 capability만 실행합니다.
6. 현재 capability registry는 비어 있으므로 실제 AI 기능은 없습니다.
7. 계산과 회계 검증의 기준 로직은 기존 `engine.js`에 남기고 AI는 추후 보조 기능으로만 추가합니다.

## 공급자 교체

현재 구현체는 `functions/src/ai/providers/ollamaProvider.js`입니다.

교육청 API가 생기면 다음 정도만 추가/수정합니다.

1. `functions/src/ai/providers/educationOfficeProvider.js` 작성
2. `functions/src/ai/providerFactory.js`에 provider 등록
3. 배포 설정의 `AI_PROVIDER`를 새 provider ID로 변경
4. 필요한 비밀값을 `AI_PROVIDER_SECRETS`에 갱신

프런트 화면, 계산엔진, capability 업무 로직은 그대로 유지하는 것을 목표로 합니다.

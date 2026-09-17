# 이번 정리 내용

기준: GitHub `main`의 2026-09-15 `v5` 상태를 바탕으로, 기능 개발을 계속하기 전에 필요한 최소 정리만 적용했습니다.

## 변경한 것

1. 인솔자 전용 비용 계산을 `js/views/expenseTable.js`에서 `js/engine.js`의 `calculateStaffExpense()`로 이동했습니다.
   - 계산 규칙이 DOM 뷰에 섞여 있던 부분만 옮겼습니다.
   - 계산 결과는 기존과 동일하게 유지했습니다.
   - 관련 테스트 3개를 추가했습니다.

2. `functions/src/index.js`의 불필요한 `AI_ALLOWED_ORIGINS` 직접 import와 `void AI_ALLOWED_ORIGINS` 참조를 제거했습니다.
   - 실제 설정 값은 기존처럼 `readAiRuntimeConfig()`를 통해 사용됩니다.

3. `DEVELOPMENT.md`를 추가했습니다.
   - `engine / views / app / presets / services / AI`의 역할을 설명합니다.
   - 이후 기능을 어느 파일에 넣어야 하는지 최소 규칙을 적었습니다.

4. README에 현재 `staffExpenses`의 계산 범위를 명시했습니다.
   - `allocateFunding()`은 현재 학생용 `expenses` 기준입니다.
   - `staffExpenses` 독립 항목을 전체 행사비에 자동 합산하도록 바꾸지는 않았습니다.

## 일부러 건드리지 않은 것

- `app.js` 대규모 분할
- `expenseTable.js`의 DOM 처리 분할
- 저장 스키마 변경
- `actualParticipants`, `vulnerableParticipants` 같은 기존 파생 필드 삭제
- AI 스캐폴딩 삭제
- 학교알리미 stub 삭제
- `staffExpenses`를 학생 재원 배분/전체비용에 합산하는 기능 변경

이 부분들은 실제 기능 요구가 더 정해진 뒤 정리하는 편이 안전합니다.

## 앞으로 주의할 곳

새 기능을 추가하면서 `app.js`와 `expenseTable.js`에 계속 분기와 업무 로직을 넣지 않는 것이 가장 중요합니다. 외부 API/AI/문서 생성처럼 별도 책임을 가진 기능은 처음부터 서비스 또는 별도 모듈로 추가하는 편이 좋습니다.

`staffExpenses`를 회계상 어떤 합계에 포함할지는 전체비용/인솔자 예산 기능을 만들기 전에 먼저 확정해야 합니다.

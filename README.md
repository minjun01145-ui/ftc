# 현장체험학습 비용 관리

현장체험학습의 인원, 일정별 체험처, 학생·인솔자 비용, 지원금 배분, 학생 부담액 계산과 정산을 돕는 브라우저 기반 프로그램입니다.

## 실행

별도 빌드 과정이 없습니다.

```bash
python3 -m http.server 8000
```

브라우저에서 `http://localhost:8000`으로 접속합니다.

## 입력과 저장 방식

입력 중에는 상태 저장이나 전체 화면 재렌더링을 하지 않습니다. 한글 IME 조합과 숫자 입력 커서가 끊기지 않도록 사용자가 `저장`을 눌렀을 때만 화면 값을 상태에 반영합니다.

기본정보 화면에서 부산광역시의 교육지원청을 선택해 학교를 검색할 수 있습니다. 학교를 선택하면 학교알리미 OpenAPI로 1~3학년 학생수를 자동 조회합니다. 실제 학생수와 비교해 수정한 다음 `저장`을 눌러야 브라우저에 반영됩니다. 페이지를 이동할 때 저장하지 않은 변경사항이 있으면 기존 확인창이 표시됩니다.

### 부산 학교 조회 연결

학교 목록은 학교알리미 OpenAPI의 학교기본정보를, 학생수는 `학년별·학급별 학생수` 항목을 사용합니다. 학교알리미 공시자료는 최근 3년만 제공되므로 조회할 공시연도도 최근 3년 범위여야 합니다.

실제 Firebase 프로젝트 ID와 개인 API 키는 저장소에 기록하지 않습니다. 부산 학교 조회에는 학교알리미 키만 사용하며, NEIS 키는 필요하지 않습니다. 학교 조회와 AI는 별도의 Firebase 코드베이스와 환경 설정으로 관리합니다.

1. Firebase CLI에서 배포할 프로젝트를 선택합니다(`firebase use --add`). 저장소의 `.firebaserc.example`에는 예시용 ID만 있습니다.
2. 학교알리미에서 OpenAPI 키를 발급합니다.
3. `firebase functions:secrets:set SCHOOL_DATA_API_KEYS`로 Secret Manager에 시크릿을 만들고, 입력란에 학교알리미 API 키 원문을 붙여 넣습니다. 이 값은 JSON으로 감싸지 않습니다.

4. `functions/.env.example`을 `functions/.env.<프로젝트ID>`로 복사합니다. 예를 들어 프로젝트 ID가 `ftc1-6b064`이면 `functions/.env.ftc1-6b064`입니다. 이 파일은 Git에서 제외되며 학교 조회의 허용 출처만 설정합니다.
5. `firebase deploy --only functions:default`로 학교 조회 코드베이스만 배포합니다. AI 코드베이스는 이 배포에서 읽거나 변경하지 않습니다.
6. 배포 명령이 출력한 HTTPS 함수 주소를 [schoolInfoConfig.js](js/services/schoolInfoConfig.js)의 `gatewayUrl`에 설정합니다. 현재 저장소에는 `ftc1-6b064` 프로젝트의 주소가 설정되어 있습니다.

API 키는 Firebase Secret Manager에만 저장하며 프런트엔드 코드나 저장 파일에는 넣지 않습니다.

## 사업과 일정

사업 제목을 누르면 `사업정보` 화면이 열립니다. 기존 `전체보기`, `인원`, `체험처/비용`, `예산 관리`, `리포트 보기`, `정산` 화면은 하위메뉴에서 선택할 수 있습니다. `업무 흐름` 계산기와 저장 데이터는 과거 자료 및 확정 계획 호환을 위해 보존하지만 일반 화면으로 열 수 없습니다. 부분 화면 저장은 화면에 없는 사업 데이터를 보존합니다.

학교 기본정보에는 사업별 학교 지원 배정 입력을 두지 않습니다. 새 계산은 사업의 `schoolSupport`와 재원 목록에 입력된 학교 지원 금액 및 제한을 사용합니다. 가져오거나 기존 저장한 `school.projectBudgets`와 과거 확정 스냅샷은 정규화 과정에서 보존합니다.

사업정보의 일정에서 PDF 또는 HWPX 파일 한 개를 선택하면 문서 텍스트를 추출하고 일정 초안을 만듭니다. 날짜와 일정 항목을 확인·수정한 뒤 `저장`을 눌러야 일정과 연결 비용에 반영됩니다. 스캔 PDF의 OCR과 `.hwp`는 지원하지 않습니다. 문서 본문은 서버 메모리에서 처리하며 브라우저 저장 데이터나 Firebase Storage에 저장하지 않습니다.

일정 문서 기능을 연결하려면 Firebase 프로젝트 ID, 활성 AI gateway URL, 모델 및 Secret Manager 설정이 필요합니다. 현재 checkout에는 `.firebaserc`와 프로젝트별 AI 환경 파일이 없고 `js/ai/aiConfig.js`의 주소가 비어 있으며 기능이 비활성화되어 있습니다. 2026-09-27에 기존 설정에 적힌 `ftc1-6b064` 프로젝트를 조회했을 때 배포된 함수는 `schoolInfoGateway`뿐이었습니다. AI Functions 배포는 아직 확인되지 않았고, 미설정 상태에서 가져오기를 시도하면 `AI_NOT_CONFIGURED`가 표시됩니다.

1. 실제 Firebase 프로젝트를 선택하고 `ai-functions/.env.example`을 `.env.<프로젝트ID>`로 복사합니다. `AI_PROVIDER`, `AI_DEFAULT_MODEL`, `AI_ALLOWED_ORIGINS`를 설정합니다.
2. Ollama Cloud 키를 `firebase functions:secrets:set AI_PROVIDER_SECRETS`로 Secret Manager에 저장합니다. 값은 `{"apiKey":"..."}` JSON이며 저장소에 추가하지 않습니다.
3. `firebase deploy --only functions:ai`로 AI 코드베이스를 배포하고 출력된 `aiDocumentGateway` 함수 URL에서 공통 Functions 기본 주소를 확인합니다.
4. [`aiConfig.js`](js/ai/aiConfig.js)에서 `enabled: true`와 `gatewayUrl`을 설정합니다. `gatewayUrl`에는 함수 이름 경로를 제외한 공통 주소를 입력합니다. transport가 `aiHealth`, `aiGateway`, `aiDocumentGateway` 경로를 붙입니다.

## 체험처/비용

학생용과 인솔자용 비용은 별도 데이터로 저장됩니다.

- 기존 `expenses` 데이터는 학생용 비용으로 그대로 유지됩니다.
- 인솔자용은 `staffExpenses`에 별도로 저장됩니다.
- `학생용 작성 내용 붙여넣기`를 누르면 현재 화면의 학생용 행을 새 ID로 복사하므로 이후 두 표를 독립적으로 수정할 수 있습니다.
- 각 비용 항목에는 `도착 시간`, `나가는 시간`, `주소`, `관계자 연락처` 세부정보를 저장할 수 있습니다.
- 세부정보는 향후 안내자료 생성 기능에서 재사용할 수 있도록 비용 계산값과 분리된 `details` 객체에 저장됩니다.

`js/workflowEngine.js`가 계획·실적의 학생 재원, 학생 부담, 인솔자·운영 경비를 하나의 계산 결과로 산출합니다. 독립 인솔자 비용은 학생 재원에 섞지 않습니다.

## 파일 구조

- `index.html` : 기본 레이아웃
- `styles.css` : 화면 스타일
- `js/app.js` : 화면 전환과 사용자 동작 연결
- `js/state.js` : 메모리 상태와 명시적 저장 처리
- `js/storage.js` : localStorage 읽기/쓰기
- `js/presets.js` : 데이터 기본값, 생성 함수, 이전 데이터 정규화
- `js/engine.js` : DOM과 무관한 비용 행·기존 재원 계산
- `js/workflowEngine.js` : 집단 인원, 계획/실적, 동적 재원, 품의 분할, 확정 계획과 행정실 대조
- `js/services/workbookExport.js` : 공식 정산 서식 매핑과 브라우저 XLSX 작성
- `js/views/schoolView.js` : 기본정보 화면
- `js/projectSections.js` : 사업 하위메뉴 키와 순서 정의
- `js/views/sidebarView.js` : 사업 목록과 하위메뉴 렌더링
- `js/views/projectView.js` : 선택된 하위메뉴 조합 및 부분 폼 병합 저장
- `js/views/project/` : 사업 화면을 모듈별로 관리. 기존 workflow 데이터는 호환용으로 보존
- `js/views/expenseTable.js` : 학생·인솔자 비용표 렌더링과 DOM/폼 처리
- `js/services/schoolInfo.js` : 학교 검색·학생수 조회를 위한 프런트엔드 서비스
- `js/services/schoolInfoConfig.js` : 학교 조회 Firebase Function 주소 설정
- `js/services/scheduleDocumentImport.js` : PDF/HWPX 일정 업로드와 초안 응답 처리
- `js/ai/` : JSON 및 multipart AI client와 transport
- `functions/src/schoolData/` : 학교 조회 코드베이스의 학교알리미 검색·학생수 응답 모듈
- `functions/` : 학교 조회 전용 Firebase 코드베이스. AI 코드나 AI 시크릿을 참조하지 않음
- `ai-functions/` : PDF/HWPX 문서 gateway와 일정 capability가 있는 독립 코드베이스

개발 중 모듈 경계와 새 기능을 어디에 추가할지는 `DEVELOPMENT.md`를 참고합니다.

## 데이터 호환

현재 데이터 스키마 버전은 6입니다. v4·v5 JSON 데이터의 비용 ID와 실제 입력값을 보존하고, 기존 인원 상태는 새 신청·불참 입력 모델의 legacy 값으로 유지합니다. 실제 금액이 없던 이전 행은 `null`(미입력)로 유지합니다. 기존 `expenses`는 학생용 비용으로 유지하며 `staffExpenses`와 체험처 세부정보도 이어받습니다.

## 데이터 저장

`저장` 버튼을 누르면 브라우저 `localStorage`에 저장됩니다. 좌측의 `저장 파일 내보내기`와 `저장 파일 불러오기`로 JSON 백업을 만들 수 있습니다.

## 테스트

프런트 계산·데이터 모델 테스트:

```bash
npm test
```

계산, schema v4·v5 호환, 인원 입력 검증, 정수 원 분할, 재원 한도, 계획/정산 사례와 행정실 거래 테스트를 포함합니다. 학교 조회 Firebase Functions도 별도 테스트 명령을 제공합니다.

학교 조회와 AI 문서 gateway 테스트:

```bash
cd functions
npm test
cd ../ai-functions
npm test
```

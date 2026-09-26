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

학교 정보 화면에서 부산광역시의 교육지원청을 선택해 학교를 검색할 수 있습니다. 학교 검색과 1~3학년 학생수 조회 모두 학교알리미 OpenAPI를 사용합니다. 학생수는 조회 후에도 직접 수정할 수 있으며, `저장`을 눌러야 브라우저에 반영됩니다. 페이지를 이동할 때 저장하지 않은 변경사항이 있으면 기존 확인창이 표시됩니다.

### 부산 학교 조회 연결

학교 목록은 학교알리미 OpenAPI의 학교기본정보를, 학생수는 `학년별·학급별 학생수` 항목을 사용합니다. 학교알리미 공시자료는 최근 3년만 제공되므로 조회할 공시연도도 최근 3년 범위여야 합니다.

실제 Firebase 프로젝트 ID와 개인 API 키는 저장소에 기록하지 않습니다. 부산 학교 조회에는 학교알리미 키만 사용하며, NEIS 키는 필요하지 않습니다.

1. Firebase CLI에서 배포할 프로젝트를 선택합니다(`firebase use --add`). 저장소의 `.firebaserc.example`에는 예시용 ID만 있습니다.
2. 학교알리미에서 OpenAPI 키를 발급합니다.
3. `firebase functions:secrets:set SCHOOL_DATA_API_KEYS`로 아래 JSON 형식의 시크릿을 등록합니다.

   ```json
   {"schoolInfoApiKey":"학교알리미 키"}
   ```

4. `functions/.env.example`을 `functions/.env.<프로젝트ID>`로 복사합니다. 예를 들어 프로젝트 ID가 `ftc1-6b064`이면 `functions/.env.ftc1-6b064`입니다. 이 파일은 Git에서 제외되며, 배포에 필요한 비밀이 아닌 기본 환경 설정을 제공합니다.
5. `firebase deploy --only functions:schoolInfoGateway`로 함수를 배포합니다. CORS 허용 주소는 `AI_ALLOWED_ORIGINS` 설정을 사용합니다.
6. 배포 명령이 출력한 HTTPS 함수 주소를 [schoolInfoConfig.js](js/services/schoolInfoConfig.js)의 `gatewayUrl`에 설정합니다. 현재 저장소에는 `ftc1-6b064` 프로젝트의 주소가 설정되어 있습니다.

API 키는 Firebase Secret Manager에만 저장하며 프런트엔드 코드나 저장 파일에는 넣지 않습니다.

사업을 선택하면 좌측에서 다음 하위메뉴를 사용할 수 있습니다.

1. 전체보기
2. 사업정보
3. 인원
4. 체험처/비용
5. 예산 관리
6. 리포트 보기
7. 정산

`예산 관리`에는 예산 입력, 계획 계산, 계획 재원 배분이 함께 표시됩니다. `정산`에는 정산 계산과 정산 재원 배분만 표시됩니다. 하위메뉴 화면은 필요한 섹션만 렌더링하며 저장할 때도 화면에 존재하는 필드만 기존 사업 데이터에 병합합니다.

## 체험처/비용

학생용과 인솔자용 비용은 별도 데이터로 저장됩니다.

- 기존 `expenses` 데이터는 학생용 비용으로 그대로 유지됩니다.
- 인솔자용은 `staffExpenses`에 별도로 저장됩니다.
- `학생용 작성 내용 붙여넣기`를 누르면 현재 화면의 학생용 행을 새 ID로 복사하므로 이후 두 표를 독립적으로 수정할 수 있습니다.
- 각 비용 항목에는 `도착 시간`, `나가는 시간`, `주소`, `관계자 연락처` 세부정보를 저장할 수 있습니다.
- 세부정보는 향후 안내자료 생성 기능에서 재사용할 수 있도록 비용 계산값과 분리된 `details` 객체에 저장됩니다.

현재 `allocateFunding()`의 학생 재원 배분은 `expenses`를 기준으로 하며, `staffExpenses`는 자동 합산하지 않습니다. 인솔자 전용 비용을 전체 행사비에 어떤 방식으로 반영할지는 기능 요구사항이 확정된 뒤 명시적으로 연결합니다.

## 파일 구조

- `index.html` : 기본 레이아웃
- `styles.css` : 화면 스타일
- `js/app.js` : 화면 전환과 사용자 동작 연결
- `js/state.js` : 메모리 상태와 명시적 저장 처리
- `js/storage.js` : localStorage 읽기/쓰기
- `js/presets.js` : 데이터 기본값, 생성 함수, 이전 데이터 정규화
- `js/engine.js` : 학생·인솔자 비용 계산, 지원금 배분, 검증
- `js/views/schoolView.js` : 기본정보 화면
- `js/projectSections.js` : 사업 하위메뉴 키와 순서 정의
- `js/views/sidebarView.js` : 사업 목록과 하위메뉴 렌더링
- `js/views/projectView.js` : 선택된 하위메뉴 조합 및 부분 폼 병합 저장
- `js/views/project/` : 사업정보, 인원, 비용, 예산, 리포트, 정산을 각각 독립 뷰 모듈로 관리
- `js/views/expenseTable.js` : 학생·인솔자 비용표 렌더링과 DOM/폼 처리
- `js/services/schoolInfo.js` : 학교 검색·학생수 조회를 위한 프런트엔드 서비스
- `js/services/schoolInfoConfig.js` : 학교 조회 Firebase Function 주소 설정
- `js/ai/` : 향후 AI 프런트 연동 계층. 현재 화면에서는 사용하지 않음
- `functions/src/schoolData/` : 학교알리미 학교 검색과 학생수 응답을 정규화하는 서버 모듈
- `functions/` : 학교 공공데이터 프록시와 AI 게이트웨이. Firebase 미연결 상태에서도 기존 입력·저장 기능에는 영향 없음

개발 중 모듈 경계와 새 기능을 어디에 추가할지는 `DEVELOPMENT.md`를 참고합니다.

## 데이터 호환

현재 데이터 스키마 버전은 4입니다. 선택 학교를 기억하도록 교육지원청, 학교알리미 코드와 학교 구분값을 추가 저장하며, 기존 자료를 불러오면 빈 값으로 보완합니다. 이전 버전의 `expenses`는 학생용 비용으로 유지하며 `staffExpenses`와 체험처 세부정보 필드도 기본값으로 보완합니다.

## 데이터 저장

`저장` 버튼을 누르면 브라우저 `localStorage`에 저장됩니다. 좌측의 `저장 파일 내보내기`와 `저장 파일 불러오기`로 JSON 백업을 만들 수 있습니다.

## 테스트

프런트 계산·데이터 모델 테스트:

```bash
npm test
```

AI 기반 테스트:

```bash
cd functions
npm test
```

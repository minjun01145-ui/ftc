import { escapeHtml, formatWon, number } from '../utils.js';

const EDUCATION_OFFICES = [
  ['seobu', '서부교육지원청'],
  ['namBu', '남부교육지원청'],
  ['bukbu', '북부교육지원청'],
  ['dongnae', '동래교육지원청'],
  ['haeundae', '해운대교육지원청']
];

export function renderSchoolPage(school, projects = []) {
  const total = number(school.grade1Students) + number(school.grade2Students) + number(school.grade3Students);
  const officeOptions = EDUCATION_OFFICES.map(([value, label]) => `
    <option value="${value}" ${school.educationOffice === value ? 'selected' : ''}>${label}</option>
  `).join('');
  const assigned = projects.reduce((sum, project) => sum + number(school.projectBudgets?.[project.id]?.amount), 0);
  const budgetRows = projects.map(project => {
    const allocation = school.projectBudgets?.[project.id] ?? {};
    const grade = project.grade ? `${project.grade}학년` : '학년 미지정';
    return `<tr data-school-budget-row data-project-id="${escapeHtml(project.id)}">
      <td>${escapeHtml(project.title)}<small>${grade}</small></td>
      <td><input type="number" min="0" step="1" name="budgetAmount:${escapeHtml(project.id)}" value="${allocation.amount == null ? '' : number(allocation.amount)}" placeholder="배정 전"></td>
      <td class="center"><input type="checkbox" name="budgetFixed:${escapeHtml(project.id)}" ${allocation.fixed ? 'checked' : ''} aria-label="${escapeHtml(project.title)} 배정 고정"></td>
      <td><input type="number" min="0" step="1" name="budgetTarget:${escapeHtml(project.id)}" value="${allocation.targetBurden == null ? '' : number(allocation.targetBurden)}" placeholder="공통 목표 사용"></td>
      <td>${allocation.amount == null ? '미배정' : formatWon(number(allocation.amount))}</td>
      <td data-school-budget-suggestion>배분안 계산 전</td>
    </tr>`;
  }).join('');
  return `
    <h1>기본정보</h1>
    <form id="schoolForm">
      <fieldset>
        <legend>학교 조회</legend>
        <div class="school-lookup-grid">
          <label for="educationOffice">교육지원청</label>
          <select id="educationOffice" name="educationOffice">
            <option value="">교육지원청 선택</option>
            ${officeOptions}
          </select>

          <label for="schoolQuery">학교명 검색</label>
          <div class="school-search-controls">
            <input id="schoolQuery" name="schoolQuery" type="search" data-school-search autocomplete="off" placeholder="학교명을 입력하거나 비워 두고 검색하세요">
            <button type="button" data-action="search-schools">학교 검색</button>
          </div>
        </div>
        <p id="schoolSearchStatus" class="help" role="status" aria-live="polite">교육지원청을 선택한 뒤 학교를 검색하세요.</p>
        <div id="schoolSearchResults" class="school-search-results" role="listbox" aria-label="학교 검색 결과"></div>
      </fieldset>
      <fieldset>
        <legend>학년별 학교 자체 예산</legend>
        <p class="help">학년을 사업명에서 추측하지 않습니다. 사업의 업무 흐름에서 학년을 지정한 뒤 배정액과 고정 여부를 입력하세요. 재원별 학교 지원은 사업 배정액을 넘지 않도록 계산합니다.</p>
        <div class="form-grid school-budget-total-grid">
          <label for="annualSchoolBudget">학교 전체 가용 예산</label>
          <input id="annualSchoolBudget" name="annualSchoolBudget" type="number" min="0" step="1" value="${number(school.annualSchoolBudget)}">
          <label>현재 배정액</label><input readonly value="${assigned}">
        </div>
        <div class="table-wrap"><table class="school-budget-table"><thead><tr><th>사업/학년</th><th>배정액</th><th>고정</th><th>목표 비취약 1인 부담</th><th>저장된 배정</th><th>제안 배정 / 예상 부담</th></tr></thead>
          <tbody>${budgetRows || '<tr><td colspan="6" class="center">먼저 사업을 추가하고 각 사업의 학년을 지정하세요.</td></tr>'}</tbody>
        </table></div>
        <div class="toolbar">
          <button type="button" data-action="suggest-school-budget" ${projects.length ? '' : 'disabled'}>배분안 계산</button>
          <span class="help" data-school-budget-preview>학교 예산을 입력하면 저장 전 배분안을 계산할 수 있습니다.</span>
        </div>
      </fieldset>

      <fieldset>
        <legend>학교 정보</legend>
        <div class="form-grid">
          <label for="schoolName">학교명</label>
          <input id="schoolName" name="name" type="text" value="${escapeHtml(school.name)}">
          <label for="homepage">학교 홈페이지</label>
          <input id="homepage" name="homepage" type="url" value="${escapeHtml(school.homepage)}">

          <label for="schoolYear">학년도</label>
          <input id="schoolYear" name="schoolYear" type="number" min="0" value="${number(school.schoolYear)}">
          <span></span><span></span>

          <label for="grade1Students">1학년 학생수</label>
          <input id="grade1Students" name="grade1Students" type="number" min="0" value="${number(school.grade1Students)}">
          <label for="grade2Students">2학년 학생수</label>
          <input id="grade2Students" name="grade2Students" type="number" min="0" value="${number(school.grade2Students)}">

          <label for="grade3Students">3학년 학생수</label>
          <input id="grade3Students" name="grade3Students" type="number" min="0" value="${number(school.grade3Students)}">
          <label>전체 학생수</label>
          <input id="schoolTotalStudents" readonly value="${total}">
        </div>
        <div class="school-info-lookup">
          <button type="button" data-action="lookup-school-students">학교알리미 학생수 조회</button>
          <span id="schoolInfoStatus" class="help" role="status" aria-live="polite">학교를 선택하면 공시 학생수를 자동으로 불러옵니다. 조회값은 확인 후 수정할 수 있습니다.</span>
        </div>
        <input type="hidden" name="schoolCode" value="${escapeHtml(school.schoolCode)}">
        <input type="hidden" name="schoolRegionCode" value="${escapeHtml(school.schoolRegionCode)}">
        <input type="hidden" name="schoolKindCode" value="${escapeHtml(school.schoolKindCode)}">
      </fieldset>
      <div class="page-actions"><button type="submit">저장</button></div>
    </form>
  `;
}

export function readSchoolForm(form, previous, projects = []) {
  const data = new FormData(form);
  const projectBudgets = { ...(previous.projectBudgets ?? {}) };
  for (const project of projects) {
    const amountText = data.get(`budgetAmount:${project.id}`);
    const targetText = data.get(`budgetTarget:${project.id}`);
    projectBudgets[project.id] = {
      amount: amountText === null || amountText === '' ? null : Math.max(0, number(amountText)),
      fixed: data.get(`budgetFixed:${project.id}`) === 'on',
      targetBurden: targetText === null || targetText === '' ? null : Math.max(0, number(targetText))
    };
  }
  return {
    ...previous,
    name: String(data.get('name') ?? '').trim(),
    homepage: String(data.get('homepage') ?? '').trim(),
    educationOffice: String(data.get('educationOffice') ?? '').trim(),
    schoolCode: String(data.get('schoolCode') ?? '').trim(),
    schoolRegionCode: String(data.get('schoolRegionCode') ?? '').trim(),
    schoolKindCode: String(data.get('schoolKindCode') ?? '').trim(),
    schoolYear: Math.max(0, number(data.get('schoolYear'))),
    grade1Students: Math.max(0, number(data.get('grade1Students'))),
    grade2Students: Math.max(0, number(data.get('grade2Students'))),
    grade3Students: Math.max(0, number(data.get('grade3Students'))),
    annualSchoolBudget: Math.max(0, number(data.get('annualSchoolBudget'))),
    projectBudgets
  };
}

import { allocateFunding } from '../../engine.js';
import { number } from '../../utils.js';
import { renderAllocationTable, renderSummaryTable, vulnerableFullPerPerson } from './summaryViews.js';

export function renderBudgetSection(project, { includePlanResults = true } = {}) {
  const fullSupport = project.educationSupport.vulnerableMode === 'full';
  const automaticVulnerableAmount = Math.round(vulnerableFullPerPerson(project));
  const manualVulnerableAmount = Math.max(0, number(project.educationSupport.vulnerablePerPerson));
  const displayedVulnerableAmount = fullSupport ? automaticVulnerableAmount : manualVulnerableAmount;
  const studentBurden = Math.round(allocateFunding(project, true).regularPersonalBurden);

  const planResults = includePlanResults ? `
    <div class="section-output" data-project-output="budget-plan">
      <h2>계획 계산</h2>
      ${renderSummaryTable(project, false)}
      <h2>계획 재원 배분</h2>
      ${renderAllocationTable(project, false)}
    </div>` : '';

  return `
    <fieldset class="section-fieldset" data-project-section="budget">
      <legend>예산</legend>
      <button type="button" class="section-save" data-action="save-budget">저장</button>
      <p class="section-note">교육청 지원금, 학교 자체 지원금을 입력해 주세요. 수익자 부담금은 체험처와 비용 등을 입력한 후 자동 계산됩니다.</p>
      <div class="form-grid">
        <label for="regularPerPerson">교육청 지원금(비취약계층 1인당)</label>
        <input id="regularPerPerson" name="regularPerPerson" type="number" min="0" value="${number(project.educationSupport.regularPerPerson)}">

        <label for="vulnerablePerPerson">교육청 지원금(취약계층 1인당)</label>
        <div class="input-with-option">
          <input id="vulnerablePerPerson" name="vulnerablePerPerson" type="number" min="0"
            value="${displayedVulnerableAmount}"
            data-auto-value="${automaticVulnerableAmount}"
            data-manual-value="${manualVulnerableAmount}"
            ${fullSupport ? 'readonly' : ''}>
          <label class="check-label"><input type="checkbox" name="vulnerableFullSupport" ${fullSupport ? 'checked' : ''}> 실비 전액</label>
        </div>

        <label for="schoolSupportAmount">학교 자체 지원금</label>
        <input id="schoolSupportAmount" name="schoolSupportAmount" type="number" min="0" value="${number(project.schoolSupport.amount)}">

        <label for="studentBurden">수익자 부담금</label>
        <input id="studentBurden" type="number" value="${studentBurden}" readonly>
      </div>
    </fieldset>
    ${planResults}`;
}

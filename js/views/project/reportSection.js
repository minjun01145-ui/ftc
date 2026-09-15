import { escapeHtml } from '../../utils.js';
import { renderHeadcountReport, renderValidation } from './summaryViews.js';

export function renderReportSection(project, { showPrint = true } = {}) {
  return `
    <section data-project-section="report">
      <fieldset>
        <legend>인원 보고</legend>
        ${renderHeadcountReport(project)}
      </fieldset>

      <fieldset class="section-fieldset">
        <legend>메모</legend>
        <button type="button" class="section-save" data-action="save-report">저장</button>
        <textarea name="memo">${escapeHtml(project.memo)}</textarea>
      </fieldset>

      <h2>입력값 검증</h2>
      ${renderValidation(project)}
      ${showPrint ? '<div class="page-actions"><button type="button" data-action="print">인쇄</button></div>' : ''}
    </section>`;
}

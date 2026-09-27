import { renderAllocationTable, renderSummaryTable } from './summaryViews.js';

export function renderSettlementSection(project, { showPrint = true } = {}) {
  return `
    <section data-project-section="settlement">
      <h2>정산</h2>
      ${renderSummaryTable(project, true)}
      <h2>정산 재원 배분</h2>
      ${renderAllocationTable(project, true)}
      ${showPrint ? '<div class="page-actions"><button type="button" data-action="print">인쇄</button></div>' : ''}
    </section>`;
}

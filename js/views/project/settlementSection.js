import { renderAllocationTable, renderSummaryTable } from './summaryViews.js';

export function renderSettlementSection(project, { showPrint = true } = {}) {
  return `
    <section data-project-section="settlement">
      <h2>정산</h2>
      <p class="help">학생용 비용표의 ‘실제 지출액’을 입력하고 저장하면 정산 금액이 갱신됩니다. 비워두면 계획 금액을 사용합니다.</p>
      ${renderSummaryTable(project, true)}
      <h2>정산 재원 배분</h2>
      ${renderAllocationTable(project, true)}
      ${showPrint ? '<div class="page-actions"><button type="button" data-action="print">인쇄</button></div>' : ''}
    </section>`;
}

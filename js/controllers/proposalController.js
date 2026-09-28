import { addAllocations, normalizeProposalPlan, removeAllocation } from '../proposalPlan.js';
import { budgetChecklist, buildProposal, findAllocationResult } from '../proposalPlanner.js';

const won = value => `${Math.round(Number(value) || 0).toLocaleString('ko-KR')}원`;

/**
 * 품의 도우미의 체크 동작. 체크할 때마다 바로 저장하고, 예산을 넘었으면 얼마나 넣고 남겼는지 알려 준다.
 * 앱 상태와 화면 갱신은 app.js가 넘겨 주는 함수로만 다룬다.
 */
export function createProposalController({ getProject, saveProject, showMessage }) {
  function save(project, plan) {
    const next = { ...project, proposalPlan: plan };
    saveProject(next);
    return buildProposal(next);
  }

  function describeResult(proposal, budgetId, lineId) {
    const budget = proposal.budgets.find(item => item.id === budgetId);
    const result = findAllocationResult(proposal, budgetId, lineId);
    if (!budget || !result) return '';
    if (result.perPerson <= 0) return `${budget.name}의 한도가 가득 차서 ${result.name}을(를) 넣지 못했습니다.`;
    if (result.overBudget) {
      return `예산을 초과합니다. ${result.name} ${won(result.requested)} 중 ${won(result.perPerson)}만 ${budget.name}에 넣었습니다. 남은 ${won(result.left)}은 다른 예산에 넣을 수 있습니다.`;
    }
    return `${result.name} ${won(result.perPerson)}을 ${budget.name}에 넣었습니다.`;
  }

  function toggle(budgetId, lineId, checked) {
    const project = getProject();
    if (!project) return;
    const plan = normalizeProposalPlan(project.proposalPlan);
    if (!checked) {
      save(project, removeAllocation(plan, budgetId, lineId));
      showMessage('항목을 뺐습니다. 금액을 다시 계산했습니다.');
      return;
    }
    const proposal = save(project, addAllocations(plan, budgetId, [lineId]));
    showMessage(describeResult(proposal, budgetId, lineId));
  }

  function fillBudget(budgetId) {
    const project = getProject();
    if (!project) return;
    const lineIds = budgetChecklist(buildProposal(project), budgetId)
      .filter(item => !item.checked && item.available > 0)
      .map(item => item.line.id);
    if (!lineIds.length) return;
    const proposal = save(project, addAllocations(normalizeProposalPlan(project.proposalPlan), budgetId, lineIds));
    const overflowed = lineIds.map(lineId => findAllocationResult(proposal, budgetId, lineId)).filter(result => result?.overBudget);
    showMessage(overflowed.length
      ? `예산을 초과해 ${overflowed.map(result => result.name).join(', ')}은(는) 일부만 넣었습니다. 남은 금액은 다른 예산에 넣을 수 있습니다.`
      : `남은 항목 ${lineIds.length}개를 넣었습니다.`);
  }

  return Object.freeze({ toggle, fillBudget });
}

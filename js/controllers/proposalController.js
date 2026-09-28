import { addAllocations, normalizeProposalPlan, removeAllocation } from '../proposalPlan.js';
import { budgetChecklist, buildProposal, findAllocationResult, withBudgetAmount } from '../proposalPlanner.js';

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
      .filter(item => !item.checked && !item.locked)
      .map(item => item.line.id);
    if (!lineIds.length) return;

    // 위에서부터 하나씩 넣다가 예산이 가득 차면 멈춘다.
    let plan = normalizeProposalPlan(project.proposalPlan);
    const added = [];
    for (const lineId of lineIds) {
      plan = addAllocations(plan, budgetId, [lineId]);
      added.push(lineId);
      const block = buildProposal({ ...project, proposalPlan: plan }).blocks.find(item => item.budget.id === budgetId);
      if (block?.full) break;
    }
    const proposal = save(project, plan);
    const last = findAllocationResult(proposal, budgetId, added.at(-1));
    showMessage(last?.overBudget
      ? `항목 ${added.length}개를 넣고 예산이 가득 찼습니다. ${last.name}은(는) ${won(last.perPerson)}만 넣고 ${won(last.left)}은 다른 예산에 넣을 수 있게 남겼습니다.`
      : `항목 ${added.length}개를 넣었습니다.`);
  }

  function clearBudget(budgetId) {
    const project = getProject();
    if (!project) return;
    const plan = normalizeProposalPlan(project.proposalPlan);
    save(project, { allocations: plan.allocations.filter(item => item.budgetId !== budgetId) });
    showMessage('이 예산의 체크를 모두 해제했습니다.');
  }

  // 지원 금액을 바꾸면 체크는 그대로 두고 금액만 다시 채운다.
  function updateBudgetAmount(budgetId, amount) {
    const project = getProject();
    if (!project) return;
    const next = withBudgetAmount(project, budgetId, amount);
    saveProject(next);
    const block = buildProposal(next).blocks.find(item => item.budget.id === budgetId);
    showMessage(`${block?.budget.name ?? '예산'} 지원 금액을 바꿨습니다. 예산 관리에도 반영됩니다.`);
  }

  return Object.freeze({ toggle, fillBudget, clearBudget, updateBudgetAmount });
}

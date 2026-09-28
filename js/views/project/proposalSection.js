import {
  EDUCATION_BUDGET_ID,
  STUDENT_BUDGET_ID,
  VULNERABLE_BUDGET_ID,
  budgetChecklist,
  buildProposal
} from '../../proposalPlanner.js';
import { escapeHtml, number } from '../../utils.js';

const won = value => Math.round(number(value)).toLocaleString('ko-KR');

function shortDate(isoDate) {
  const match = String(isoDate).match(/^\d{4}-(\d{2})-(\d{2})$/);
  return match ? `${Number(match[1])}/${Number(match[2])}` : '';
}

function lineLabel(item) {
  const date = shortDate(item.date);
  return date ? `${date} ${item.name}` : item.name;
}

/* ---------- 사용 방법과 진행 상황 ---------- */

function guideBox() {
  return `
    <div class="proposal-howto">
      <strong>사용 방법</strong>
      <ol>
        <li>예산 관리에서 입력한 예산이 카드로 나옵니다. 카드에서 지원 금액을 바로 고칠 수 있고, 그 예산으로 낼 비용 항목을 체크하세요.</li>
        <li>체크한 순서대로 예산을 채웁니다. 예산을 넘으면 넣을 수 있는 만큼만 넣고, 나머지 금액은 다른 예산 카드에서 체크할 수 있게 남겨 둡니다.</li>
        <li>모든 금액을 배정하면 아래에 품의 방법과 예산별 품의 내용이 정리됩니다.</li>
      </ol>
    </div>`;
}

function progressBox(proposal) {
  const { regular, vulnerable } = proposal.unassigned;
  if (!proposal.lines.length) {
    return '<p class="proposal-progress warn">체험처/비용에서 단가를 입력한 항목이 없습니다.</p>';
  }
  if (!regular.length) {
    return '<p class="proposal-progress done">비취약계층 비용을 모두 배정했습니다.</p>';
  }
  const chips = regular.map(item => `<span class="chip">${escapeHtml(lineLabel(item))} ${won(item.perPerson)}원</span>`).join('');
  const vulnerableNote = vulnerable.length && proposal.counts.vulnerable > 0
    ? `<p class="help">취약계층에게 배정하지 않은 1인당 ${won(proposal.vulnerableBurden.perPerson)}원은 수익자 부담으로 처리됩니다.</p>`
    : '';
  return `
    <div class="proposal-progress warn">
      <p>아직 배정하지 않은 비취약계층 1인당 금액: <strong>${won(proposal.regularUnassignedPerPerson)}원</strong></p>
      <div class="chips">${chips}</div>
      ${vulnerableNote}
    </div>`;
}

/* ---------- 예산 카드 ---------- */

function settingEditor(budget) {
  const { setting } = budget;
  if (!setting) return '<p class="budget-setting">한도 없음 · 다른 예산에서 남은 금액을 넣습니다</p>';
  if (setting.mode === 'full') return '<p class="budget-setting">실비 전액 지원(한도 없음) <small>예산 관리에서 바꿀 수 있습니다</small></p>';
  const label = setting.mode === 'total' ? '총액' : '1인당';
  const perPerson = setting.mode === 'total' && Number.isFinite(budget.capPerPerson)
    ? ` <small>= 1인당 ${won(budget.capPerPerson)}원</small>` : '';
  return `
    <label class="budget-setting">${label}
      <input type="number" min="0" step="1" value="${number(setting.amount)}" data-proposal-budget-amount data-budget-id="${escapeHtml(budget.id)}" aria-label="${escapeHtml(budget.name)} ${label} 지원 금액">
      원 지원${perPerson}
    </label>`;
}

function meter(block) {
  if (!Number.isFinite(block.budget.capPerPerson)) {
    return `<p class="budget-card-usage">1인당 ${won(block.usedPerPerson)}원 배정</p>`;
  }
  const cap = block.budget.capPerPerson;
  const ratio = cap > 0 ? Math.min(100, Math.round((block.usedPerPerson / cap) * 100)) : 0;
  const status = block.full
    ? '<span class="ok-text">한도를 모두 채웠습니다</span>'
    : `남은 한도 ${won(block.unusedPerPerson)}원`;
  return `
    <div class="meter" role="img" aria-label="한도의 ${ratio}% 사용"><span style="width:${ratio}%"></span></div>
    <p class="budget-card-usage">1인당 ${won(block.usedPerPerson)}원 사용 · ${status}</p>`;
}

function checklistItem(budgetId, { line, checked, result, available, locked, lockReason }) {
  const id = `proposal-${budgetId}-${line.id}`.replace(/[^\w-]/g, '_');
  let amount;
  let note = '';
  if (checked && result.perPerson <= 0) {
    amount = '0원';
    note = '<span class="warn-text">예산이 가득 차서 넣지 못했습니다. 체크를 빼 주세요.</span>';
  } else if (checked) {
    amount = `${won(result.perPerson)}원`;
    if (result.overBudget) {
      note = `<span class="warn-text">예산 초과: ${won(result.requested)}원 중 ${won(result.perPerson)}원만 넣었습니다. 남은 ${won(result.left)}원은 다른 예산에서 체크하세요.</span>`;
    }
  } else if (lockReason === 'assigned') {
    amount = '다른 예산에 배정 완료';
  } else {
    amount = available < line.perPerson ? `남은 ${won(available)}원` : `${won(available)}원`;
  }
  return `
    <li class="${checked ? 'checked' : ''} ${locked ? 'disabled' : ''}">
      <label for="${id}">
        <input type="checkbox" id="${id}" data-proposal-toggle data-budget-id="${escapeHtml(budgetId)}" data-line-id="${escapeHtml(line.id)}"
          ${checked ? 'checked' : ''} ${locked ? 'disabled' : ''}>
        <span class="item-name">${escapeHtml(lineLabel(line))}</span>
        <span class="item-amount">${amount}</span>
      </label>
      ${note ? `<div class="item-note">${note}</div>` : ''}
    </li>`;
}

function budgetCard(proposal, block) {
  const { budget } = block;
  if (budget.id === VULNERABLE_BUDGET_ID && budget.count <= 0) return '';
  const items = budgetChecklist(proposal, budget.id);
  const canFill = items.some(item => !item.checked && !item.locked);
  const canClear = items.some(item => item.checked);
  const fullNote = block.full && items.some(item => item.lockReason === 'full')
    ? '<p class="budget-full-note">예산이 가득 찼습니다. 다른 항목을 넣으려면 체크를 빼거나 지원 금액을 늘리세요.</p>'
    : '';
  const dayAbsentNote = budget.id === EDUCATION_BUDGET_ID && proposal.dayAbsentTotal > 0
    ? `<p class="help">당일 불참 ${proposal.counts.dayAbsent}명의 ${proposal.dayAbsent.map(item => item.name).join('·')} ${won(proposal.dayAbsentTotal)}원도 이 예산에서 자동으로 품의합니다.</p>`
    : '';
  return `
    <section class="budget-card ${budget.group} ${block.full ? 'is-full' : ''}">
      <header>
        <h3>${escapeHtml(budget.name)}</h3>
        ${budget.memo ? `<p class="budget-memo-text">${escapeHtml(budget.memo)}</p>` : ''}
        <p>${budget.count}명</p>
        ${settingEditor(budget)}
      </header>
      ${meter(block)}
      ${fullNote}
      <ul class="budget-checklist">${items.map(item => checklistItem(budget.id, item)).join('')}</ul>
      ${dayAbsentNote}
      <footer>
        <div class="card-actions">
          <button type="button" class="small-button" data-action="proposal-fill-budget" data-budget-id="${escapeHtml(budget.id)}" ${canFill ? '' : 'disabled'}>남은 항목 모두 넣기</button>
          <button type="button" class="small-button" data-action="proposal-clear-budget" data-budget-id="${escapeHtml(budget.id)}" ${canClear ? '' : 'disabled'}>모두 해제</button>
        </div>
        <span>${budget.count}명 × ${won(block.usedPerPerson)}원 = <strong>${won(block.total)}원</strong></span>
      </footer>
    </section>`;
}

/* ---------- 예산별 품의 내용(엑셀 3번 표) ---------- */

function row(label, count, perPerson, total, { item = false } = {}) {
  return `<tr><td class="${item ? 'proposal-item' : ''}">${label}</td><td class="number">${number(count)}</td><td class="number">${won(perPerson)}</td><td class="number">${won(total)}</td></tr>`;
}

function partRows(block) {
  return block.parts
    .filter(part => part.perPerson > 0)
    .map(part => row(`${escapeHtml(lineLabel(part))}${part.remainder ? ' <small>(나머지)</small>' : ''}`, block.budget.count, part.perPerson, part.total, { item: true }));
}

function tableGroups(proposal) {
  const block = id => proposal.blocks.find(item => item.budget.id === id);
  const vulnerable = block(VULNERABLE_BUDGET_ID);
  const education = block(EDUCATION_BUDGET_ID);
  const groups = [];

  const educationRows = [];
  if (vulnerable.total > 0) {
    const fullyCovered = !proposal.unassigned.vulnerable.length && !Number.isFinite(vulnerable.budget.capPerPerson);
    educationRows.push(row(fullyCovered ? '취약계층 학생에게 현장체험학습비 전액 지원' : `취약계층 학생에게 ${won(vulnerable.usedPerPerson)}원 지원`,
      vulnerable.budget.count, vulnerable.usedPerPerson, vulnerable.total));
    if (!fullyCovered) educationRows.push(...partRows(vulnerable));
  }
  if (education.total > 0) {
    educationRows.push(row(`비취약계층 학생에게 ${won(education.usedPerPerson)}원 지원`, education.budget.count, education.usedPerPerson, education.total));
    educationRows.push(...partRows(education));
  }
  for (const item of proposal.dayAbsent) {
    educationRows.push(row(`당일 불참 ${escapeHtml(item.name)}`, item.count, item.perPerson, item.total, { item: true }));
  }
  groups.push({ name: '교육청 지원금', rows: educationRows, total: proposal.education.total });

  for (const other of proposal.blocks.filter(item => ![VULNERABLE_BUDGET_ID, EDUCATION_BUDGET_ID, STUDENT_BUDGET_ID].includes(item.budget.id))) {
    groups.push({
      name: other.budget.name,
      rows: other.total > 0 ? [row(`비취약계층 학생에게 ${won(other.usedPerPerson)}원 지원`, other.budget.count, other.usedPerPerson, other.total), ...partRows(other)] : [],
      total: other.total
    });
  }

  const student = block(STUDENT_BUDGET_ID);
  const studentRows = student.total > 0
    ? [row('비취약계층 학생의 실부담액', student.budget.count, student.usedPerPerson, student.total), ...partRows(student)]
    : [];
  if (proposal.vulnerableBurden.total > 0) {
    const { vulnerableBurden } = proposal;
    studentRows.push(row('취약계층 학생의 실부담액', vulnerableBurden.count, vulnerableBurden.perPerson, vulnerableBurden.total));
  }
  groups.push({ name: '수익자 부담', rows: studentRows, total: student.total + proposal.vulnerableBurden.total });
  return groups.filter(group => group.rows.length);
}

function proposalTable(proposal) {
  const bodies = tableGroups(proposal).map(group => {
    const [first, ...rest] = group.rows;
    const heading = `<th scope="rowgroup" rowspan="${group.rows.length + 1}">${escapeHtml(group.name)}</th>`;
    return `
      <tbody class="proposal-block">
        ${first.replace('<tr>', `<tr>${heading}`)}
        ${rest.join('')}
        <tr class="subtotal"><td>${escapeHtml(group.name)} 합계</td><td></td><td></td><td class="number">${won(group.total)}</td></tr>
      </tbody>`;
  }).join('');
  const unassigned = proposal.unassignedTotal > 0
    ? `<tr class="unassigned"><th colspan="4">아직 배정하지 않은 금액</th><td class="number">${won(proposal.unassignedTotal)}</td></tr>`
    : '';

  return `
    <div class="table-wrap">
      <table class="compact-table proposal-table">
        <thead><tr><th>예산</th><th>내용</th><th>해당학생 수</th><th>금액</th><th>총액</th></tr></thead>
        ${bodies}
        <tfoot>
          ${unassigned}
          <tr class="total"><th colspan="4">총액</th><td class="number">${won(proposal.assignedTotal)}</td></tr>
        </tfoot>
      </table>
    </div>`;
}

/* ---------- 품의 안내 ---------- */

export function proposalGuide(proposal) {
  const steps = tableGroups(proposal).map(group => `${group.name}: 총 ${won(group.total)}원`);
  const notes = [];
  for (const split of proposal.splits) {
    const pieces = split.pieces.map(piece => `${piece.budgetName} ${won(piece.perPerson)}원`).join(' + ');
    notes.push(`${split.name}은(는) ${pieces}으로 나누어 품의합니다.`);
  }
  for (const block of proposal.blocks) {
    if (block.budget.count > 0 && block.unusedPerPerson > 0 && block.usedPerPerson > 0) {
      notes.push(`${block.budget.name} 1인당 ${won(block.unusedPerPerson)}원이 남습니다.`);
    }
  }
  const { balance } = proposal.education;
  if (balance !== null && balance < 0) notes.push(`교육청 지원금이 교부액보다 ${won(-balance)}원 많습니다.`);
  if (balance !== null && balance > 0) notes.push(`교육청 지원금 교부액 중 ${won(balance)}원이 남습니다(반납 대상).`);
  if (proposal.unassignedTotal > 0) notes.push(`아직 배정하지 않은 금액이 ${won(proposal.unassignedTotal)}원 있습니다.`);
  return { steps, notes };
}

function guideHtml(proposal) {
  const { steps, notes } = proposalGuide(proposal);
  if (!steps.length) return '<p class="help">예산 카드에 항목을 체크하면 품의 방법을 정리해 드립니다.</p>';
  return `
    <p>아래 예산별로 품의를 올리면 됩니다. 각 예산에 들어갈 항목과 금액은 표에 정리되어 있습니다.</p>
    <ol class="proposal-steps">${steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
    ${notes.length ? `<ul class="proposal-notes">${notes.map(note => `<li>${escapeHtml(note)}</li>`).join('')}</ul>` : ''}`;
}

export function renderProposalSection(project) {
  const proposal = buildProposal(project);
  return `
    <section class="proposal-helper" data-project-section="proposal">
      ${guideBox()}
      ${progressBox(proposal)}
      <div class="budget-cards">${proposal.blocks.map(block => budgetCard(proposal, block)).join('')}</div>
      <fieldset class="section-fieldset">
        <legend>품의 방법</legend>
        ${guideHtml(proposal)}
      </fieldset>
      <fieldset class="section-fieldset">
        <legend>예산별 품의 내용</legend>
        ${proposalTable(proposal)}
      </fieldset>
      <div class="page-actions no-print"><button type="button" data-action="print">인쇄</button></div>
    </section>`;
}

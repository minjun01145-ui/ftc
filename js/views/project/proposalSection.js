import { EDUCATION_BUDGET_ID, STUDENT_BUDGET_ID, buildProposal } from '../../proposalPlanner.js';
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

/* ---------- 1. 항목 배정 ---------- */

function budgetOptions(budgets, selectedId) {
  return budgets.map(budget => {
    const suffix = budget.restricted ? ' (지정 전용)' : '';
    return `<option value="${escapeHtml(budget.id)}" ${budget.id === selectedId ? 'selected' : ''}>${escapeHtml(budget.name + suffix)}</option>`;
  }).join('');
}

function assignmentTable(proposal) {
  if (!proposal.lines.length) {
    return '<p class="help">체험처/비용에서 단가를 입력한 항목이 없습니다.</p>';
  }
  const rows = proposal.lines.map(line => `
    <tr data-proposal-row data-line-id="${escapeHtml(line.id)}">
      <td class="center">
        <button type="button" class="small-button" data-action="move-proposal-up">↑</button>
        <button type="button" class="small-button" data-action="move-proposal-down">↓</button>
      </td>
      <td>${escapeHtml(lineLabel(line))}</td>
      <td class="number">${won(line.perPerson)}</td>
      <td><select data-proposal-assign aria-label="${escapeHtml(line.name)} 배정 예산">${budgetOptions(proposal.budgets, proposal.assignments[line.id])}</select></td>
    </tr>`).join('');
  return `
    <div class="table-wrap">
      <table class="compact-table proposal-assign-table">
        <thead><tr><th>순서</th><th>항목</th><th>1인당 금액</th><th>배정 예산</th></tr></thead>
        <tbody data-proposal-list>${rows}</tbody>
        <tfoot><tr class="total"><th colspan="2">학생 1인 합계</th><td class="number">${won(proposal.perPersonTotal)}</td><td></td></tr></tfoot>
      </table>
    </div>`;
}

function budgetStatus(proposal) {
  const cards = proposal.blocks
    .filter(block => block.budget.id !== STUDENT_BUDGET_ID)
    .map(block => {
      const unused = block.unusedPerPerson;
      const state = unused > 0 ? `<span class="warn-text">1인당 ${won(unused)}원 남음</span>` : '<span class="ok-text">한도 채움</span>';
      return `<li><strong>${escapeHtml(block.budget.name)}</strong> 1인당 ${won(block.budget.capPerPerson)}원 중 ${won(block.usedPerPerson)}원 사용 · ${state}</li>`;
    }).join('');
  return cards ? `<ul class="budget-status">${cards}</ul>` : '';
}

/* ---------- 2. 예산별 품의 내용(엑셀 3번 표) ---------- */

function row(cells) {
  return `<tr>${cells}</tr>`;
}

function amountCells(count, perPerson, total) {
  return `<td class="number">${number(count)}</td><td class="number">${won(perPerson)}</td><td class="number">${won(total)}</td>`;
}

function partRows(parts, count) {
  return parts.map(part => row(`<td class="proposal-item">${escapeHtml(lineLabel(part))}${part.carried ? ' <small>(나머지)</small>' : ''}</td>${amountCells(count, part.perPerson, part.total)}`));
}

function educationBlockRows(proposal, block) {
  const rows = [];
  const { vulnerable, dayAbsent, counts } = proposal;
  if (vulnerable.count > 0) {
    const text = vulnerable.burdenPerPerson > 0
      ? `취약계층 학생에게 1인당 ${won(vulnerable.perPerson)}원 지원`
      : '취약계층 학생에게 현장체험학습비 전액 지원';
    rows.push(row(`<td>${text}</td>${amountCells(vulnerable.count, vulnerable.perPerson, vulnerable.total)}`));
  }
  if (counts.regular > 0) {
    rows.push(row(`<td>비취약계층 학생에게 ${won(block.usedPerPerson)}원 지원</td>${amountCells(counts.regular, block.usedPerPerson, block.total)}`));
    rows.push(...partRows(block.parts, counts.regular));
  }
  for (const item of dayAbsent) {
    rows.push(row(`<td class="proposal-item">당일 불참 ${escapeHtml(item.name)}</td>${amountCells(item.count, item.perPerson, item.total)}`));
  }
  return rows;
}

function blockRows(proposal, block) {
  if (block.budget.id === EDUCATION_BUDGET_ID) return educationBlockRows(proposal, block);
  const rows = [];
  if (block.total > 0) {
    const text = block.budget.id === STUDENT_BUDGET_ID ? '비취약계층 학생의 실부담액' : `비취약계층 학생에게 ${won(block.usedPerPerson)}원 지원`;
    rows.push(row(`<td>${text}</td>${amountCells(block.count, block.usedPerPerson, block.total)}`));
    rows.push(...partRows(block.parts, block.count));
  }
  if (block.budget.id === STUDENT_BUDGET_ID && proposal.vulnerable.burdenTotal > 0) {
    const { vulnerable } = proposal;
    rows.push(row(`<td>취약계층 학생의 실부담액</td>${amountCells(vulnerable.count, vulnerable.burdenPerPerson, vulnerable.burdenTotal)}`));
  }
  return rows;
}

function blockTotal(proposal, block) {
  if (block.budget.id === EDUCATION_BUDGET_ID) return proposal.education.total;
  if (block.budget.id === STUDENT_BUDGET_ID) return block.total + proposal.vulnerable.burdenTotal;
  return block.total;
}

function proposalTable(proposal) {
  const bodies = proposal.blocks.map(block => {
    const rows = blockRows(proposal, block);
    if (!rows.length) return '';
    const [first, ...rest] = rows;
    const heading = `<th scope="rowgroup" rowspan="${rows.length + 1}">${escapeHtml(block.budget.name)}</th>`;
    return `
      <tbody class="proposal-block">
        ${first.replace('<tr>', `<tr>${heading}`)}
        ${rest.join('')}
        <tr class="subtotal"><td>${escapeHtml(block.budget.name)} 합계</td><td></td><td></td><td class="number">${won(blockTotal(proposal, block))}</td></tr>
      </tbody>`;
  }).join('');

  return `
    <div class="table-wrap">
      <table class="compact-table proposal-table">
        <thead><tr><th>예산</th><th>내용</th><th>해당학생 수</th><th>금액</th><th>총액</th></tr></thead>
        ${bodies}
        <tfoot><tr class="total"><th colspan="4">총액</th><td class="number">${won(proposal.proposalTotal)}</td></tr></tfoot>
      </table>
    </div>`;
}

/* ---------- 3. 품의 안내 ---------- */

function partsText(parts) {
  return parts.map(part => `${part.name} ${won(part.perPerson)}원`).join(', ');
}

export function proposalGuide(proposal) {
  const steps = [];
  const notes = [];
  const { vulnerable, counts } = proposal;

  for (const block of proposal.blocks) {
    const total = blockTotal(proposal, block);
    if (total <= 0) continue;
    const pieces = [];
    if (block.budget.id === EDUCATION_BUDGET_ID && vulnerable.total > 0) {
      pieces.push(`취약계층 ${vulnerable.count}명 × ${won(vulnerable.perPerson)}원`);
    }
    if (block.total > 0) {
      pieces.push(`비취약계층 ${counts.regular}명 × ${won(block.usedPerPerson)}원(${partsText(block.parts)})`);
    }
    if (block.budget.id === EDUCATION_BUDGET_ID && proposal.dayAbsentTotal > 0) {
      pieces.push(`당일 불참 ${counts.dayAbsent}명의 ${proposal.dayAbsent.map(item => item.name).join('·')} ${won(proposal.dayAbsentTotal)}원`);
    }
    if (block.budget.id === STUDENT_BUDGET_ID && vulnerable.burdenTotal > 0) {
      pieces.push(`취약계층 ${vulnerable.count}명 × ${won(vulnerable.burdenPerPerson)}원`);
    }
    steps.push(`${block.budget.name}: 총 ${won(total)}원 — ${pieces.join(' / ')}`);
  }

  for (const split of proposal.splits) {
    const pieces = split.pieces.map(piece => `${piece.budgetName} ${won(piece.perPerson)}원`).join(' + ');
    notes.push(`${split.name}은(는) ${pieces}으로 나누어 품의합니다.`);
  }
  for (const block of proposal.blocks) {
    if (block.unusedPerPerson > 0) {
      notes.push(`${block.budget.name} 1인당 ${won(block.unusedPerPerson)}원이 남습니다. 항목을 더 배정하거나 지원금을 조정하세요.`);
    }
  }
  const { balance } = proposal.education;
  if (balance !== null && balance < 0) notes.push(`교육청 지원금이 교부액보다 ${won(-balance)}원 많습니다.`);
  if (balance !== null && balance > 0) notes.push(`교육청 지원금 교부액 중 ${won(balance)}원이 남습니다(반납 대상).`);
  if (proposal.proposalTotal !== proposal.costTotal) {
    notes.push(`품의 총액(${won(proposal.proposalTotal)}원)과 학생 경비 합계(${won(proposal.costTotal)}원)가 다릅니다.`);
  }
  return { steps, notes };
}

function guideHtml(proposal) {
  const { steps, notes } = proposalGuide(proposal);
  if (!steps.length) return '<p class="help">예산과 비용을 입력하면 품의 방법을 안내합니다.</p>';
  return `
    <ol class="proposal-steps">${steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
    ${notes.length ? `<ul class="proposal-notes">${notes.map(note => `<li>${escapeHtml(note)}</li>`).join('')}</ul>` : ''}`;
}

export function renderProposalSection(project) {
  const proposal = buildProposal(project);
  return `
    <section class="proposal-helper" data-project-section="proposal">
      <fieldset class="section-fieldset">
        <legend>항목 배정</legend>
        <p class="help">항목마다 예산을 고르면 바로 계산됩니다. 예산은 교육청 → 기타 지원금(예산 관리 순서) → 수익자 부담 순으로 채우고, 1인당 한도를 넘는 금액은 다음 예산으로 넘깁니다. 같은 예산 안에서는 위에 있는 항목부터 채웁니다.</p>
        ${budgetStatus(proposal)}
        ${assignmentTable(proposal)}
      </fieldset>
      <fieldset class="section-fieldset">
        <legend>품의 안내</legend>
        ${guideHtml(proposal)}
      </fieldset>
      <fieldset class="section-fieldset">
        <legend>예산별 품의 내용</legend>
        ${proposalTable(proposal)}
      </fieldset>
      <div class="page-actions no-print"><button type="button" data-action="print">인쇄</button></div>
    </section>`;
}

/** 배정 표의 현재 순서와 선택값. 표가 없으면 null. */
export function readProposalInputs(form) {
  const list = form.querySelector('[data-proposal-list]');
  if (!list) return null;
  const rows = [...list.querySelectorAll('[data-proposal-row]')];
  return {
    order: rows.map(row => row.dataset.lineId),
    assignments: Object.fromEntries(rows.map(row => [row.dataset.lineId, row.querySelector('[data-proposal-assign]').value]))
  };
}

export function moveProposalRow(button, direction) {
  const row = button.closest('[data-proposal-row]');
  const target = direction === 'up' ? row?.previousElementSibling : row?.nextElementSibling;
  if (!row || !target?.matches('[data-proposal-row]')) return false;
  if (direction === 'up') target.before(row);
  else target.after(row);
  return true;
}

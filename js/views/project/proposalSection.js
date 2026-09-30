import {
  EDUCATION_BUDGET_ID,
  STUDENT_BUDGET_ID,
  VULNERABLE_BUDGET_ID,
  absentChecklist,
  budgetChecklist,
  buildProposal
} from '../../proposalPlanner.js';
import { portalBudgets } from '../../forms/portalItems.js';
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

function absentGroupText(line) {
  return `${line.group === 'vulnerable' ? '취약계층 ' : ''}신청 후 불참 ${line.count}명`;
}

// 예) 버스비(신청 후 불참 1명, 113,920원)
function absentLabel(line) {
  return `${lineLabel(line)}(${absentGroupText(line)}, ${won(line.perPerson)}원)`;
}

function absentCount(proposal, group) {
  return group === 'vulnerable' ? proposal.counts.vulnerableAbsent : proposal.counts.regularAbsent;
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
  const { regular, vulnerable, absent } = proposal.unassigned;
  if (!proposal.lines.length) {
    return '<p class="proposal-progress warn">체험처/비용에서 단가를 입력한 항목이 없습니다.</p>';
  }
  if (!regular.length && !absent.length) {
    return '<p class="proposal-progress done">비취약계층 비용을 모두 배정했습니다.</p>';
  }
  const chips = regular.map(item => `<span class="chip">${escapeHtml(lineLabel(item))} ${won(item.perPerson)}원</span>`).join('');
  const regularNote = regular.length
    ? `<p>아직 배정하지 않은 비취약계층 1인당 금액: <strong>${won(proposal.regularUnassignedPerPerson)}원</strong></p><div class="chips">${chips}</div>`
    : '';
  const absentChips = absent.map(item => `<span class="chip">${escapeHtml(absentLabel(item))}</span>`).join('');
  const absentNote = absent.length
    ? `<p>아직 배정하지 않은 신청 후 불참 공통비: <strong>${won(absent.reduce((sum, item) => sum + item.total, 0))}원</strong></p><div class="chips">${absentChips}</div>`
    : '';
  const vulnerableNote = vulnerable.length && proposal.counts.vulnerable > 0
    ? `<p>취약계층 미배정 1인당 ${won(proposal.vulnerableBurden.perPerson)}원 → 수익자 부담</p>`
    : '';
  return `
    <div class="proposal-progress warn">
      ${regularNote}
      ${absentNote}
      ${vulnerableNote}
    </div>`;
}

/* ---------- 예산 카드 ---------- */

function settingEditor(budget) {
  const { setting } = budget;
  if (!setting) return '<p class="budget-setting">한도 없음</p>';
  if (setting.mode === 'full') return '<p class="budget-setting">실비 전액 지원</p>';
  const label = setting.mode === 'total' ? '총액' : '1인당';
  const perPerson = setting.mode === 'total' && Number.isFinite(budget.capPerPerson)
    ? ` <small>= 1인당 ${won(budget.capPerPerson)}원</small>` : '';
  return `
    <label class="budget-setting">${label}
      <input type="number" min="0" step="1" value="${number(setting.amount)}" data-proposal-budget-amount data-budget-id="${escapeHtml(budget.id)}" aria-label="${escapeHtml(budget.name)} ${label} 지원 금액">
      원 지원${perPerson}
    </label>`;
}

/** 예) 예산 1인당 100,000원 × 10명(참여 9 + 신청 후 불참 1) = 1,000,000원 */
function budgetTotalLine(block) {
  if (block.budgetTotal === null || block.absentCount <= 0) return '';
  if (block.budget.poolTotal !== null && block.budget.poolTotal !== undefined) {
    return `<p class="budget-card-usage">예산 총액 <strong>${won(block.budgetTotal)}원</strong> · 참여 학생에게 쓰고 남은 금액을 신청 후 불참 공통비에 쓸 수 있습니다.</p>`;
  }
  const people = block.budget.count + block.absentCount;
  return `<p class="budget-card-usage">예산 1인당 ${won(block.budget.capPerPerson)}원 × ${people}명(참여 ${block.budget.count} + 신청 후 불참 ${block.absentCount}) = <strong>${won(block.budgetTotal)}원</strong></p>`;
}

function absentMeter(block) {
  if (block.absentUnusedPerPerson === null) return '';
  const status = block.absentFull
    ? '<span class="ok-text">모두 사용</span>'
    : `남은 ${won(block.absentUnusedPerPerson)}원`;
  return `<p class="budget-card-usage">신청 후 불참 1인당 ${won(block.absentUsedPerPerson)}원 사용 · ${status}</p>`;
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
    note = '<span class="warn-text">예산이 가득 차서 넣지 못함</span>';
  } else if (checked) {
    amount = `${won(result.perPerson)}원`;
    if (result.overBudget) {
      note = `<span class="warn-text">예산 초과: ${won(result.requested)}원 중 ${won(result.perPerson)}원만 넣음, ${won(result.left)}원 남음</span>`;
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

function absentChecklistItem(budgetId, { line, checked, result, available, locked, lockReason }) {
  const id = `proposal-${budgetId}-${line.id}`.replace(/[^\w-]/g, '_');
  let amount;
  let note = '';
  if (checked && result.perPerson <= 0) {
    amount = '0원';
    note = '<span class="warn-text">불참 학생 지원금이 가득 차서 넣지 못함</span>';
  } else if (checked) {
    amount = `${won(result.total)}원`;
    if (result.overBudget) {
      note = `<span class="warn-text">지원금 초과: 1인 ${won(result.requested)}원 중 ${won(result.perPerson)}원만 넣음, ${won(result.left)}원 남음</span>`;
    }
  } else if (lockReason === 'assigned') {
    amount = '다른 예산에 배정 완료';
  } else {
    amount = available < line.perPerson ? `남은 ${won(available * line.count)}원` : `${won(available * line.count)}원`;
  }
  return `
    <li class="${checked ? 'checked' : ''} ${locked ? 'disabled' : ''}">
      <label for="${id}">
        <input type="checkbox" id="${id}" data-proposal-toggle data-budget-id="${escapeHtml(budgetId)}" data-line-id="${escapeHtml(line.id)}"
          ${checked ? 'checked' : ''} ${locked ? 'disabled' : ''}>
        <span class="item-name">${escapeHtml(absentLabel(line))}</span>
        <span class="item-amount">${amount}</span>
      </label>
      ${note ? `<div class="item-note">${note}</div>` : ''}
    </li>`;
}

// 예) 53명(신청 후 불참 1명, 공통비 부담)
function countText(proposal, budget) {
  const absent = absentCount(proposal, budget.group);
  return absent > 0 ? `${budget.count}명(신청 후 불참 ${absent}명, 공통비 부담)` : `${budget.count}명`;
}

/** 카드 아래 계산식: 참여 인원 × 1인당 금액, 신청 후 불참 인원 × 공통비 */
function formulaLines(block) {
  const lines = [`${block.budget.count}명 × ${won(block.usedPerPerson)}원 = ${won(block.participantTotal)}원`];
  for (const group of ['vulnerable', 'regular']) {
    const parts = block.absentParts.filter(part => part.group === group);
    if (!parts.length) continue;
    const perPerson = parts.reduce((sum, part) => sum + part.perPerson, 0);
    const total = parts.reduce((sum, part) => sum + part.total, 0);
    lines.push(`${absentGroupText(parts[0])} × ${won(perPerson)}원 = ${won(total)}원`);
  }
  if (block.absentParts.length) lines.push(`합계 <strong>${won(block.total)}원</strong>`);
  else lines[0] = `${block.budget.count}명 × ${won(block.usedPerPerson)}원 = <strong>${won(block.total)}원</strong>`;
  return lines.map(line => `<span>${line}</span>`).join('');
}

function budgetCard(proposal, block) {
  const { budget } = block;
  if (budget.id === VULNERABLE_BUDGET_ID && budget.count <= 0 && !proposal.counts.vulnerableAbsent) return '';
  const items = budgetChecklist(proposal, budget.id);
  const absentItems = absentChecklist(proposal, budget.id);
  const canFill = [...items, ...absentItems].some(item => !item.checked && !item.locked);
  const canClear = [...items, ...absentItems].some(item => item.checked);
  const fullNote = block.full && items.some(item => item.lockReason === 'full')
    ? '<p class="budget-full-note">예산이 가득 찼습니다.</p>'
    : '';
  const absentList = absentItems.length
    ? `<h4 class="budget-checklist-head">신청 후 불참 공통비</h4>
      <ul class="budget-checklist absent-checklist">${absentItems.map(item => absentChecklistItem(budget.id, item)).join('')}</ul>`
    : '';
  return `
    <section class="budget-card ${budget.group} ${block.full ? 'is-full' : ''}">
      <header>
        <h3>${escapeHtml(budget.name)}</h3>
        ${budget.memo ? `<p class="budget-memo-text">${escapeHtml(budget.memo)}</p>` : ''}
        <p>${countText(proposal, budget)}</p>
        ${settingEditor(budget)}
      </header>
      ${budgetTotalLine(block)}
      ${meter(block)}
      ${absentMeter(block)}
      ${fullNote}
      <ul class="budget-checklist">${items.map(item => checklistItem(budget.id, item)).join('')}</ul>
      ${absentList}
      <footer>
        <div class="card-actions">
          <button type="button" class="small-button" data-action="proposal-fill-budget" data-budget-id="${escapeHtml(budget.id)}" ${canFill ? '' : 'disabled'}>남은 항목 모두 넣기</button>
          <button type="button" class="small-button" data-action="proposal-clear-budget" data-budget-id="${escapeHtml(budget.id)}" ${canClear ? '' : 'disabled'}>모두 해제</button>
        </div>
        <div class="budget-formula">${formulaLines(block)}</div>
      </footer>
    </section>`;
}

/* ---------- 예산별 품의 내용(엑셀 3번 표) ---------- */

const SPLIT_COLORS = 6;

const partKey = (block, part) => (part.absent ? part.lineId : `${block.budget.group}:${part.lineId}`);

/** 여러 예산으로 나눈 항목마다 색 번호를 붙인다(같은 항목의 조각은 같은 색). */
function splitColors(proposal) {
  const seen = new Map();
  for (const block of proposal.blocks) {
    for (const part of [...block.parts, ...block.absentParts]) {
      if (part.perPerson <= 0) continue;
      const key = partKey(block, part);
      seen.set(key, (seen.get(key) ?? 0) + 1);
    }
  }
  const colors = new Map();
  for (const [key, pieces] of seen) {
    if (pieces > 1) colors.set(key, colors.size % SPLIT_COLORS);
  }
  return colors;
}

function row(label, count, perPerson, total, { item = false, head = false, split = null } = {}) {
  const classes = [head ? 'proposal-head' : '', split === null ? '' : `split-row split-${split}`].filter(Boolean).join(' ');
  return `<tr class="${classes}"><td class="${item ? 'proposal-item' : ''}">${label}</td><td class="number">${number(count)}</td><td class="number">${won(perPerson)}</td><td class="number">${won(total)}</td></tr>`;
}

function pieceNote(part, split) {
  if (split === null) return '';
  return part.remainder ? ' <small class="split-tag">(나머지)</small>' : ' <small class="split-tag">(일부)</small>';
}

function partRows(block, colors) {
  return block.parts
    .filter(part => part.perPerson > 0)
    .map(part => {
      const split = colors.get(partKey(block, part)) ?? null;
      return row(`${escapeHtml(lineLabel(part))}${pieceNote(part, split)}`, block.budget.count, part.perPerson, part.total, { item: true, split });
    });
}

function absentItemRows(block, parts, colors) {
  return parts.map(part => {
    const split = colors.get(partKey(block, part)) ?? null;
    return row(`${escapeHtml(lineLabel(part))}${pieceNote(part, split)}`, part.count, part.perPerson, part.total, { item: true, split });
  });
}

/** 신청 후 불참 학생 몫: 머리 줄(몇 명에게 1인당 얼마) + 항목 줄 */
function absentRows(block, colors, headText) {
  return ['vulnerable', 'regular'].flatMap(group => {
    const parts = block.absentParts.filter(part => part.group === group);
    if (!parts.length) return [];
    const count = parts[0].count;
    const perPerson = parts.reduce((sum, part) => sum + part.perPerson, 0);
    const total = parts.reduce((sum, part) => sum + part.total, 0);
    const groupText = group === 'vulnerable' ? '취약계층' : '비취약계층';
    return [row(headText(groupText, perPerson), count, perPerson, total, { head: true }), ...absentItemRows(block, parts, colors)];
  });
}

function tableGroups(proposal) {
  const colors = splitColors(proposal);
  const block = id => proposal.blocks.find(item => item.budget.id === id);
  const vulnerable = block(VULNERABLE_BUDGET_ID);
  const education = block(EDUCATION_BUDGET_ID);
  const supportText = (groupText, perPerson) => `신청 후 불참 ${groupText} 학생에게 ${won(perPerson)}원 지원(공통비)`;
  const groups = [];

  const educationRows = [];
  if (vulnerable.participantTotal > 0) {
    const fullyCovered = !proposal.unassigned.vulnerable.length && !Number.isFinite(vulnerable.budget.capPerPerson);
    educationRows.push(row(fullyCovered ? '취약계층 학생에게 현장체험학습비 전액 지원' : `취약계층 학생에게 ${won(vulnerable.usedPerPerson)}원 지원`,
      vulnerable.budget.count, vulnerable.usedPerPerson, vulnerable.participantTotal, { head: true }));
    if (!fullyCovered) educationRows.push(...partRows(vulnerable, colors));
  }
  educationRows.push(...absentRows(vulnerable, colors, supportText));
  if (education.participantTotal > 0) {
    educationRows.push(row(`비취약계층 학생에게 ${won(education.usedPerPerson)}원 지원`, education.budget.count, education.usedPerPerson, education.participantTotal, { head: true }));
    educationRows.push(...partRows(education, colors));
  }
  educationRows.push(...absentRows(education, colors, supportText));
  groups.push({ name: '교육청 지원금', tone: 'education', rows: educationRows, total: proposal.education.total });

  for (const other of proposal.blocks.filter(item => ![VULNERABLE_BUDGET_ID, EDUCATION_BUDGET_ID, STUDENT_BUDGET_ID].includes(item.budget.id))) {
    groups.push({
      name: other.budget.name,
      tone: 'other',
      rows: other.participantTotal > 0
        ? [row(`비취약계층 학생에게 ${won(other.usedPerPerson)}원 지원`, other.budget.count, other.usedPerPerson, other.participantTotal, { head: true }), ...partRows(other, colors)]
        : [],
      total: other.total
    });
  }

  const student = block(STUDENT_BUDGET_ID);
  const studentRows = student.participantTotal > 0
    ? [row('비취약계층 학생의 실부담액', student.budget.count, student.usedPerPerson, student.participantTotal, { head: true }), ...partRows(student, colors)]
    : [];
  if (proposal.vulnerableBurden.total > 0) {
    const { vulnerableBurden } = proposal;
    studentRows.push(row('취약계층 학생의 실부담액', vulnerableBurden.count, vulnerableBurden.perPerson, vulnerableBurden.total, { head: true }));
  }
  studentRows.push(...absentRows(student, colors, groupText => `신청 후 불참 ${groupText} 학생의 실부담액(공통비)`));
  groups.push({ name: '수익자 부담', tone: 'student', rows: studentRows, total: student.total + proposal.vulnerableBurden.total });
  return { groups: groups.filter(group => group.rows.length), hasSplits: colors.size > 0 };
}

function proposalTable(proposal) {
  const { groups, hasSplits } = tableGroups(proposal);
  const bodies = groups.map(group => {
    const [first, ...rest] = group.rows;
    const heading = `<th scope="rowgroup" rowspan="${group.rows.length + 1}">${escapeHtml(group.name)}</th>`;
    return `
      <tbody class="proposal-block tone-${group.tone}">
        ${first.replace(/^<tr([^>]*)>/, `<tr$1>${heading}`)}
        ${rest.join('')}
        <tr class="subtotal"><td>${escapeHtml(group.name)} 합계</td><td></td><td></td><td class="number">${won(group.total)}</td></tr>
      </tbody>`;
  }).join('');
  const unassigned = proposal.unassignedTotal > 0
    ? `<tr class="unassigned"><th colspan="4">아직 배정하지 않은 금액</th><td class="number">${won(proposal.unassignedTotal)}</td></tr>`
    : '';
  const legend = hasSplits ? '<p class="split-legend">같은 색으로 칠한 줄은 한 항목을 여러 예산으로 나누어 품의한 것입니다.</p>' : '';

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
    </div>
    ${legend}`;
}

/* ---------- 품의 안내 ---------- */

export function proposalGuide(proposal) {
  const steps = tableGroups(proposal).groups.map(group => `${group.name}: 총 ${won(group.total)}원`);
  const notes = [];
  for (const split of proposal.splits) {
    const pieces = split.pieces.map(piece => `${piece.budgetName} ${won(piece.perPerson)}원`).join(' + ');
    notes.push(`${split.name}은(는) ${pieces}으로 나누어 품의합니다.`);
  }
  for (const block of proposal.blocks) {
    if (block.budget.count > 0 && block.unusedPerPerson > 0 && block.usedPerPerson > 0) {
      notes.push(`${block.budget.name} 1인당 ${won(block.unusedPerPerson)}원이 남습니다.`);
    }
    if (block.absentUnusedPerPerson > 0) {
      notes.push(`${block.budget.name}의 신청 후 불참 학생 몫 1인당 ${won(block.absentUnusedPerPerson)}원(${block.absentCount}명)이 남습니다.`);
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
  if (!steps.length) return '';
  return `
    <ol class="proposal-steps">${steps.map(step => `<li>${escapeHtml(step)}</li>`).join('')}</ol>
    ${notes.length ? `<ul class="proposal-notes">${notes.map(note => `<li>${escapeHtml(note)}</li>`).join('')}</ul>` : ''}`;
}

/** 업무포털 품의에 올리는 품목내역 파일. 업무포털은 예산 하나씩 올리므로 예산마다 버튼을 둔다. */
function portalDownloads(proposal) {
  const budgets = portalBudgets(proposal);
  if (!budgets.length) return '';
  const buttons = budgets.map(budget => `
    <button type="button" data-action="download-portal-items" data-budget-id="${escapeHtml(budget.id)}">
      ${escapeHtml(budget.name)} <small>${won(budget.total)}원</small>
    </button>`).join('');
  return `
    <div class="portal-downloads no-print">
      <h3>업무포털 업로드용 파일(품목내역) 받기</h3>
      <div class="portal-buttons">${buttons}</div>
    </div>`;
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
        <div class="toolbar no-print"><span class="spacer"></span><button type="button" data-action="copy-table" data-copy-target=".proposal-table">표 복사(한글에 붙여넣기)</button></div>
        ${proposalTable(proposal)}
        ${portalDownloads(proposal)}
      </fieldset>
      <div class="page-actions no-print"><button type="button" data-action="print">인쇄</button></div>
    </section>`;
}

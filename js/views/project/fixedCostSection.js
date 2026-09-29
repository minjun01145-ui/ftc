import { projectCounts } from '../../engine.js';
import {
  FIXED_COST_MODES,
  createCustomFixedCost,
  fixedCostBasisText,
  fixedCostBreakdown,
  fixedCostStaffShares,
  normalizeFixedCosts
} from '../../fixedCosts.js';
import { sharedNoteText, sharedPeopleOf } from '../../sharedCosts.js';
import { escapeHtml, formatWon, number } from '../../utils.js';

const money = value => formatWon(Math.round(number(value)));

function countsOf(project) {
  const c = projectCounts(project);
  return { participants: c.participants, dayAbsent: c.contractedAbsent, chaperones: c.chaperones };
}

// 받침이 있으면 '과', 없으면 '와'. 한글로 끝나지 않으면 '와(과)'.
function withParticle(word) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return `${word}와(과)`;
  return `${word}${code % 28 ? '과' : '와'}`;
}

/** 예) 1학년 수학여행과 같이 계산 */
export function sharedWithText(titles) {
  return `${withParticle(titles.join(', '))} 같이 계산`;
}

function sharedSummary({ sharedPeople, sharedNote, headcount }) {
  if (sharedPeople > 0) return `다른 학년 +${sharedPeople}명${sharedNote ? ` (${sharedNote})` : ''}`;
  if (headcount) return `계산 인원 ${headcount}명(직접 입력)`;
  return '';
}

/** 다른 학년과 함께 계산: 더한 인원 표시와 열기/해제 버튼. 값은 숨은 칸에 두고 저장할 때 읽는다. */
function sharedCountHtml(entry, disabled) {
  const summary = sharedSummary(entry);
  return `
    <div class="shared-count" data-shared-count>
      <input type="hidden" data-fixed-field="sharedPeople" value="${entry.sharedPeople || ''}">
      <input type="hidden" data-fixed-field="sharedNote" value="${escapeHtml(entry.sharedNote)}">
      <input type="hidden" data-fixed-field="sharedProjectIds" value="${escapeHtml(entry.sharedProjectIds.join(','))}">
      <input type="hidden" data-fixed-field="headcount" value="${entry.headcount ?? ''}">
      <span class="shared-summary" data-shared-summary ${summary ? '' : 'hidden'}>${escapeHtml(summary)}</span>
      <button type="button" class="small-button" data-action="open-shared-count" data-total-only ${disabled}>${summary ? '변경' : '다른 학년과 함께 계산'}</button>
      <button type="button" class="small-button" data-action="clear-shared-count" data-total-only ${summary ? '' : 'hidden'} ${disabled}>해제</button>
    </div>`;
}

function modeCell(entry) {
  const options = Object.entries(FIXED_COST_MODES)
    .map(([mode, label]) => `<option value="${mode}" ${mode === entry.mode ? 'selected' : ''}>${label}</option>`)
    .join('');
  const disabled = entry.mode === 'total' ? '' : 'disabled';
  return `
    <div class="fixed-cost-mode">
      <select data-fixed-field="mode" data-fixed-cost-mode aria-label="입력 방식">${options}</select>
      <label class="check-label" title="전체 계약액을 학생 + 인솔자 수로 나눕니다">
        <input type="checkbox" data-fixed-field="includeChaperones" data-total-only ${entry.includeChaperones ? 'checked' : ''} ${disabled}> 인솔자도 함께 부담
      </label>
      <label class="check-label" title="1인당 금액의 1원 단위를 버리고 10원 단위로 맞춥니다">
        <input type="checkbox" data-fixed-field="roundTo10" data-total-only ${entry.roundTo10 ? 'checked' : ''} ${disabled}> 1원 단위 버림
      </label>
      ${sharedCountHtml(entry, disabled)}
      <label class="check-label" title="신청 후 불참자도 이 비용을 부담합니다">
        <input type="checkbox" data-fixed-field="commonCost" ${entry.commonCost ? 'checked' : ''}> 공통비
      </label>
    </div>`;
}

export function fixedCostRowHtml(entry, breakdown = null) {
  const entered = breakdown && entry.amount > 0;
  const name = entry.builtin
    ? escapeHtml(entry.label)
    : `<input type="text" data-fixed-field="label" value="${escapeHtml(entry.label)}" placeholder="항목 이름" aria-label="기타비 항목 이름">`;
  const shared = entry.mode === 'total' && entry.sharedTitles.length > 0;
  const badge = shared ? `<small class="shared-badge">${escapeHtml(sharedWithText(entry.sharedTitles))}</small>` : '';
  return `
    <tr data-fixed-row data-fixed-id="${escapeHtml(entry.id)}" data-builtin="${entry.builtin ?? ''}" class="${shared ? 'shared-row' : ''}" ${entry.removed ? 'hidden' : ''}>
      <th scope="row">${name}${badge}<input type="hidden" data-fixed-field="removed" value="${entry.removed ? '1' : ''}"></th>
      <td>${modeCell(entry)}</td>
      <td><input type="number" min="0" step="1" data-fixed-field="amount" value="${number(entry.amount)}" aria-label="금액"></td>
      <td class="number">${entered ? money(breakdown.perPerson) : '-'}${entered ? `<small>${escapeHtml(fixedCostBasisText(breakdown))}</small>` : ''}</td>
      <td class="number">${entered ? money(breakdown.studentTotal) : '-'}</td>
      <td><input type="text" data-fixed-field="memo" value="${escapeHtml(entry.memo)}" placeholder="예: 2박" aria-label="내용"></td>
      <td class="center"><button type="button" class="small-button danger" data-action="delete-fixed-cost">삭제</button></td>
    </tr>`;
}

function staffShareRows(project) {
  return fixedCostStaffShares(project, countsOf(project))
    .filter(share => share.kind === 'remainder')
    .map(share => `
      <tr class="auto-row">
        <th scope="row">${escapeHtml(share.label)}</th>
        <td colspan="3">인솔자 비용</td>
        <td class="number">${money(share.total)}</td>
        <td colspan="2"></td>
      </tr>`).join('');
}

/** 체험처/비용 화면의 기타비 입력 표. 1인당 금액과 합계는 저장한 인원 기준으로 보여 준다. */
export function renderFixedCostTable(project) {
  const counts = countsOf(project);
  const options = { dayAbsentSharesCommonCost: Boolean(project.dayAbsentSharesCommonCost) };
  const entries = normalizeFixedCosts(project.fixedCosts);
  const rows = entries
    .map(entry => fixedCostRowHtml(entry, fixedCostBreakdown(entry, counts, options)))
    .join('');
  // 삭제한 기본 항목을 다시 추가하는 버튼
  const restore = entries.filter(entry => entry.builtin)
    .map(entry => `<button type="button" class="small-button" data-action="restore-fixed-cost" data-builtin="${entry.builtin}" ${entry.removed ? '' : 'hidden'}>+ ${escapeHtml(entry.label)}</button>`)
    .join('');

  return `
    <div class="fixed-cost-block" data-fixed-cost-section>
      <div class="block-head">
        <h3>기타비</h3>
        <button type="button" class="small-button" data-action="add-fixed-cost">기타비 항목 추가</button>
        ${restore}
        <span class="spacer"></span>
        <button type="button" class="save-button" data-action="save-student-expenses">저장</button>
      </div>
      <div class="table-wrap">
        <table class="compact-table fixed-cost-table">
          <thead><tr><th>항목</th><th>입력 방식</th><th>금액(원)</th><th>학생 1인당</th><th>학생 합계</th><th>내용</th><th>삭제</th></tr></thead>
          <tbody data-fixed-cost-list>${rows}${staffShareRows(project)}</tbody>
        </table>
      </div>
    </div>`;
}

export function addFixedCostRow(button) {
  const tbody = button.closest('[data-fixed-cost-section]')?.querySelector('[data-fixed-cost-list]');
  if (!tbody) return;
  const lastItem = [...tbody.querySelectorAll('[data-fixed-row]')].at(-1);
  const html = fixedCostRowHtml(createCustomFixedCost());
  if (lastItem) lastItem.insertAdjacentHTML('afterend', html);
  else tbody.insertAdjacentHTML('afterbegin', html);
  const added = [...tbody.querySelectorAll('[data-fixed-row]')].at(-1);
  added?.querySelector('[data-fixed-field="label"]')?.focus();
}

/** 사용자 항목은 지우고, 기본 항목(버스비 등)은 숨겨 두었다가 다시 추가할 수 있게 한다. */
export function removeFixedCostRow(button) {
  const row = button.closest('[data-fixed-row]');
  if (!row) return;
  const panel = row.nextElementSibling;
  if (panel?.matches('[data-shared-panel]')) panel.remove();
  if (!row.dataset.builtin) {
    row.remove();
    return;
  }
  row.querySelector('[data-fixed-field="removed"]').value = '1';
  row.hidden = true;
  row.closest('[data-fixed-cost-section]')?.querySelector(`[data-action="restore-fixed-cost"][data-builtin="${row.dataset.builtin}"]`)?.removeAttribute('hidden');
}

export function restoreFixedCostRow(button) {
  const section = button.closest('[data-fixed-cost-section]');
  const row = section?.querySelector(`[data-fixed-row][data-builtin="${button.dataset.builtin}"]`);
  if (!row) return;
  row.querySelector('[data-fixed-field="removed"]').value = '';
  row.hidden = false;
  button.hidden = true;
}

/** 입력 방식을 바꾸면 전체 계약액 전용 체크박스를 켜고 끈다. */
export function syncFixedCostModeControls(select) {
  select.closest('.fixed-cost-mode')?.querySelectorAll('[data-total-only]').forEach(checkbox => {
    checkbox.disabled = select.value !== 'total';
  });
}

/** 폼에 기타비 표가 있으면 행을 읽고, 없으면 기존 값을 그대로 돌려준다. */
export function readFixedCostInputs(form, previousFixedCosts) {
  const tbody = form.querySelector('[data-fixed-cost-list]');
  const previous = normalizeFixedCosts(previousFixedCosts);
  if (!tbody) return previous;
  const previousById = new Map(previous.map(entry => [entry.id, entry]));
  return normalizeFixedCosts([...tbody.querySelectorAll('[data-fixed-row]')].map(row => {
    const field = name => row.querySelector(`[data-fixed-field="${name}"]`);
    const before = previousById.get(row.dataset.fixedId) ?? {};
    const mode = field('mode').value;
    return {
      ...before,
      id: row.dataset.fixedId,
      builtin: row.dataset.builtin || null,
      label: field('label')?.value.trim() ?? before.label,
      mode,
      amount: field('amount').value,
      // 1인당 금액일 때는 체크박스가 꺼져 있으므로 이전 선택을 유지한다.
      includeChaperones: mode === 'total' ? field('includeChaperones').checked : before.includeChaperones,
      roundTo10: mode === 'total' ? field('roundTo10').checked : before.roundTo10,
      commonCost: field('commonCost').checked,
      removed: field('removed')?.value === '1',
      headcount: mode === 'total' ? field('headcount').value : before.headcount,
      sharedPeople: mode === 'total' ? field('sharedPeople').value : before.sharedPeople,
      sharedNote: mode === 'total' ? field('sharedNote').value : before.sharedNote,
      sharedProjectIds: mode === 'total' ? field('sharedProjectIds').value.split(',').filter(Boolean) : before.sharedProjectIds,
      // 이 화면에서 연결을 풀거나 직접 입력으로 바꾸면 연결 표시를 지운다(연결은 저장할 때 다시 채운다).
      sharedTitles: mode === 'total' && !field('sharedProjectIds').value ? [] : before.sharedTitles,
      memo: field('memo').value.trim()
    };
  }));
}

/* ---------- 다른 학년과 함께 계산 ---------- */

/** 내 사업 중 다른 사업의 같은 기타비(버스비 등)를 함께 부담할 인원. 이미 연결한 사업은 체크해 둔다. */
export function sharedCandidates(projects, currentProjectId, row) {
  const target = {
    builtin: row.dataset.builtin || null,
    label: row.querySelector('[data-fixed-field="label"]')?.value.trim() ?? row.querySelector('th')?.textContent.trim(),
    includeChaperones: row.querySelector('[data-fixed-field="includeChaperones"]')?.checked ?? false,
    commonCost: row.querySelector('[data-fixed-field="commonCost"]')?.checked ?? false
  };
  const linked = new Set(row.querySelector('[data-fixed-field="sharedProjectIds"]')?.value.split(',').filter(Boolean) ?? []);
  return projects
    .filter(project => project.id !== currentProjectId)
    .map(project => ({ ...sharedPeopleOf(project, target), checked: linked.has(project.id) }));
}

function sharedPanelHtml(candidates) {
  const list = candidates.length
    ? `<ul class="shared-candidates">${candidates.map(item => `
        <li><label><input type="checkbox" data-shared-candidate value="${escapeHtml(item.id)}" ${item.checked ? 'checked' : ''} data-people="${item.people}" data-title="${escapeHtml(item.title)}">
          <strong>${escapeHtml(item.title)}</strong> ${item.people}명 <small>(${escapeHtml(item.detail)})</small></label></li>`).join('')}</ul>
      <button type="button" class="small-button" data-action="apply-shared-projects">가져오기</button>`
    : '<p class="help">내 사업에 다른 사업이 없습니다. 다른 학년 사업을 먼저 만들거나 직접 입력하세요.</p>';
  return `
    <tr class="shared-panel-row" data-shared-panel>
      <td colspan="7">
        <div class="shared-panel">
          <div class="shared-option">
            <h4>내 사업에서 가져오기</h4>
            ${list}
          </div>
          <div class="shared-option">
            <h4>직접 입력</h4>
            <label>함께 계산할 다른 학년 인원 <input type="number" min="1" step="1" class="headcount-input" data-shared-manual>명</label>
            <button type="button" class="small-button" data-action="apply-shared-manual">적용</button>
          </div>
          <button type="button" class="small-button shared-close" data-action="close-shared-count">닫기</button>
        </div>
      </td>
    </tr>`;
}

export function openSharedPanel(button, candidates) {
  const row = button.closest('[data-fixed-row]');
  if (!row) return;
  const next = row.nextElementSibling;
  if (next?.matches('[data-shared-panel]')) {
    next.remove();
    return;
  }
  row.insertAdjacentHTML('afterend', sharedPanelHtml(candidates));
}

export function closeSharedPanel(button) {
  button.closest('[data-shared-panel]')?.remove();
}

/** 패널에서 고른 인원을 해당 기타비 행의 숨은 칸에 넣는다. 값을 넣었으면 true. */
export function applySharedCount(button, mode) {
  const panel = button.closest('[data-shared-panel]');
  const row = panel?.previousElementSibling;
  if (!row?.matches('[data-fixed-row]')) return false;
  let people = 0;
  let note = '';
  let ids = [];
  if (mode === 'projects') {
    const picked = [...panel.querySelectorAll('[data-shared-candidate]:checked')];
    people = picked.reduce((sum, input) => sum + Number(input.dataset.people || 0), 0);
    note = sharedNoteText(picked.map(input => ({ title: input.dataset.title, people: input.dataset.people })));
    ids = picked.map(input => input.value);
  } else {
    people = Math.max(0, Math.floor(Number(panel.querySelector('[data-shared-manual]')?.value) || 0));
    note = '직접 입력';
  }
  if (people <= 0) return false;
  setSharedFields(row, people, note, ids);
  panel.remove();
  return true;
}

export function clearSharedCount(button) {
  const row = button.closest('[data-fixed-row]');
  if (row) setSharedFields(row, 0, '', []);
}

function setSharedFields(row, people, note, ids) {
  row.querySelector('[data-fixed-field="sharedProjectIds"]').value = ids.join(',');
  row.querySelector('[data-fixed-field="sharedPeople"]').value = people ? String(people) : '';
  row.querySelector('[data-fixed-field="sharedNote"]').value = note;
  row.querySelector('[data-fixed-field="headcount"]').value = '';
}

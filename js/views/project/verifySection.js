import { buildVerification } from '../../verification.js';
import { escapeHtml } from '../../utils.js';

const STATUS = Object.freeze({
  ok: { icon: '✔', label: '맞음' },
  warn: { icon: '!', label: '확인 필요' },
  fail: { icon: '✖', label: '맞지 않음' },
  skip: { icon: '–', label: '해당 없음' }
});

function checkCard(check, index) {
  const status = STATUS[check.status];
  const lines = check.lines.length
    ? `<ol class="verify-lines">${check.lines.map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ol>`
    : '';
  const items = check.items.length
    ? `<ul class="verify-items">${check.items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
    : '';
  return `
    <section class="verify-card ${check.status}">
      <header>
        <span class="verify-badge" aria-hidden="true">${status.icon}</span>
        <h3>${index + 1}. ${escapeHtml(check.title)}</h3>
        <span class="verify-status">${status.label}</span>
      </header>
      ${lines}
      <p class="verify-result">${escapeHtml(check.result)}</p>
      ${items}
    </section>`;
}

export function renderVerifySection(project) {
  const { checks, summary } = buildVerification(project);
  const parts = [
    `맞음 ${summary.ok}개`,
    summary.warn ? `확인 필요 ${summary.warn}개` : '',
    summary.fail ? `맞지 않음 ${summary.fail}개` : ''
  ].filter(Boolean).join(' · ');
  const tone = summary.fail ? 'fail' : (summary.warn ? 'warn' : 'ok');
  return `
    <section class="verify-helper" data-project-section="verify">
      <p class="verify-summary ${tone}">저장된 값으로 검증했습니다: ${parts}</p>
      <div class="verify-cards">${checks.map(checkCard).join('')}</div>
      <div class="page-actions no-print"><button type="button" data-action="print">인쇄</button></div>
    </section>`;
}

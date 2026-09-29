import { costFormHtml, costFormModel } from '../../forms/costForm.js';
import { scheduleFormHtml, scheduleFormModel } from '../../forms/scheduleForm.js';

/** 양식 생성기: 계획서·가정통신문에 넣는 표를 한글에 붙여넣거나 HWPX 파일로 내려받는다. */
function formCard({ title, copyAction, downloadAction, enabled, warnings = [], preview }) {
  return `
      <section class="form-card">
        <div class="form-card-head">
          <h3>${title}</h3>
          <span class="spacer"></span>
          <button type="button" class="save-button" data-action="${copyAction}" ${enabled ? '' : 'disabled'}>표 복사(한글에 붙여넣기)</button>
          <button type="button" data-action="${downloadAction}" ${enabled ? '' : 'disabled'}>HWPX 파일 내려받기</button>
        </div>
        ${warnings.map(text => `<p class="warn-text">${text}</p>`).join('')}
        <div class="form-preview">${preview}</div>
      </section>`;
}

export function renderFormsSection(project) {
  const schedule = scheduleFormModel(project);
  const hasSchedule = schedule.rows.length > 0;
  const cost = costFormModel(project);
  const hasCost = cost.rows.length > 0;
  return `
    <section class="forms-helper" data-project-section="forms">
      ${formCard({
        title: '세부 일정표',
        copyAction: 'copy-schedule-form',
        downloadAction: 'download-schedule-hwpx',
        enabled: hasSchedule,
        warnings: [
          hasSchedule ? '' : '사업정보에서 체험학습 일정을 입력하면 세부 일정표가 만들어집니다.',
          hasSchedule && schedule.places.every(place => !place.text) ? '장소가 비어 있습니다. 사업정보 일정 표의 장소 칸에 입력하세요.' : ''
        ].filter(Boolean),
        preview: scheduleFormHtml(schedule)
      })}
      ${formCard({
        title: '경비 산출내역',
        copyAction: 'copy-cost-form',
        downloadAction: 'download-cost-hwpx',
        enabled: hasCost,
        warnings: hasCost ? [] : ['체험처/비용에서 단가를 입력하면 경비 산출내역이 만들어집니다.'],
        preview: costFormHtml(cost)
      })}
    </section>`;
}

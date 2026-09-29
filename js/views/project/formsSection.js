import { scheduleFormHtml, scheduleFormModel } from '../../forms/scheduleForm.js';

/** 양식 생성기: 계획서에 넣는 표를 한글에 붙여넣거나 HWPX 파일로 내려받는다. */
export function renderFormsSection(project) {
  const model = scheduleFormModel(project);
  const hasRows = model.rows.length > 0;
  const noPlace = hasRows && model.places.every(place => !place.text);
  return `
    <section class="forms-helper" data-project-section="forms">
      <section class="form-card">
        <div class="form-card-head">
          <h3>세부 일정표</h3>
          <span class="spacer"></span>
          <button type="button" class="save-button" data-action="copy-schedule-form" ${hasRows ? '' : 'disabled'}>표 복사(한글에 붙여넣기)</button>
          <button type="button" data-action="download-schedule-hwpx" ${hasRows ? '' : 'disabled'}>HWPX 파일 내려받기</button>
        </div>
        ${hasRows ? '' : '<p class="warn-text">사업정보에서 체험학습 일정을 입력하면 세부 일정표가 만들어집니다.</p>'}
        ${noPlace ? '<p class="warn-text">장소가 비어 있습니다. 사업정보 일정 표의 장소 칸에 입력하세요.</p>' : ''}
        <div class="form-preview">${scheduleFormHtml(model)}</div>
      </section>
    </section>`;
}

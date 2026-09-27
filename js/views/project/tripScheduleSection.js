import { TRIP_SCHEDULE_FILE_ACCEPT } from '../../services/scheduleUpload.js';
import { createTripScheduleItem } from '../../presets.js';
import { escapeHtml } from '../../utils.js';

function scheduleRowHtml(item) {
  return `
    <tr data-trip-schedule-row data-schedule-item-id="${escapeHtml(item.id)}">
      <td><input type="date" data-schedule-field="date" value="${escapeHtml(item.date)}" readonly></td>
      <td><input type="text" data-schedule-field="name" value="${escapeHtml(item.name)}" readonly></td>
      <td><input type="time" data-schedule-field="arrivalTime" value="${escapeHtml(item.arrivalTime)}" readonly></td>
      <td><input type="time" data-schedule-field="departureTime" value="${escapeHtml(item.departureTime)}" readonly></td>
      <td><input type="text" data-schedule-field="address" value="${escapeHtml(item.address)}" readonly></td>
      <td><input type="text" data-schedule-field="contact" value="${escapeHtml(item.contact)}" readonly></td>
    </tr>`;
}

function scheduleRowsHtml(items) {
  if (!items.length) {
    return '<tr data-trip-schedule-empty><td colspan="6" class="center">일정이 없습니다.</td></tr>';
  }
  return items.map(scheduleRowHtml).join('');
}

export function renderTripScheduleSection(project) {
  const items = Array.isArray(project.tripSchedule?.items) ? project.tripSchedule.items : [];
  const hasItems = items.length > 0;

  return `
    <fieldset class="section-fieldset trip-schedule-section" data-project-section="business" data-trip-schedule-section>
      <legend>체험학습 일정 입력</legend>
      <p class="section-note">파일 내용은 자동 입력되지 않습니다. 일정을 직접 입력하세요.</p>
      <div class="toolbar">
        <input type="file" accept="${TRIP_SCHEDULE_FILE_ACCEPT}" multiple data-trip-schedule-upload aria-label="일정 참고 파일">
        <span class="help" data-trip-schedule-upload-status></span>
        <span class="spacer"></span>
        <button type="button" data-action="add-schedule-item">일정 항목 추가</button>
        <button type="button" data-action="edit-trip-schedule" ${hasItems ? '' : 'disabled'}>수정</button>
        <button type="button" data-action="save-trip-schedule" disabled>저장</button>
      </div>
      <div class="table-wrap">
        <table class="trip-schedule-table">
          <thead>
            <tr><th>일자</th><th>일정/체험처</th><th>도착 시간</th><th>나가는 시간</th><th>주소</th><th>관계자 연락처</th></tr>
          </thead>
          <tbody>${scheduleRowsHtml(items)}</tbody>
        </table>
      </div>
    </fieldset>`;
}

export function setTripScheduleEditing(section, editing) {
  if (!section) return;
  section.dataset.editing = editing ? 'true' : 'false';
  section.querySelectorAll('[data-schedule-field]').forEach(input => {
    input.readOnly = !editing;
  });

  const editButton = section.querySelector('[data-action="edit-trip-schedule"]');
  const saveButton = section.querySelector('[data-action="save-trip-schedule"]');
  if (editButton) {
    editButton.disabled = editing;
    editButton.textContent = editing ? '수정 중' : '수정';
  }
  if (saveButton) saveButton.disabled = !editing;
}

export function newTripScheduleRowHtml() {
  return scheduleRowHtml(createTripScheduleItem());
}

export function readTripScheduleSection(section, previousSchedule = { items: [] }) {
  const previousItems = Array.isArray(previousSchedule?.items) ? previousSchedule.items : [];
  const previousById = new Map(previousItems.map(item => [String(item.id), item]));
  const rows = [...section.querySelectorAll('[data-trip-schedule-row]')];

  return {
    items: rows.map(row => {
      const id = String(row.dataset.scheduleItemId ?? '');
      const previous = previousById.get(id) ?? { id };
      const value = field => row.querySelector(`[data-schedule-field="${field}"]`)?.value ?? '';
      return {
        ...previous,
        id,
        date: value('date'),
        name: value('name').trim(),
        arrivalTime: value('arrivalTime'),
        departureTime: value('departureTime'),
        address: value('address').trim(),
        contact: value('contact').trim()
      };
    })
  };
}

export function updateTripScheduleUploadStatus(input, validation) {
  const section = input.closest('[data-trip-schedule-section]');
  const status = section?.querySelector('[data-trip-schedule-upload-status]');
  if (!status) return;

  status.classList.remove('error-text');
  if (validation.rejected.length) {
    status.textContent = 'PDF 또는 JPG 파일만 업로드할 수 있습니다.';
    status.classList.add('error-text');
    input.value = '';
    return;
  }

  if (!validation.accepted.length) {
    status.textContent = 'PDF 또는 JPG 파일을 선택할 수 있습니다.';
    return;
  }

  const names = validation.accepted.map(file => file.name).join(', ');
  status.textContent = `참고파일 선택: ${names} · 파일 내용은 자동 입력되지 않습니다.`;
}

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
      <td>
        <div class="address-cell">
          <input type="text" data-schedule-field="address" value="${escapeHtml(item.address)}" readonly>
          <button type="button" class="small-button" data-action="search-schedule-place" hidden>검색</button>
        </div>
      </td>
      <td><input type="text" data-schedule-field="contact" value="${escapeHtml(item.contact)}" readonly></td>
    </tr>`;
}

function scheduleRowsHtml(items) {
  if (!items.length) {
    return '<tr data-trip-schedule-empty><td colspan="6" class="center">일정이 없습니다.</td></tr>';
  }
  return items.map(scheduleRowHtml).join('');
}

function formatImportedAt(isoText) {
  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) return '';
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function importSourceText(importedFrom) {
  if (!importedFrom?.importedAt) return '';
  const when = formatImportedAt(importedFrom.importedAt);
  const file = importedFrom.filename ? ` '${importedFrom.filename}'` : '';
  return `${when}에 불러온 문서${file} 기준 일정입니다.`;
}

export function renderTripScheduleSection(project) {
  const items = Array.isArray(project.tripSchedule?.items) ? project.tripSchedule.items : [];
  const hasItems = items.length > 0;
  const sourceText = importSourceText(project.tripSchedule?.importedFrom);

  return `
    <fieldset class="section-fieldset trip-schedule-section" data-project-section="business" data-trip-schedule-section>
      <legend>체험학습 일정 입력</legend>
      <div class="toolbar">
        <input type="file" accept="${TRIP_SCHEDULE_FILE_ACCEPT}" data-trip-schedule-upload aria-label="PDF 또는 HWPX 일정 문서 업로드">
        <span class="help" data-trip-schedule-upload-status role="status" aria-live="polite"></span>
        <span class="spacer"></span>
        <button type="button" data-action="add-schedule-item">일정 항목 추가</button>
        <button type="button" data-action="edit-trip-schedule" ${hasItems ? '' : 'disabled'}>수정</button>
        <button type="button" data-action="save-trip-schedule" disabled>저장</button>
      </div>
      <p class="schedule-source" data-trip-schedule-source ${sourceText ? '' : 'hidden'}>${escapeHtml(sourceText)}</p>
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
  section.querySelectorAll('[data-action="search-schedule-place"]').forEach(button => {
    button.hidden = !editing;
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

/**
 * 표의 현재 내용을 일정 데이터로 읽는다.
 * 문서를 새로 불러와 아직 저장하지 않았다면 그 문서를 기준 정보로 쓰고, 아니면 기존 기준을 유지한다.
 */
export function readTripScheduleSection(section, previousSchedule = { items: [] }) {
  const previousItems = Array.isArray(previousSchedule?.items) ? previousSchedule.items : [];
  const previousById = new Map(previousItems.map(item => [String(item.id), item]));
  const rows = [...section.querySelectorAll('[data-trip-schedule-row]')];
  const pendingImport = section.dataset.pendingImportedAt
    ? { filename: section.dataset.pendingFilename ?? '', importedAt: section.dataset.pendingImportedAt }
    : null;

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
    }),
    importedFrom: pendingImport ?? previousSchedule?.importedFrom ?? null
  };
}

export function setTripScheduleUploadStatus(input, text, { error = false } = {}) {
  const section = input.closest('[data-trip-schedule-section]');
  const status = section?.querySelector('[data-trip-schedule-upload-status]');
  if (!status) return;

  status.classList.remove('error-text');
  status.textContent = text;
  if (error) status.classList.add('error-text');
}

/** 분석 중 경과 시간을 1초마다 표시한다. 반환한 함수를 호출하면 멈춘다. */
export function startTripScheduleAnalysisTimer(input) {
  const startedAt = Date.now();
  const update = () => {
    const seconds = Math.floor((Date.now() - startedAt) / 1000);
    setTripScheduleUploadStatus(input, `분석 중... ${seconds}초`);
  };
  update();
  const timer = setInterval(update, 1000);
  return () => clearInterval(timer);
}

export function replaceTripScheduleDraft(section, items, source) {
  if (!section || !Array.isArray(items) || !items.length) return false;
  const tbody = section.querySelector('tbody');
  if (!tbody) return false;
  const draftItems = items.map(item => createTripScheduleItem(item));
  tbody.innerHTML = scheduleRowsHtml(draftItems);
  section.dataset.pendingFilename = source?.filename ?? '';
  section.dataset.pendingImportedAt = source?.importedAt ?? '';
  const sourceLabel = section.querySelector('[data-trip-schedule-source]');
  if (sourceLabel) {
    sourceLabel.textContent = `${importSourceText(source)} (저장 전)`;
    sourceLabel.hidden = false;
  }
  setTripScheduleEditing(section, true);
  return true;
}

/** 장소 검색 결과를 해당 일정 행에 채운다. 연락처는 비어 있을 때만 채운다. */
export function applyPlaceToScheduleRow(row, place) {
  const field = name => row?.querySelector(`[data-schedule-field="${name}"]`);
  const address = field('address');
  const contact = field('contact');
  const name = field('name');
  if (address) address.value = place.roadAddress || place.address || '';
  if (contact && !contact.value.trim() && place.phone) contact.value = place.phone;
  if (name && !name.value.trim() && place.name) name.value = place.name;
}

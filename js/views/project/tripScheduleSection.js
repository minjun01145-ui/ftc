import { TRIP_SCHEDULE_FILE_ACCEPT } from '../../services/scheduleUpload.js';
import { createTripScheduleItem } from '../../presets.js';
import { escapeHtml } from '../../utils.js';
import { dayHeading, dayToneClass, dayToneMap } from '../dayTone.js';

function scheduleRowHtml(item, tones = new Map()) {
  return `
    <tr data-trip-schedule-row data-schedule-item-id="${escapeHtml(item.id)}" class="${dayToneClass(tones, item.date)}">
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
      <td><input type="text" data-schedule-field="contact" value="${escapeHtml(item.contact)}" placeholder="연락처 등" readonly></td>
    </tr>`;
}

function scheduleRowsHtml(items) {
  if (!items.length) {
    return '<tr data-trip-schedule-empty><td colspan="6" class="center">일정이 없습니다.</td></tr>';
  }
  const tones = dayToneMap(items.map(item => item.date));
  return items.map(item => scheduleRowHtml(item, tones)).join('');
}

function timeText(item) {
  if (item.arrivalTime && item.departureTime) return `${item.arrivalTime} ~ ${item.departureTime}`;
  if (item.arrivalTime) return `${item.arrivalTime} 도착`;
  if (item.departureTime) return `${item.departureTime} 출발`;
  return '';
}

/** 저장된 일정을 날짜별로 묶어 읽기 좋게 보여 주는 표(수정하지 않을 때). */
function scheduleViewHtml(items) {
  if (!items.length) return '<p class="schedule-empty">아직 일정이 없습니다. 일정 문서를 불러오거나 일정 항목을 추가하세요.</p>';
  const tones = dayToneMap(items.map(item => item.date));
  const groups = [];
  for (const item of items) {
    const key = String(item.date ?? '');
    const last = groups.at(-1);
    if (last && last.date === key) last.items.push(item);
    else groups.push({ date: key, items: [item] });
  }
  const bodies = groups.map(group => `
    <tbody class="schedule-day ${dayToneClass(tones, group.date)}">
      <tr class="schedule-day-head"><th colspan="4">${escapeHtml(dayHeading(tones, group.date))}</th></tr>
      ${group.items.map(item => `
        <tr>
          <td class="schedule-time">${escapeHtml(timeText(item))}</td>
          <td class="schedule-name">${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.address)}</td>
          <td>${escapeHtml(item.contact)}</td>
        </tr>`).join('')}
    </tbody>`).join('');
  return `
    <div class="table-wrap">
      <table class="compact-table schedule-view-table">
        <thead><tr><th>시간</th><th>일정/체험처</th><th>주소</th><th>메모(연락처 등)</th></tr></thead>
        ${bodies}
      </table>
    </div>`;
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
      <p class="help">운영위원회 안건·실시 계획 등 PDF·HWPX 문서를 올리면 세부 일정 표(시간·일정 칸)나 주요 경로(➡)를 읽어 초안을 만듭니다.</p>
      <p class="schedule-source" data-trip-schedule-source ${sourceText ? '' : 'hidden'}>${escapeHtml(sourceText)}</p>
      <div data-trip-schedule-view>${scheduleViewHtml(items)}</div>
      <div class="table-wrap" data-trip-schedule-edit hidden>
        <table class="trip-schedule-table">
          <thead>
            <tr><th>일자</th><th>일정/체험처</th><th>도착 시간</th><th>나가는 시간</th><th>주소</th><th>메모(연락처 등)</th></tr>
          </thead>
          <tbody>${scheduleRowsHtml(items)}</tbody>
        </table>
      </div>
    </fieldset>`;
}

export function setTripScheduleEditing(section, editing) {
  if (!section) return;
  section.dataset.editing = editing ? 'true' : 'false';
  // 수정할 때는 입력 표를, 아닐 때는 날짜별로 묶은 보기 표를 보여 준다.
  const view = section.querySelector('[data-trip-schedule-view]');
  const edit = section.querySelector('[data-trip-schedule-edit]');
  if (view) view.hidden = editing;
  if (edit) edit.hidden = !editing;
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

/** 입력 표의 tbody. 보기 표에도 tbody가 있으므로 반드시 이 함수로 찾는다. */
export function scheduleEditBody(section) {
  return section?.querySelector('[data-trip-schedule-edit] tbody') ?? null;
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
  const tbody = scheduleEditBody(section);
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

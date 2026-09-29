import { scheduleUploadErrorMessage, validateScheduleFiles } from '../services/scheduleUpload.js';
import { syncExpensesFromTripSchedule, tripScheduleDateRange } from '../tripSchedule.js';
import { openPlaceSearchDialog } from '../views/placeSearchDialog.js';
import {
  applyPlaceToScheduleRow,
  newTripScheduleRowHtml,
  readTripScheduleSection,
  replaceTripScheduleDraft,
  scheduleEditBody,
  setTripScheduleEditing,
  setTripScheduleUploadStatus,
  startTripScheduleAnalysisTimer
} from '../views/project/tripScheduleSection.js';

/**
 * 사업정보의 체험학습 일정 표 동작(문서 불러오기, 행 추가, 장소 검색, 저장).
 * 앱 상태와 화면 갱신은 app.js가 넘겨 주는 함수로만 다룬다.
 */
export function createTripScheduleController({
  documentImport,
  placeSearch,
  getProject,
  getSchoolYear,
  saveProject,
  isFormAttached,
  markDirty,
  showMessage
}) {
  let importRequestId = 0;

  async function importDocument(input) {
    const section = input.closest('[data-trip-schedule-section]');
    const form = input.form;
    const requestId = ++importRequestId;
    const isCurrent = () => isFormAttached(form) && requestId === importRequestId;
    const validation = validateScheduleFiles(input.files);
    if (validation.error) {
      setTripScheduleUploadStatus(input, scheduleUploadErrorMessage(validation.error), { error: true });
      input.value = '';
      return;
    }

    const [file] = validation.accepted;
    const project = getProject();
    if (!project || !section || !form) {
      input.value = '';
      return;
    }

    input.disabled = true;
    const stopTimer = startTripScheduleAnalysisTimer(input);
    try {
      const items = await documentImport.importFile(file, {
        projectTitle: project.title,
        schoolYear: getSchoolYear(),
        startDate: project.startDate,
        endDate: project.endDate
      });
      stopTimer();
      if (!isCurrent()) return;
      if (!items.length) {
        setTripScheduleUploadStatus(input, '일정 항목을 찾지 못했습니다. 기존 일정은 그대로입니다.');
        return;
      }
      const source = { filename: file.name, importedAt: new Date().toISOString() };
      if (!replaceTripScheduleDraft(section, items, source)) {
        setTripScheduleUploadStatus(input, '일정 초안을 만들지 못했습니다. 기존 일정은 그대로입니다.', { error: true });
        return;
      }
      markDirty();
      const range = tripScheduleDateRange(items);
      if (range) {
        if (form.elements.startDate) form.elements.startDate.value = range.startDate;
        if (form.elements.endDate) form.elements.endDate.value = range.endDate;
      }
      const rangeText = range ? ` 기간(${range.startDate} ~ ${range.endDate})도 입력했습니다.` : '';
      const via = documentImport.label ? `(${documentImport.label})` : '';
      setTripScheduleUploadStatus(input, `${items.length}개 일정을 초안으로 가져왔습니다${via}.${rangeText} 확인한 뒤 저장해 주세요.`);
    } catch (error) {
      stopTimer();
      if (!isCurrent()) return;
      const messageText = ['AI_NOT_CONFIGURED', 'AI_MODEL_NOT_CONFIGURED'].includes(error.code)
        ? '문서 일정 가져오기가 설정되지 않았습니다.'
        : error.message || '문서에서 일정을 읽지 못했습니다.';
      setTripScheduleUploadStatus(input, messageText, { error: true });
    } finally {
      input.value = '';
      input.disabled = false;
    }
  }

  function addRow(button) {
    const section = button.closest('[data-trip-schedule-section]');
    const tbody = scheduleEditBody(section);
    if (!tbody) return;
    tbody.querySelector('[data-trip-schedule-empty]')?.remove();
    tbody.insertAdjacentHTML('beforeend', newTripScheduleRowHtml());
    setTripScheduleEditing(section, true);
    markDirty();
  }

  async function searchPlace(button) {
    const row = button.closest('[data-trip-schedule-row]');
    if (!row) return;
    const name = row.querySelector('[data-schedule-field="name"]')?.value ?? '';
    const place = await openPlaceSearchDialog({ initialQuery: name, search: query => placeSearch.search(query) });
    if (!place || !row.isConnected) return;
    applyPlaceToScheduleRow(row, place);
    markDirty();
  }

  /**
   * 일정 표를 수정 중이면(문서에서 불러온 초안 포함) 일정을 사업 데이터에 넣고 체험처/비용에 반영한다.
   * 수정 중이 아니면 null을 돌려준다. 저장은 app.js가 페이지 전체와 함께 한다.
   */
  function applyTo(form, project) {
    const section = form.querySelector('[data-trip-schedule-section]');
    if (!section || section.dataset.editing !== 'true') return null;
    const tripSchedule = readTripScheduleSection(section, project.tripSchedule);
    return { ...project, tripSchedule, expenses: syncExpensesFromTripSchedule(tripSchedule, project.expenses) };
  }

  return Object.freeze({
    importDocument,
    addRow,
    searchPlace,
    applyTo,
    startEditing: button => setTripScheduleEditing(button.closest('[data-trip-schedule-section]'), true)
  });
}

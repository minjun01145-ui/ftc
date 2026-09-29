import { createExpense } from './presets.js';

function scheduleDetails(item) {
  return {
    arrivalTime: String(item.arrivalTime ?? ''),
    departureTime: String(item.departureTime ?? ''),
    contact: String(item.contact ?? '')
  };
}

function scheduleItemIsUsable(item) {
  return String(item?.id ?? '').trim() !== ''
    && (String(item?.date ?? '').trim() !== '' || String(item?.name ?? '').trim() !== '');
}

/** 일정 항목의 가장 이른 날짜와 가장 늦은 날짜를 사업 기간으로 돌려줍니다. */
export function tripScheduleDateRange(items) {
  const dates = (Array.isArray(items) ? items : [])
    .map(item => String(item?.date ?? '').trim())
    .filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();
  return dates.length ? { startDate: dates[0], endDate: dates[dates.length - 1] } : null;
}

export function syncExpensesFromTripSchedule(tripSchedule, previousExpenses = []) {
  const scheduleItems = Array.isArray(tripSchedule?.items) ? tripSchedule.items : [];
  const expenses = Array.isArray(previousExpenses) ? previousExpenses : [];
  const linkedByScheduleId = new Map(
    expenses
      .filter(expense => expense.sourceScheduleItemId)
      .map(expense => [String(expense.sourceScheduleItemId), expense])
  );
  const manualExpenses = expenses.filter(expense => !expense.sourceScheduleItemId);
  const seenScheduleIds = new Set();

  const syncedExpenses = scheduleItems
    .filter(scheduleItemIsUsable)
    .filter(item => {
      const id = String(item.id);
      if (seenScheduleIds.has(id)) return false;
      seenScheduleIds.add(id);
      return true;
    })
    .map(item => {
      const sourceScheduleItemId = String(item.id);
      const previous = linkedByScheduleId.get(sourceScheduleItemId);
      const scheduleValues = {
        sourceScheduleItemId,
        date: String(item.date ?? ''),
        name: String(item.name ?? ''),
        details: scheduleDetails(item)
      };

      if (!previous) return createExpense(scheduleValues);
      return {
        ...previous,
        ...scheduleValues,
        details: {
          ...(previous.details ?? {}),
          ...scheduleValues.details
        }
      };
    });

  return [...syncedExpenses, ...manualExpenses];
}

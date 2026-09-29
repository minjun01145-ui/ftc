import { calculateExpense, studentExpenseItems } from './engine.js';

/**
 * 학생 1인별 금액 산출 내역의 한 줄씩(시행 전 데이터 보기, 품의 도우미가 함께 쓴다).
 * 금액이 없는 일정(이동, 자유시간 등)은 빼고, 돈이 드는 항목만 돌려준다.
 *
 * line = { id, date, name, description, basis(기타비 단가 산출 근거), note, isFixedCost, includesDayAbsent,
 *          perPerson(학생 1인 금액), quantity(학생 수), total(해당 항목 총액) }
 */
export function studentCostLines(project) {
  return studentExpenseItems(project)
    .map(item => {
      const calc = calculateExpense(item, project, false);
      const perPerson = item.calcMethod === 'perPerson'
        ? Math.round(Number(item.unitAmount) || 0)
        : (calc.studentQty > 0 ? Math.round(calc.studentTotal / calc.studentQty) : 0);
      return {
        id: String(item.id),
        date: String(item.date ?? ''),
        name: String(item.name ?? ''),
        description: String(item.description ?? ''),
        basis: String(item.basis ?? ''),
        note: String(item.note ?? ''),
        isFixedCost: Boolean(item.fixedCostKey),
        includesDayAbsent: item.quantityBase === 'participantsPlusAbsent',
        perPerson,
        quantity: calc.studentQty,
        total: calc.studentTotal
      };
    })
    .filter(line => line.perPerson > 0 || line.total > 0);
}

export function sumLines(lines, key) {
  return lines.reduce((sum, line) => sum + (Number(line[key]) || 0), 0);
}

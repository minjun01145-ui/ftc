import { STUDENT_BUDGET_ID } from '../proposalPlanner.js';
import { buildXls } from './xlsWriter.js';

/**
 * 업무포털 품의에 올리는 '품목내역' 엑셀(.xls). 업무포털은 한 번에 예산 하나만 올릴 수 있어서
 * 예산마다 파일을 따로 만든다. 열은 업무포털 양식과 같다: 내용 | 규격 | 단위 | 수량 | 예상단가
 *
 * 품의 도우미에서 그 예산에 체크한 항목이 한 줄씩 들어간다(수량 × 예상단가 = 그 예산의 품의액).
 * - 참여 학생 항목: 수량은 그 예산의 학생 수(비취약계층 또는 취약계층)
 * - 신청 후 불참 공통비: 수량은 불참 인원
 * - 수익자 부담: 취약계층 학생이 내는 금액(교육청에서 지원하지 않은 부분)도 들어간다.
 */
export const PORTAL_ITEM_HEADER = Object.freeze(['내용', '규격', '단위', '수량', '예상단가']);
export const PORTAL_SHEET_NAME = '품목내역';

function shortDate(isoDate) {
  const match = String(isoDate ?? '').match(/^\d{4}-(\d{2})-(\d{2})$/);
  return match ? `${Number(match[1])}/${Number(match[2])}` : '';
}

const itemName = item => [shortDate(item.date), item.name].filter(Boolean).join(' ');
const groupName = group => (group === 'vulnerable' ? '취약계층' : '비취약계층');

/** 예산 하나의 품목 줄. [[내용, 규격, 단위, 수량, 예상단가], ...] */
export function portalItemRows(proposal, budgetId) {
  const block = proposal.blocks.find(item => item.budget.id === budgetId);
  if (!block) return [];
  const rows = [];
  for (const part of block.parts) {
    rows.push([itemName(part), groupName(block.budget.group), '명', block.budget.count, part.perPerson]);
  }
  for (const part of block.absentParts) {
    rows.push([`${itemName(part)}(신청 후 불참)`, `신청 후 불참(${groupName(part.group)})`, '명', part.count, part.perPerson]);
  }
  if (budgetId === STUDENT_BUDGET_ID) {
    for (const line of proposal.unassigned.vulnerable) {
      rows.push([itemName(line), '취약계층', '명', proposal.counts.vulnerable, line.perPerson]);
    }
  }
  return rows.filter(([, , , count, price]) => count > 0 && price > 0);
}

/** 품목내역을 받을 수 있는 예산(배정한 금액이 있는 예산) */
export function portalBudgets(proposal) {
  return proposal.blocks
    .filter(block => portalItemRows(proposal, block.budget.id).length > 0)
    .map(block => ({ id: block.budget.id, name: block.budget.name, total: portalTotal(proposal, block.budget.id) }));
}

export function portalTotal(proposal, budgetId) {
  return portalItemRows(proposal, budgetId).reduce((sum, [, , , count, price]) => sum + count * price, 0);
}

export function portalItemsFile(proposal, budgetId) {
  return buildXls(PORTAL_SHEET_NAME, [[...PORTAL_ITEM_HEADER], ...portalItemRows(proposal, budgetId)]);
}

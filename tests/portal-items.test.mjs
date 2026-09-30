import test from 'node:test';
import assert from 'node:assert/strict';
import { createOtherSupport } from '../js/budget.js';
import { createExpense, createProject } from '../js/presets.js';
import { addAllocations, normalizeProposalPlan } from '../js/proposalPlan.js';
import { EDUCATION_BUDGET_ID, STUDENT_BUDGET_ID, VULNERABLE_BUDGET_ID, absentLineId, buildProposal } from '../js/proposalPlanner.js';
import { portalBudgets, portalItemRows, portalItemsFile } from '../js/forms/portalItems.js';
import { buildXls, workbookStream } from '../js/forms/xlsWriter.js';

// 참여 11명(취약 2), 비취약 신청 후 불참 1명. 인원은 개인용·대회용 저장 모양을 모두 채운다.
function project() {
  const p = createProject('수학여행');
  Object.assign(p, {
    totalStudents: 15, actualParticipants: 11, vulnerableParticipants: 2, contractedAbsentStudents: 1,
    regularContractedAbsent: 1, vulnerableContractedAbsent: 0, chaperones: 0, dayAbsentSharesCommonCost: true,
    attendance: { applicants: 12, vulnerableApplicants: 2, regularDayAbsent: 1, vulnerableDayAbsent: 0, chaperones: 0 }
  });
  p.fixedCosts = [{ builtin: 'bus', mode: 'total', amount: 1_200_000, includeChaperones: false, roundTo10: true }];
  p.expenses = [createExpense({ id: 'ticket', date: '2026-05-13', name: '입장료', unitAmount: 50000 })];
  p.educationSupport = { ...p.educationSupport, regularPerPerson: 100000, vulnerableMode: 'perPerson', vulnerablePerPerson: 120000 };
  p.otherSupports = [createOtherSupport({ id: 'school', name: '학교 자체지원금', amount: 20000 })];
  // 버스비 1인 = 1,200,000 ÷ 12 = 100,000원 → 1인당 150,000원
  let plan = addAllocations(normalizeProposalPlan({}), VULNERABLE_BUDGET_ID, ['fixed-bus', 'ticket']);
  plan = addAllocations(plan, EDUCATION_BUDGET_ID, ['fixed-bus', absentLineId('regular', 'fixed-bus')]);
  plan = addAllocations(plan, 'school', ['ticket']);
  plan = addAllocations(plan, STUDENT_BUDGET_ID, ['ticket']);
  p.proposalPlan = plan;
  return p;
}

test('예산마다 품목내역 줄을 만들고, 수량 × 예상단가의 합은 그 예산의 품의액과 같다', () => {
  const proposal = buildProposal(project());
  assert.deepEqual(portalItemRows(proposal, EDUCATION_BUDGET_ID), [
    ['버스비', '비취약계층', '명', 9, 100000],
    ['버스비(신청 후 불참)', '신청 후 불참(비취약계층)', '명', 1, 100000]
  ]);
  assert.deepEqual(portalItemRows(proposal, 'school'), [['5/13 입장료', '비취약계층', '명', 9, 20000]]);
  assert.deepEqual(portalItemRows(proposal, STUDENT_BUDGET_ID), [
    ['5/13 입장료', '비취약계층', '명', 9, 30000],
    ['5/13 입장료', '취약계층', '명', 2, 30000]
  ], '취약계층 지원 한도를 넘는 금액은 수익자 부담 파일에 들어간다');
  assert.deepEqual(portalItemRows(proposal, VULNERABLE_BUDGET_ID), [
    ['버스비', '취약계층', '명', 2, 100000],
    ['5/13 입장료', '취약계층', '명', 2, 20000]
  ]);

  for (const budget of portalBudgets(proposal)) {
    const block = proposal.blocks.find(item => item.budget.id === budget.id);
    const expected = budget.id === STUDENT_BUDGET_ID ? block.total + proposal.vulnerableBurden.total : block.total;
    assert.equal(budget.total, expected, budget.name);
  }
});

test('품목내역 파일은 엑셀 97-2003(.xls) 복합 문서이고, 시트 이름과 머리글이 업무포털 양식과 같다', () => {
  const bytes = portalItemsFile(buildProposal(project()), EDUCATION_BUDGET_ID);
  assert.deepEqual([...bytes.slice(0, 8)], [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
  assert.equal(bytes.length % 512, 0);
  const stream = Buffer.from(workbookStream('품목내역', [['내용', '규격', '단위', '수량', '예상단가']]));
  assert.equal(stream.readUInt16LE(0), 0x0809, 'BOF로 시작한다');
  assert.ok(stream.includes(Buffer.from('품목내역', 'utf16le')));
  assert.ok(stream.includes(Buffer.from('예상단가', 'utf16le')));
  // 글자가 많아 공유 문자열이 8224바이트를 넘으면 CONTINUE 레코드로 나눈다
  const rows = Array.from({ length: 300 }, (_, i) => [`항목 ${i} 아주 긴 이름을 가진 체험 활동`, '비취약계층', '명', i, 1000]);
  assert.ok(buildXls('품목내역', rows).length > 4096);
});

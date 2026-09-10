import assert from 'node:assert/strict';
import { defaultProject } from '../js/presets.js';
import { calculateExpense, summarize } from '../js/engine.js';

const project = structuredClone(defaultProject);
const summary = summarize(project, false);
const bus = calculateExpense(project.expenses.find(e => e.id === 'bus'), project, false);

assert.equal(summary.counts.actualStudents, 70);
assert.equal(summary.counts.fixedStudents, 71);
assert.equal(bus.unit, 113920);
assert.equal(bus.studentTotal, 8088320);
assert.equal(bus.staffTotal, 911680);
assert.equal(summary.allocation.expensesResult.studentTotal, 22129900);
assert.equal(summary.personalBurden, 43000);

const edu = summary.allocation.accountResults.find(a => a.id === 'edu');
const art = summary.allocation.accountResults.find(a => a.id === 'art');
const school = summary.allocation.accountResults.find(a => a.id === 'school');
const student = summary.allocation.accountResults.find(a => a.id === 'student');

assert.equal(edu.used, 17174400);
assert.equal(edu.balance, 3185600);
assert.equal(art.used, 954000);
assert.equal(school.used, 1722500);
assert.equal(student.used, 2279000);
assert.equal(summary.allocation.uncovered, 0);

console.log('✓ 핵심 계산 테스트 통과');

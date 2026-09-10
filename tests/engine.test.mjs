import assert from 'node:assert/strict';
import { sampleProject } from '../js/presets.js';
import { allocateFunding, calculateExpense, projectCounts, validateProject } from '../js/engine.js';

const project = sampleProject();
const counts = projectCounts(project);
assert.equal(counts.participants, 70);
assert.equal(counts.absent, 1);
assert.equal(counts.regularParticipants, 53);
assert.equal(counts.vulnerableParticipants, 17);

const bus = calculateExpense(project.expenses[0], project, false);
assert.equal(bus.unit, 113920);
assert.equal(bus.studentTotal, 8088320);
assert.equal(bus.staffTotal, 911680);

const funding = allocateFunding(project, false);
assert.ok(funding.expenses.studentTotal > 0);
assert.equal(funding.educationUsed + funding.schoolUsed + funding.studentUsed, funding.expenses.studentTotal);
assert.equal(validateProject(project, false).issues.length, 0);

const changed = structuredClone(project);
changed.actualParticipants = 69;
changed.absentStudents = 1;
const bus2 = calculateExpense(changed.expenses[0], changed, false);
assert.notEqual(bus2.unit, bus.unit);

console.log('✓ 계산 엔진 테스트 통과');

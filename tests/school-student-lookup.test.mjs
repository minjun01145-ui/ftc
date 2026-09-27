import assert from 'node:assert/strict';
import test from 'node:test';
import { createSchoolStudentLookup } from '../js/services/schoolStudentLookup.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test('학교 선택에 따른 자동 조회 결과를 1~3학년과 전체 학생수에 반영한다', async () => {
  const calls = [];
  const lookup = createSchoolStudentLookup(async request => {
    calls.push(request);
    return { reportYear: 2026, counts: { grade1Students: 31, grade2Students: 32, grade3Students: 33 } };
  });
  const form = { schoolCode: 'sch-1', educationOffice: 'seobu', region: 'region-1', year: '2026' };
  const students = { grade1: '', grade2: '', grade3: '', total: '' };
  const outcome = await lookup.lookup({ educationOffice: 'seobu', schoolCode: 'sch-1', schoolRegionCode: 'region-1', reportYear: 2026 }, {
    isCurrent: () => form.schoolCode === 'sch-1' && form.year === '2026',
    apply(result) {
      students.grade1 = result.counts.grade1Students;
      students.grade2 = result.counts.grade2Students;
      students.grade3 = result.counts.grade3Students;
      students.total = students.grade1 + students.grade2 + students.grade3;
    }
  });

  assert.equal(outcome.applied, true);
  assert.deepEqual(calls, [{ educationOffice: 'seobu', schoolCode: 'sch-1', schoolRegionCode: 'region-1', reportYear: 2026 }]);
  assert.deepEqual(students, { grade1: 31, grade2: 32, grade3: 33, total: 96 });
});

test('학생수를 직접 수정한 뒤 도착한 늦은 응답은 덮어쓰지 않는다', async () => {
  const pending = deferred();
  const lookup = createSchoolStudentLookup(() => pending.promise);
  let count = '20';
  let applied = false;
  const request = lookup.lookup({ schoolCode: 'sch-1' }, {
    isCurrent: () => count === '20',
    apply() { applied = true; }
  });
  count = '21';
  lookup.invalidate();
  pending.resolve({ counts: { grade1Students: 40 } });

  assert.deepEqual(await request, { applied: false });
  assert.equal(applied, false);
  assert.equal(count, '21');
});

test('학교가 바뀐 뒤 이전 학교의 늦은 응답은 새 학교 학생수를 덮어쓰지 않는다', async () => {
  const pending = deferred();
  const lookup = createSchoolStudentLookup(() => pending.promise);
  let schoolCode = 'sch-1';
  let appliedSchool = null;
  const request = lookup.lookup({ schoolCode }, {
    isCurrent: () => schoolCode === 'sch-1',
    apply() { appliedSchool = schoolCode; }
  });
  schoolCode = 'sch-2';
  lookup.invalidate();
  pending.resolve({ counts: { grade1Students: 50 } });

  assert.deepEqual(await request, { applied: false });
  assert.equal(appliedSchool, null);
  assert.equal(schoolCode, 'sch-2');
});

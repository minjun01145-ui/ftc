import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeState } from '../js/presets.js';

test('불러온 데이터의 기존 ID를 유지하고 누락 필드를 기본값으로 보완한다', () => {
  const state = normalizeState({
    school: { name: '테스트중학교', grade2Students: '71' },
    projects: [{
      id: 'project-existing',
      title: '2026학년도 2학년 수학여행',
      expenses: [{ id: 'expense-existing', name: '차량비', planAmount: '9000000', calcMethod: 'sharedFixed' }]
    }]
  });

  assert.equal(state.school.name, '테스트중학교');
  assert.equal(state.school.grade2Students, 71);
  assert.equal(state.projects[0].id, 'project-existing');
  assert.equal(state.projects[0].expenses[0].id, 'expense-existing');
  assert.equal(state.projects[0].expenses[0].planAmount, 9000000);
  assert.equal(state.projects[0].educationSupport.vulnerableMode, 'full');
});

test('기존 취약계층 참가/불참 데이터에서 취약계층 전체 학생수를 보완한다', () => {
  const state = normalizeState({
    school: {},
    projects: [{
      title: '기존 사업',
      vulnerableParticipants: 17,
      vulnerableAbsent: 1
    }]
  });

  assert.equal(state.projects[0].vulnerableStudents, 18);
  assert.equal(state.projects[0].vulnerableParticipants, 17);
});

test('취약계층 전체 학생수와 불참자수에서 실제 참가 취약계층을 계산한다', () => {
  const state = normalizeState({
    school: {},
    projects: [{
      title: '새 사업',
      vulnerableStudents: 18,
      vulnerableAbsent: 2
    }]
  });

  assert.equal(state.projects[0].vulnerableStudents, 18);
  assert.equal(state.projects[0].vulnerableParticipants, 16);
});

test('기존 비용 데이터는 학생용으로 유지하고 인솔자용 배열을 기본 생성한다', () => {
  const state = normalizeState({
    school: {},
    projects: [{
      title: '기존 사업',
      expenses: [{ id: 'student-expense', name: '식비', unitAmount: 10000 }]
    }]
  });

  assert.equal(state.schemaVersion, 3);
  assert.equal(state.projects[0].expenses.length, 1);
  assert.equal(state.projects[0].expenses[0].id, 'student-expense');
  assert.deepEqual(state.projects[0].staffExpenses, []);
});

test('체험처 세부정보와 인솔자용 비용을 정규화한다', () => {
  const state = normalizeState({
    school: {},
    projects: [{
      title: '세부정보 사업',
      expenses: [{
        id: 'student-detail',
        name: '공연장',
        details: { arrivalTime: '13:00', departureTime: '15:00', address: '서울시 예시로 1', contact: '02-1234-5678' }
      }],
      staffExpenses: [{ id: 'staff-detail', name: '공연장' }]
    }]
  });

  assert.equal(state.projects[0].expenses[0].details.address, '서울시 예시로 1');
  assert.equal(state.projects[0].expenses[0].details.contact, '02-1234-5678');
  assert.equal(state.projects[0].staffExpenses[0].id, 'staff-detail');
  assert.deepEqual(state.projects[0].staffExpenses[0].details, {
    arrivalTime: '', departureTime: '', address: '', contact: ''
  });
});

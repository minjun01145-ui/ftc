import { uid } from './utils.js';

export function createProject(title = '새 사업') {
  return {
    id: uid('project'),
    title,
    startDate: '',
    endDate: '',
    totalStudents: 0,
    actualParticipants: 0,
    absentStudents: 0,
    vulnerableParticipants: 0,
    vulnerableAbsent: 0,
    chaperones: 0,
    educationSupport: {
      regularPerPerson: 0,
      vulnerableMode: 'full',
      vulnerablePerPerson: 0,
      grantTotal: null
    },
    schoolSupport: {
      mode: 'total',
      amount: 0
    },
    expenses: [],
    memo: ''
  };
}

export const defaultState = {
  schemaVersion: 2,
  school: {
    name: '',
    homepage: '',
    schoolYear: new Date().getFullYear(),
    grade1Students: 0,
    grade2Students: 0,
    grade3Students: 0
  },
  projects: []
};

export function sampleProject() {
  const p = createProject('2026학년도 2학년 수학여행');
  Object.assign(p, {
    startDate: '2026-05-13',
    endDate: '2026-05-15',
    totalStudents: 71,
    actualParticipants: 70,
    absentStudents: 1,
    vulnerableParticipants: 17,
    vulnerableAbsent: 1,
    chaperones: 8,
    educationSupport: {
      regularPerPerson: 220000,
      vulnerableMode: 'full',
      vulnerablePerPerson: 0,
      grantTotal: 20360000
    },
    schoolSupport: { mode: 'perPersonRegular', amount: 32500 },
    expenses: [
      { id: uid('expense'), date: '2026-05-13', name: '차량비', calcMethod: 'sharedFixed', quantityBase: 'participantsPlusAbsent', customQuantity: 0, unitAmount: 0, planAmount: 9000000, actualAmount: 9000000, rounding: 'floor10', note: '' },
      { id: uid('expense'), date: '2026-05-13', name: '숙박비(2박)', calcMethod: 'perPerson', quantityBase: 'participantsPlusAbsent', customQuantity: 0, unitAmount: 70980, planAmount: 0, actualAmount: null, rounding: 'floor10', note: '' },
      { id: uid('expense'), date: '2026-05-13', name: '보험비', calcMethod: 'perPerson', quantityBase: 'participants', customQuantity: 0, unitAmount: 1600, planAmount: 0, actualAmount: null, rounding: 'floor10', note: '' },
      { id: uid('expense'), date: '2026-05-13', name: '롯데월드 자유이용권', calcMethod: 'perPerson', quantityBase: 'participants', customQuantity: 0, unitAmount: 30000, planAmount: 0, actualAmount: null, rounding: 'floor10', note: '' }
    ],
    memo: ''
  });
  return p;
}

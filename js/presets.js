import { clone, number, uid } from './utils.js';

export function createExpense(overrides = {}) {
  return {
    id: uid('expense'),
    date: '',
    name: '',
    calcMethod: 'perPerson',
    quantityBase: 'participants',
    customQuantity: 0,
    unitAmount: 0,
    planAmount: 0,
    actualAmount: null,
    rounding: 'floor10',
    note: '',
    ...overrides
  };
}

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

function normalizeExpense(expense) {
  const base = createExpense();
  const source = expense && typeof expense === 'object' ? expense : {};
  return {
    ...base,
    ...source,
    id: String(source.id || base.id),
    date: String(source.date ?? ''),
    name: String(source.name ?? ''),
    calcMethod: ['perPerson', 'fixedStudent', 'sharedFixed'].includes(source.calcMethod) ? source.calcMethod : 'perPerson',
    quantityBase: ['participants', 'participantsPlusAbsent', 'totalStudents', 'custom'].includes(source.quantityBase) ? source.quantityBase : 'participants',
    customQuantity: Math.max(0, number(source.customQuantity)),
    unitAmount: Math.max(0, number(source.unitAmount)),
    planAmount: Math.max(0, number(source.planAmount)),
    actualAmount: source.actualAmount === '' || source.actualAmount == null ? null : Math.max(0, number(source.actualAmount)),
    rounding: ['floor10', 'floor1', 'round10', 'round1'].includes(source.rounding) ? source.rounding : 'floor10',
    note: String(source.note ?? '')
  };
}

function normalizeProject(project) {
  const source = project && typeof project === 'object' ? project : {};
  const base = createProject(String(source.title ?? '새 사업'));
  return {
    ...base,
    ...source,
    id: String(source.id || base.id),
    title: String(source.title ?? base.title),
    startDate: String(source.startDate ?? ''),
    endDate: String(source.endDate ?? ''),
    totalStudents: Math.max(0, number(source.totalStudents)),
    actualParticipants: Math.max(0, number(source.actualParticipants)),
    absentStudents: Math.max(0, number(source.absentStudents)),
    vulnerableParticipants: Math.max(0, number(source.vulnerableParticipants)),
    vulnerableAbsent: Math.max(0, number(source.vulnerableAbsent)),
    chaperones: Math.max(0, number(source.chaperones)),
    educationSupport: {
      ...base.educationSupport,
      ...(source.educationSupport ?? {}),
      regularPerPerson: Math.max(0, number(source.educationSupport?.regularPerPerson)),
      vulnerableMode: source.educationSupport?.vulnerableMode === 'perPerson' ? 'perPerson' : 'full',
      vulnerablePerPerson: Math.max(0, number(source.educationSupport?.vulnerablePerPerson)),
      grantTotal: source.educationSupport?.grantTotal === '' || source.educationSupport?.grantTotal == null
        ? null
        : Math.max(0, number(source.educationSupport.grantTotal))
    },
    schoolSupport: {
      ...base.schoolSupport,
      ...(source.schoolSupport ?? {}),
      mode: source.schoolSupport?.mode === 'perPersonRegular' ? 'perPersonRegular' : 'total',
      amount: Math.max(0, number(source.schoolSupport?.amount))
    },
    expenses: Array.isArray(source.expenses) ? source.expenses.map(normalizeExpense) : [],
    memo: String(source.memo ?? '')
  };
}

export function normalizeState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const school = source.school && typeof source.school === 'object' ? source.school : {};
  return {
    schemaVersion: 2,
    school: {
      ...clone(defaultState.school),
      ...school,
      name: String(school.name ?? ''),
      homepage: String(school.homepage ?? ''),
      schoolYear: Math.max(0, number(school.schoolYear, new Date().getFullYear())),
      grade1Students: Math.max(0, number(school.grade1Students)),
      grade2Students: Math.max(0, number(school.grade2Students)),
      grade3Students: Math.max(0, number(school.grade3Students))
    },
    projects: Array.isArray(source.projects) ? source.projects.map(normalizeProject) : []
  };
}

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
      createExpense({ date: '2026-05-13', name: '차량비', calcMethod: 'sharedFixed', quantityBase: 'participantsPlusAbsent', planAmount: 9000000, actualAmount: 9000000 }),
      createExpense({ date: '2026-05-13', name: '숙박비(2박)', calcMethod: 'perPerson', quantityBase: 'participantsPlusAbsent', unitAmount: 70980 }),
      createExpense({ date: '2026-05-13', name: '보험비', calcMethod: 'perPerson', quantityBase: 'participants', unitAmount: 1600 }),
      createExpense({ date: '2026-05-13', name: '롯데월드 자유이용권', calcMethod: 'perPerson', quantityBase: 'participants', unitAmount: 30000 })
    ],
    memo: ''
  });
  return p;
}

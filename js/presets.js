import { createFixedCosts, normalizeFixedCosts } from './fixedCosts.js';
import { clone, number, uid } from './utils.js';

export function createExpense(overrides = {}) {
  return {
    id: uid('expense'),
    sourceScheduleItemId: null,
    date: '',
    name: '',
    calcMethod: 'perPerson',
    quantityBase: 'participants',
    customQuantity: 0,
    customCohorts: null,
    category: 'other',
    costOwner: 'student',
    unitAmount: 0,
    planAmount: 0,
    actualAmount: null,
    paidStaffCount: null,
    rounding: 'floor10',
    note: '',
    details: {
      arrivalTime: '',
      departureTime: '',
      address: '',
      contact: ''
    },
    ...overrides
  };
}

export function createFundingSource(overrides = {}) {
  const reportClass = overrides.reportClass ?? 'education';
  return {
    id: uid('funding'),
    name: '',
    reportClass: 'education',
    returnRequired: reportClass === 'education',
    issuedAmount: null,
    priority: 10,
    eligibleGroups: ['vulnerable', 'regular'],
    eligibleCategories: [],
    limits: { vulnerable: null, regular: 0, vulnerableAbsent: 0, regularAbsent: 0, unclassified: 0 },
    actualAmount: null,
    ...overrides
  };
}

export const FTC_SCHOOL_SCOPE = Object.freeze({ schoolLevel: '중', establishment: '공립' });

const attendanceFields = Object.freeze([
  'applicants', 'chaperones', 'vulnerableEnrolled', 'vulnerableNotApplied',
  'vulnerableDayAbsent', 'regularDayAbsent'
]);

const emptyAttendance = () => ({
  schema: 'core-v1',
  applicants: 0,
  chaperones: 0,
  vulnerableEnrolled: 0,
  vulnerableNotApplied: 0,
  vulnerableDayAbsent: 0,
  regularDayAbsent: 0
});

const emptyActualAttendance = () => ({
  schema: 'core-v1',
  ...Object.fromEntries(attendanceFields.map(key => [key, null]))
});

function createWorkflow() {
  return {
    attendance: emptyAttendance(),
    resources: [],
    manualAllocations: [],
    actual: {
      attendance: emptyActualAttendance(),
      refunds: {},
      resourceAmounts: {}
    },
    administrativeEntries: [],
    proposalReference: {
      documentLabel: '',
      bodyPerPerson: null,
      tablePerPerson: null,
      itemizedPerPerson: null,
      vehicleContractAmount: null,
      vehicleMultiplier: null,
      vehicleDenominator: null,
      vehicleQuotedUnit: null,
      memo: ''
    },
    confirmedPlan: null,
    confirmedPlans: [],
    activeConfirmedPlanId: null,
    planChangeReason: ''
  };
}

export function createTripScheduleItem(overrides = {}) {
  return {
    id: uid('schedule'),
    date: '',
    name: '',
    arrivalTime: '',
    departureTime: '',
    address: '',
    contact: '',
    ...overrides
  };
}

export function createProject(title = '새 사업') {
  return {
    id: uid('project'),
    title,
    grade: '',
    schoolLevel: FTC_SCHOOL_SCOPE.schoolLevel,
    establishment: FTC_SCHOOL_SCOPE.establishment,
    executionMode: '숙박형',
    place: '',
    days: 0,
    startDate: '',
    endDate: '',
    tripSchedule: {
      items: [],
      importedFrom: null
    },
    fixedCosts: createFixedCosts(),
    dayAbsentSharesCommonCost: false,
    totalStudents: 0,
    actualParticipants: 0,
    absentStudents: 0,
    vulnerableStudents: 0,
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
    staffExpenses: [],
    workflow: createWorkflow(),
    memo: ''
  };
}

export const defaultState = {
  schemaVersion: 6,
  school: {
    name: '',
    homepage: '',
    educationOffice: '',
    schoolCode: '',
    schoolRegionCode: '',
    schoolKindCode: '',
    schoolYear: new Date().getFullYear(),
    grade1Students: 0,
    grade2Students: 0,
    grade3Students: 0,
    annualSchoolBudget: 0,
    projectBudgets: {}
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
    sourceScheduleItemId: source.sourceScheduleItemId ? String(source.sourceScheduleItemId) : null,
    date: String(source.date ?? ''),
    name: String(source.name ?? ''),
    calcMethod: ['perPerson', 'fixedStudent', 'sharedFixed', 'quantity'].includes(source.calcMethod) ? source.calcMethod : 'perPerson',
    quantityBase: ['participants', 'participantsPlusAbsent', 'fixedCostAbsent', 'totalStudents', 'custom'].includes(source.quantityBase) ? source.quantityBase : 'participants',
    customQuantity: Math.max(0, number(source.customQuantity)),
    customCohorts: source.customCohorts && typeof source.customCohorts === 'object'
      ? Object.fromEntries(['vulnerable', 'regular', 'vulnerableAbsent', 'regularAbsent', 'unclassified'].map(key => [key, Math.max(0, number(source.customCohorts[key]))]))
      : null,
    category: ['vehicle', 'lodging', 'meal', 'ticket', 'insurance', 'culture', 'other'].includes(source.category) ? source.category : 'other',
    costOwner: ['student', 'staff', 'operation'].includes(source.costOwner) ? source.costOwner : 'student',
    unitAmount: Math.max(0, number(source.unitAmount)),
    planAmount: Math.max(0, number(source.planAmount)),
    actualAmount: source.actualAmount === '' || source.actualAmount == null ? null : Math.max(0, number(source.actualAmount)),
    paidStaffCount: source.paidStaffCount === '' || source.paidStaffCount == null ? null : Math.max(0, number(source.paidStaffCount)),
    rounding: ['floor10', 'floor1', 'round10', 'round1'].includes(source.rounding) ? source.rounding : 'floor10',
    note: String(source.note ?? ''),
    details: {
      arrivalTime: String(source.details?.arrivalTime ?? ''),
      departureTime: String(source.details?.departureTime ?? ''),
      address: String(source.details?.address ?? ''),
      contact: String(source.details?.contact ?? '')
    }
  };
}

const legacyAttendanceFields = Object.freeze([
  'enrolled', 'notApplied', 'preContractCanceled', 'postContractCanceled', 'dayAbsent',
  'chaperones', 'vulnerableEnrolled', 'vulnerableNotApplied', 'vulnerablePreContractCanceled',
  'vulnerablePostContractCanceled', 'vulnerableDayAbsent', 'fixedCostAbsent'
]);

function normalizeLegacyAttendance(value = {}) {
  const source = value && typeof value === 'object' ? value : {};
  return Object.fromEntries(legacyAttendanceFields.map(key => [key, Math.max(0, number(source[key]))]));
}

function normalizeAttendance(value, fallback = emptyAttendance()) {
  const source = value && typeof value === 'object' ? value : {};
  if (source.schema === 'core-v1') {
    return {
      schema: 'core-v1',
      ...Object.fromEntries(attendanceFields.map(key => [key,
        source[key] === '' || source[key] === null || source[key] === undefined
          ? number(fallback[key]) : number(source[key])
      ])),
      ...(source.legacyAttendance && typeof source.legacyAttendance === 'object'
        ? { legacyAttendance: normalizeLegacyAttendance(source.legacyAttendance) } : {})
    };
  }
  return {
    schema: 'legacy-v5',
    ...normalizeLegacyAttendance(Object.keys(source).length ? source : fallback)
  };
}

function normalizeActualAttendance(value) {
  const source = value && typeof value === 'object' ? value : {};
  if (source.schema === 'core-v1') {
    return {
      schema: 'core-v1',
      ...Object.fromEntries(attendanceFields.map(key => [key,
        source[key] === '' || source[key] === null || source[key] === undefined ? null : number(source[key])
      ])),
      ...(source.legacyAttendance && typeof source.legacyAttendance === 'object'
        ? { legacyAttendance: normalizeLegacyAttendance(source.legacyAttendance) } : {})
    };
  }
  if (!legacyAttendanceFields.some(key => Object.hasOwn(source, key))) return emptyActualAttendance();
  return {
    schema: 'legacy-v5',
    ...Object.fromEntries(legacyAttendanceFields.map(key => [key,
      source[key] === '' || source[key] === null || source[key] === undefined ? null : Math.max(0, number(source[key]))
    ]))
  };
}

function normalizeFundingSource(value) {
  const base = createFundingSource();
  const source = value && typeof value === 'object' ? value : {};
  const limits = { ...base.limits, ...(source.limits && typeof source.limits === 'object' ? source.limits : {}) };
  return {
    ...base,
    ...source,
    id: String(source.id || base.id),
    name: String(source.name ?? ''),
    reportClass: ['education', 'school', 'student', 'external'].includes(source.reportClass) ? source.reportClass : 'external',
    returnRequired: source.returnRequired === undefined
      ? source.reportClass === 'education' : Boolean(source.returnRequired),
    issuedAmount: source.issuedAmount === '' || source.issuedAmount == null ? null : Math.max(0, number(source.issuedAmount)),
    actualAmount: source.actualAmount === '' || source.actualAmount == null ? null : Math.max(0, number(source.actualAmount)),
    priority: number(source.priority, 10),
    eligibleGroups: Array.isArray(source.eligibleGroups) ? [...new Set(source.eligibleGroups.filter(group => ['vulnerable', 'regular', 'vulnerableAbsent', 'regularAbsent', 'unclassified'].includes(group)))] : [...base.eligibleGroups],
    eligibleCategories: Array.isArray(source.eligibleCategories) ? [...new Set(source.eligibleCategories.filter(category => ['vehicle', 'lodging', 'meal', 'ticket', 'insurance', 'culture', 'other'].includes(category)))] : [],
    limits: Object.fromEntries(['vulnerable', 'regular', 'vulnerableAbsent', 'regularAbsent', 'unclassified'].map(key => [
      key,
      limits[key] === '' || limits[key] == null ? null : Math.max(0, number(limits[key]))
    ]))
  };
}

function normalizeWorkflow(value, legacyProject) {
  const legacyAbsent = Math.max(0, number(legacyProject.absentStudents));
  const vulnerableAbsent = Math.max(0, number(legacyProject.vulnerableAbsent));
  const legacyAttendance = {
    ...emptyAttendance(),
    enrolled: Math.max(0, number(legacyProject.totalStudents)),
    postContractCanceled: legacyAbsent,
    chaperones: Math.max(0, number(legacyProject.chaperones)),
    vulnerableEnrolled: Math.max(0, number(legacyProject.vulnerableStudents)),
    vulnerablePostContractCanceled: vulnerableAbsent
  };
  const source = value && typeof value === 'object' ? value : {};
  const actual = source.actual && typeof source.actual === 'object' ? source.actual : {};
  const reference = source.proposalReference && typeof source.proposalReference === 'object' ? source.proposalReference : {};
  const optionalNumber = input => input === '' || input === null || input === undefined ? null : Math.max(0, number(input));
  const legacyResources = value ? [] : [
    createFundingSource({
      id: `education-${legacyProject.id || 'project'}`,
      name: '교육청 지원금',
      reportClass: 'education',
      issuedAmount: legacyProject.educationSupport?.grantTotal ?? null,
      eligibleGroups: ['vulnerable', 'regular', 'vulnerableAbsent'],
      limits: {
        vulnerable: legacyProject.educationSupport?.vulnerableMode === 'perPerson'
          ? number(legacyProject.educationSupport?.vulnerablePerPerson) : null,
        regular: number(legacyProject.educationSupport?.regularPerPerson),
        vulnerableAbsent: legacyProject.educationSupport?.vulnerableMode === 'perPerson'
          ? number(legacyProject.educationSupport?.vulnerablePerPerson) : null
      }
    }),
    createFundingSource({
      id: `school-${legacyProject.id || 'project'}`,
      name: '학교 자체지원금',
      reportClass: 'school',
      issuedAmount: legacyProject.schoolSupport?.mode === 'perPersonRegular' ? null : number(legacyProject.schoolSupport?.amount),
      eligibleGroups: ['regular'],
      limits: {
        regular: legacyProject.schoolSupport?.mode === 'perPersonRegular'
          ? number(legacyProject.schoolSupport?.amount) : null
      },
      priority: 20
    })
  ];
  const workflow = {
    ...createWorkflow(),
    ...source,
    attendance: normalizeAttendance(source.attendance, legacyAttendance),
    resources: Array.isArray(source.resources) ? source.resources.map(normalizeFundingSource) : legacyResources,
    manualAllocations: Array.isArray(source.manualAllocations) ? source.manualAllocations.map(item => ({
      id: String(item?.id || uid('allocation')),
      expenseId: String(item?.expenseId ?? ''),
      sourceId: String(item?.sourceId ?? ''),
      group: ['vulnerable', 'regular', 'vulnerableAbsent', 'regularAbsent', 'unclassified'].includes(item?.group) ? item.group : 'regular',
      amount: item?.amount === '' || item?.amount == null ? null : Math.max(0, number(item.amount)),
      reason: String(item?.reason ?? '')
    })) : [],
    actual: {
      ...createWorkflow().actual,
      ...actual,
      attendance: normalizeActualAttendance(actual.attendance),
      refunds: actual.refunds && typeof actual.refunds === 'object'
        ? Object.fromEntries(Object.entries(actual.refunds).map(([id, amount]) => [String(id), Math.max(0, number(amount))])) : {},
      resourceAmounts: actual.resourceAmounts && typeof actual.resourceAmounts === 'object'
        ? Object.fromEntries(Object.entries(actual.resourceAmounts).map(([id, amount]) => [String(id), amount === '' || amount == null ? null : Math.max(0, number(amount))])) : {}
    },
    administrativeEntries: Array.isArray(source.administrativeEntries) ? source.administrativeEntries.map(item => ({
      id: String(item?.id || uid('admin')),
      kind: ['commitment', 'payment', 'refund'].includes(item?.kind) ? item.kind : 'payment',
      date: String(item?.date ?? ''),
      vendor: String(item?.vendor ?? ''),
      sourceId: String(item?.sourceId ?? ''),
      expenseId: String(item?.expenseId ?? ''),
      amount: item?.amount === '' || item?.amount == null ? null : Math.max(0, number(item.amount)),
      document: String(item?.document ?? ''),
      memo: String(item?.memo ?? '')
    })) : [],
    proposalReference: {
      documentLabel: String(reference.documentLabel ?? ''),
      bodyPerPerson: optionalNumber(reference.bodyPerPerson),
      tablePerPerson: optionalNumber(reference.tablePerPerson),
      itemizedPerPerson: optionalNumber(reference.itemizedPerPerson),
      vehicleContractAmount: optionalNumber(reference.vehicleContractAmount),
      vehicleMultiplier: optionalNumber(reference.vehicleMultiplier),
      vehicleDenominator: optionalNumber(reference.vehicleDenominator),
      vehicleQuotedUnit: optionalNumber(reference.vehicleQuotedUnit),
      memo: String(reference.memo ?? '')
    },
    confirmedPlan: source.confirmedPlan && typeof source.confirmedPlan === 'object' ? clone(source.confirmedPlan) : null,
    confirmedPlans: Array.isArray(source.confirmedPlans) ? source.confirmedPlans.filter(item => item && typeof item === 'object').map(item => clone(item)) :
      (source.confirmedPlan && typeof source.confirmedPlan === 'object' ? [clone(source.confirmedPlan)] : []),
    activeConfirmedPlanId: String(source.activeConfirmedPlanId ?? source.confirmedPlan?.id ?? ''),
    planChangeReason: String(source.planChangeReason ?? '')
  };
  return workflow;
}

function normalizeTripScheduleItem(item) {
  const base = createTripScheduleItem();
  const source = item && typeof item === 'object' ? item : {};
  return {
    ...base,
    ...source,
    id: String(source.id || base.id),
    date: String(source.date ?? ''),
    name: String(source.name ?? ''),
    arrivalTime: String(source.arrivalTime ?? ''),
    departureTime: String(source.departureTime ?? ''),
    address: String(source.address ?? ''),
    contact: String(source.contact ?? '')
  };
}

function normalizeImportSource(value) {
  if (!value || typeof value !== 'object') return null;
  const importedAt = String(value.importedAt ?? '');
  if (!importedAt || Number.isNaN(Date.parse(importedAt))) return null;
  return { filename: String(value.filename ?? ''), importedAt };
}

function normalizeTripSchedule(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    items: Array.isArray(source.items) ? source.items.map(normalizeTripScheduleItem) : [],
    importedFrom: normalizeImportSource(source.importedFrom)
  };
}

function normalizeProject(project) {
  const source = project && typeof project === 'object' ? project : {};
  const base = createProject(String(source.title ?? '새 사업'));
  const vulnerableAbsent = Math.max(0, number(source.vulnerableAbsent));
  const vulnerableStudents = source.vulnerableStudents === undefined || source.vulnerableStudents === null
    ? Math.max(0, number(source.vulnerableParticipants) + vulnerableAbsent)
    : Math.max(0, number(source.vulnerableStudents));
  const vulnerableParticipants = source.vulnerableStudents === undefined || source.vulnerableStudents === null
    ? Math.max(0, number(source.vulnerableParticipants))
    : Math.max(0, vulnerableStudents - vulnerableAbsent);

  return {
    ...base,
    ...source,
    id: String(source.id || base.id),
    title: String(source.title ?? base.title),
    grade: source.grade === '' || source.grade == null ? '' : Math.max(1, Math.min(3, number(source.grade))),
    schoolLevel: String(source.schoolLevel ?? base.schoolLevel),
    establishment: String(source.establishment ?? base.establishment),
    executionMode: String(source.executionMode ?? base.executionMode),
    place: String(source.place ?? ''),
    days: Math.max(0, number(source.days)),
    startDate: String(source.startDate ?? ''),
    endDate: String(source.endDate ?? ''),
    tripSchedule: normalizeTripSchedule(source.tripSchedule),
    fixedCosts: normalizeFixedCosts(source.fixedCosts),
    dayAbsentSharesCommonCost: Boolean(source.dayAbsentSharesCommonCost),
    totalStudents: Math.max(0, number(source.totalStudents)),
    actualParticipants: Math.max(0, number(source.actualParticipants)),
    absentStudents: Math.max(0, number(source.absentStudents)),
    vulnerableStudents,
    vulnerableParticipants,
    vulnerableAbsent,
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
    staffExpenses: Array.isArray(source.staffExpenses) ? source.staffExpenses.map(normalizeExpense) : [],
    workflow: normalizeWorkflow(source.workflow, source),
    memo: String(source.memo ?? '')
  };
}

export function normalizeState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const school = source.school && typeof source.school === 'object' ? source.school : {};
  return {
    schemaVersion: 6,
    school: {
      ...clone(defaultState.school),
      ...school,
      name: String(school.name ?? ''),
      homepage: String(school.homepage ?? ''),
      educationOffice: String(school.educationOffice ?? ''),
      schoolCode: String(school.schoolCode ?? ''),
      schoolRegionCode: String(school.schoolRegionCode ?? ''),
      schoolKindCode: String(school.schoolKindCode ?? ''),
      schoolYear: Math.max(0, number(school.schoolYear, new Date().getFullYear())),
      grade1Students: Math.max(0, number(school.grade1Students)),
      grade2Students: Math.max(0, number(school.grade2Students)),
      grade3Students: Math.max(0, number(school.grade3Students)),
      annualSchoolBudget: Math.max(0, number(school.annualSchoolBudget)),
      projectBudgets: school.projectBudgets && typeof school.projectBudgets === 'object'
        ? Object.fromEntries(Object.entries(school.projectBudgets).map(([id, budget]) => [String(id), {
          amount: budget?.amount === '' || budget?.amount == null ? null : Math.max(0, number(budget.amount)),
          fixed: Boolean(budget?.fixed),
          targetBurden: budget?.targetBurden === '' || budget?.targetBurden == null ? null : Math.max(0, number(budget.targetBurden))
        }])) : {}
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
    vulnerableStudents: 18,
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

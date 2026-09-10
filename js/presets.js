export const cohortLabels = {
  regular: '비취약 참가학생',
  vulnerable: '취약계층 참가학생',
  absentRegular: '비취약 불참(고정비 발생)',
  absentVulnerable: '취약계층 불참(고정비 발생)'
};

export const defaultProject = {
  schemaVersion: 1,
  meta: {
    schoolName: '',
    schoolUrl: '',
    schoolYear: 2026,
    grade: 2,
    title: '2학년 수학여행',
    memo: '2026학년도 2학년 수학여행 산출 근거자료를 바탕으로 만든 예시입니다.'
  },
  participants: {
    regular: 53,
    vulnerable: 17,
    absentRegular: 0,
    absentVulnerable: 1,
    chaperones: 8
  },
  expenses: [
    {
      id: 'bus', name: '차량비', category: '교통', calcMode: 'sharedFixed', scope: 'fixedStudents',
      contractTotal: 9000000, rounding: 'floor10', actualContractTotal: null,
      note: '총 9,000,000원을 학생(고정비 대상)+인솔자로 분담. 학생 단가는 10원 미만 절사.'
    },
    {
      id: 'lodging', name: '숙박비(2박)', category: '숙박', calcMode: 'perPerson', scope: 'fixedStudents',
      unitAmount: 70980, actualUnitAmount: null, note: '불참 학생에게도 취소 불가 숙박비가 발생하는 예시'
    },
    {
      id: 'insurance', name: '보험비', category: '보험', calcMode: 'perPerson', scope: 'participants',
      unitAmount: 1600, actualUnitAmount: null, note: ''
    },
    {
      id: 'meal-day1', name: '1일차 롯데월드 밀쿠폰', category: '식비', calcMode: 'perPerson', scope: 'participants',
      unitAmount: 20000, actualUnitAmount: null, note: ''
    },
    {
      id: 'lotte', name: '1일차 롯데월드 자유이용권', category: '체험', calcMode: 'perPerson', scope: 'participants',
      unitAmount: 30000, actualUnitAmount: null, note: ''
    },
    {
      id: 'performance', name: '2일차 댄스뮤지컬 관람', category: '예술체험', calcMode: 'perPerson', scope: 'participants',
      unitAmount: 18000, actualUnitAmount: null, note: ''
    },
    {
      id: 'breakfast2', name: '2일차 파크텔 조식', category: '식비', calcMode: 'perPerson', scope: 'participants',
      unitAmount: 12000, actualUnitAmount: null, note: ''
    },
    {
      id: 'lunch2', name: '2일차 통인시장 중식', category: '식비', calcMode: 'perPerson', scope: 'participants',
      unitAmount: 10000, actualUnitAmount: null, note: ''
    },
    {
      id: 'dinner2', name: '2일차 파크텔 석식', category: '식비', calcMode: 'perPerson', scope: 'participants',
      unitAmount: 15000, actualUnitAmount: null, note: ''
    },
    {
      id: 'breakfast3', name: '3일차 파크텔 조식', category: '식비', calcMode: 'perPerson', scope: 'participants',
      unitAmount: 12000, actualUnitAmount: null, note: ''
    },
    {
      id: 'lunch3', name: '3일차 덕평휴게소 중식', category: '식비', calcMode: 'perPerson', scope: 'participants',
      unitAmount: 10000, actualUnitAmount: null, note: ''
    }
  ],
  fundAccounts: [
    { id: 'edu', name: '교육청 현장체험학습 지원금', type: 'subsidy', budgetAmount: 20360000, note: '교부액 입력 가능' },
    { id: 'art', name: '학교 예술문화체험활동비', type: 'school', budgetAmount: 954000, note: '' },
    { id: 'school', name: '학교 자체 현장체험학습비', type: 'school', budgetAmount: 1722500, note: '' },
    { id: 'student', name: '수익자부담금', type: 'student', budgetAmount: null, note: '잔여 비용을 비취약 참가학생에게 배분' }
  ],
  fundingRules: [
    {
      id: 'edu-vuln', accountId: 'edu', name: '취약계층 참가학생 실비 전액', kind: 'fullCost',
      targetCohorts: ['vulnerable'], unitAmount: 0,
      eligibleExpenseIds: ['bus','lodging','insurance','meal-day1','lotte','performance','breakfast2','lunch2','dinner2','breakfast3','lunch3']
    },
    {
      id: 'edu-regular', accountId: 'edu', name: '비취약 참가학생 1인 220,000원', kind: 'perCapita',
      targetCohorts: ['regular'], unitAmount: 220000,
      eligibleExpenseIds: ['bus','lodging','insurance','meal-day1','lotte']
    },
    {
      id: 'edu-absent', accountId: 'edu', name: '취약계층 불참학생 취소불가 고정비', kind: 'fullCost',
      targetCohorts: ['absentVulnerable'], unitAmount: 0,
      eligibleExpenseIds: ['bus','lodging']
    },
    {
      id: 'art-regular', accountId: 'art', name: '비취약 학생 공연비 지원', kind: 'perCapita',
      targetCohorts: ['regular'], unitAmount: 18000,
      eligibleExpenseIds: ['performance']
    },
    {
      id: 'school-regular', accountId: 'school', name: '비취약 학생 학교 자체 지원', kind: 'perCapita',
      targetCohorts: ['regular'], unitAmount: 32500,
      eligibleExpenseIds: ['lotte','breakfast2','lunch2']
    },
    {
      id: 'student-regular', accountId: 'student', name: '비취약 학생 실부담', kind: 'residual',
      targetCohorts: ['regular'], unitAmount: 0,
      eligibleExpenseIds: ['bus','lodging','insurance','meal-day1','lotte','performance','breakfast2','lunch2','dinner2','breakfast3','lunch3']
    }
  ]
};

import { projectCounts } from './engine.js';
import { normalizeFixedCosts } from './fixedCosts.js';

/**
 * 다른 학년과 함께 계산하는 기타비(버스비 등).
 *
 * 기타비 항목의 sharedProjectIds에 함께 탈 사업을 적어 두면, 그 사업들의 인원을 더해 sharedPeople로 둔다.
 * 연결한 사업의 인원을 고치면 저장할 때마다 다시 세므로 자동으로 따라온다.
 * 연결은 양쪽에 걸린다: 3학년에서 1학년과 함께 계산하면 1학년의 같은 항목도 3학년과 함께 계산하고 계약액을 맞춘다.
 * 인원은 그 사업의 같은 항목 설정을 따른다(인솔자도 함께 부담이면 인솔자, 공통비이고
 * 신청 후 불참자 공통비 부담이면 신청 후 불참자도 센다).
 */
function sameEntry(entry, target) {
  return target.builtin ? entry.builtin === target.builtin : entry.label === target.label;
}

/** 한 사업에서 이 기타비를 함께 부담할 인원. */
export function sharedPeopleOf(project, target) {
  const settings = normalizeFixedCosts(project.fixedCosts).find(entry => sameEntry(entry, target)) ?? target;
  const c = projectCounts(project);
  const absent = settings.commonCost && project.dayAbsentSharesCommonCost ? c.contractedAbsent : 0;
  const chaperones = settings.includeChaperones ? c.chaperones : 0;
  const parts = [`학생 ${c.participants}명`];
  if (absent > 0) parts.push(`신청 후 불참 ${absent}명`);
  if (chaperones > 0) parts.push(`인솔자 ${chaperones}명`);
  return { id: project.id, title: project.title, people: c.participants + absent + chaperones, detail: parts.join(' + ') };
}

export function sharedNoteText(linked) {
  return linked.map(item => `${item.title} ${item.people}명`).join(', ');
}

/** 연결한 사업의 현재 인원으로 모든 사업의 sharedPeople·sharedNote를 다시 채운다. 없어진 사업은 연결에서 뺀다. */
export function syncSharedCounts(state) {
  const byId = new Map(state.projects.map(project => [project.id, project]));
  const projects = state.projects.map(project => {
    const entries = normalizeFixedCosts(project.fixedCosts);
    const wasLinked = entry => entry.sharedProjectIds.length || entry.sharedTitles.length;
    if (!entries.some(wasLinked)) return project;
    const fixedCosts = entries.map(entry => {
      if (!wasLinked(entry)) return entry;
      // 상대 사업에서 연결을 풀었으면 더했던 인원도 뺀다(직접 입력한 인원은 sharedTitles가 없어 그대로 둔다).
      if (!entry.sharedProjectIds.length) return { ...entry, sharedPeople: 0, sharedNote: '', sharedTitles: [] };
      const linked = entry.sharedProjectIds
        .filter(id => id !== project.id && byId.has(id))
        .map(id => sharedPeopleOf(byId.get(id), entry));
      return {
        ...entry,
        sharedProjectIds: linked.map(item => item.id),
        sharedPeople: linked.reduce((sum, item) => sum + item.people, 0),
        sharedNote: sharedNoteText(linked),
        sharedTitles: linked.map(item => item.title)
      };
    });
    return { ...project, fixedCosts };
  });
  return { ...state, projects };
}

function withEntry(project, target, change) {
  const entries = normalizeFixedCosts(project.fixedCosts);
  const index = entries.findIndex(entry => sameEntry(entry, target));
  if (index < 0) {
    // 사용자가 추가한 항목이 상대 사업에 없으면 같은 이름으로 만든다.
    return { ...project, fixedCosts: [...entries, change({ id: `${target.id}-${project.id}`.slice(0, 60), builtin: null, label: target.label, memo: '', sharedProjectIds: [] })] };
  }
  return { ...project, fixedCosts: entries.map((entry, i) => (i === index ? change(entry) : entry)) };
}

/**
 * 사업 하나를 저장할 때 '함께 계산' 연결을 상대 사업에도 걸거나 푼다.
 * - 연결한 사업들: 같은 항목을 전체 계약액으로 바꾸고 계약액·1원 단위 버림을 맞추고, 서로를 연결한다.
 * - 연결에서 뺀 사업: 이 묶음과의 연결을 푼다.
 */
export function propagateSharedLinks(projects, previousProject, nextProject) {
  const previous = normalizeFixedCosts(previousProject?.fixedCosts);
  let result = projects.map(project => (project.id === nextProject.id ? nextProject : project));

  for (const entry of normalizeFixedCosts(nextProject.fixedCosts)) {
    const before = previous.find(item => item.id === entry.id);
    const linkedIds = entry.mode === 'total' ? entry.sharedProjectIds.filter(id => id !== nextProject.id) : [];
    const group = new Set([nextProject.id, ...linkedIds]);
    const removed = (before?.sharedProjectIds ?? []).filter(id => !group.has(id));
    if (!linkedIds.length && !removed.length) continue;

    result = result.map(project => {
      if (linkedIds.includes(project.id)) {
        return withEntry(project, entry, target => ({
          ...target,
          mode: 'total',
          amount: entry.amount,
          roundTo10: entry.roundTo10,
          headcount: null,
          sharedProjectIds: [...group].filter(id => id !== project.id)
        }));
      }
      if (removed.includes(project.id)) {
        return withEntry(project, entry, target => ({
          ...target,
          sharedProjectIds: target.sharedProjectIds.filter(id => !group.has(id) && id !== nextProject.id)
        }));
      }
      return project;
    });
  }
  return result;
}

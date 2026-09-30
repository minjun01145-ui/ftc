/** 사업을 고르기 전 첫 화면 */
export function renderHomePage(projects = []) {
  const hint = projects.length
    ? '왼쪽 내 사업에서 사업을 선택하세요.'
    : '왼쪽 내 사업의 + 버튼으로 사업을 추가하세요.';
  return `
    <h1>현장체험학습 비용 관리</h1>
    <p class="home-hint">${hint}</p>`;
}

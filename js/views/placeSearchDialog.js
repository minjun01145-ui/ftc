import { escapeHtml } from '../utils.js';

function dialogHtml() {
  return `
    <form method="dialog" class="place-search-form">
      <h2>장소 검색</h2>
      <div class="place-search-controls">
        <input type="search" name="query" aria-label="장소 이름 또는 주소" placeholder="체험처 이름 또는 주소" autocomplete="off">
        <button type="button" data-place-search-submit>검색</button>
      </div>
      <p class="help" data-place-search-status role="status" aria-live="polite"></p>
      <ul class="place-search-results" data-place-search-results></ul>
      <div class="place-search-actions"><button value="cancel">닫기</button></div>
    </form>`;
}

function resultHtml(place, index) {
  const address = place.roadAddress || place.address;
  return `
    <li>
      <button type="button" class="place-search-result" data-place-index="${index}">
        <strong>${escapeHtml(place.name)}</strong>
        <small>${escapeHtml(address)}${place.phone ? ` · ${escapeHtml(place.phone)}` : ''}</small>
      </button>
    </li>`;
}

/**
 * 장소 검색 대화상자를 열고, 사용자가 고른 장소를 돌려준다(닫으면 null).
 * 검색 방법은 search(query) → Promise<place[]> 로 주입받아 카카오 SDK와 분리한다.
 */
export function openPlaceSearchDialog({ initialQuery = '', search }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'place-search-dialog';
  dialog.innerHTML = dialogHtml();
  document.body.append(dialog);

  const queryInput = dialog.querySelector('[name="query"]');
  const status = dialog.querySelector('[data-place-search-status]');
  const list = dialog.querySelector('[data-place-search-results]');
  let places = [];
  let requestId = 0;

  async function runSearch() {
    const query = queryInput.value.trim();
    if (!query) {
      status.textContent = '검색어를 입력해 주세요.';
      return;
    }
    const currentRequest = ++requestId;
    status.textContent = '검색 중...';
    list.innerHTML = '';
    try {
      const results = await search(query);
      if (currentRequest !== requestId) return;
      places = results;
      list.innerHTML = results.map(resultHtml).join('');
      status.textContent = results.length ? '주소를 넣을 장소를 선택하세요.' : '검색 결과가 없습니다.';
    } catch (error) {
      if (currentRequest !== requestId) return;
      status.textContent = error.message;
    }
  }

  return new Promise(resolve => {
    let selected = null;
    dialog.addEventListener('click', event => {
      if (event.target.closest('[data-place-search-submit]')) {
        void runSearch();
        return;
      }
      const result = event.target.closest('[data-place-index]');
      if (result) {
        selected = places[Number(result.dataset.placeIndex)] ?? null;
        dialog.close();
      }
    });
    queryInput.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      void runSearch();
    });
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(selected);
    });

    queryInput.value = initialQuery;
    dialog.showModal();
    if (initialQuery.trim()) void runSearch();
  });
}

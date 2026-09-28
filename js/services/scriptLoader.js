/** <script> 태그로 외부 스크립트를 불러온다. 같은 주소는 한 번만 불러온다. */
const loaded = new Map();

export function loadScript(src) {
  if (!loaded.has(src)) {
    loaded.set(src, new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        loaded.delete(src);
        reject(new Error(`스크립트를 불러오지 못했습니다: ${src}`));
      };
      document.head.append(script);
    }));
  }
  return loaded.get(src);
}

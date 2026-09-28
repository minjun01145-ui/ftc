/**
 * PDF에서 읽은 글자 조각(text, x, y)을 다루는 도우미.
 * PDF 좌표는 아래쪽이 y=0이므로, y가 클수록 페이지 위쪽이다.
 */
const SAME_LINE = 3;

/** 같은 높이(±3)의 조각을 한 줄로 묶고, 줄은 위→아래, 조각은 왼쪽→오른쪽으로 정렬한다. */
export function groupLines(items) {
  const sorted = [...items].sort((left, right) => right.y - left.y || left.x - right.x);
  const lines = [];
  for (const item of sorted) {
    const line = lines.find(candidate => Math.abs(candidate.y - item.y) <= SAME_LINE);
    if (line) line.items.push(item);
    else lines.push({ y: item.y, items: [item] });
  }
  for (const line of lines) line.items.sort((left, right) => left.x - right.x);
  return lines.sort((left, right) => right.y - left.y);
}

export function lineText(line) {
  return line.items.map(item => item.text).join(' ').replace(/\s+/g, ' ').trim();
}

/** 머리글 조각의 x 위치로 열 경계를 정한다. 이웃한 머리글 사이의 가운데가 경계다. */
export function columnFinder(columns) {
  const sorted = [...columns].sort((left, right) => left.x - right.x);
  return x => {
    for (let index = 0; index < sorted.length - 1; index += 1) {
      if (x < (sorted[index].x + sorted[index + 1].x) / 2) return sorted[index].key;
    }
    return sorted.at(-1)?.key ?? null;
  };
}

export function nearestBy(candidates, value, pick, maxDistance = Number.POSITIVE_INFINITY) {
  let best = null;
  let bestDistance = maxDistance;
  for (const candidate of candidates) {
    const distance = Math.abs(pick(candidate) - value);
    if (distance <= bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

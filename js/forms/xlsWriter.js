/**
 * 엑셀 97-2003 파일(.xls, BIFF8)을 만든다. 업무포털의 품목내역 업로드가 이 형식을 받는다.
 * 시트 하나에 글자와 숫자만 쓰는 최소 구현이다(서식·수식 없음).
 *
 * .xls는 두 겹이다.
 * 1) Workbook 스트림: BIFF8 레코드(머리 부분 + 시트 부분)
 * 2) 그 스트림을 담는 복합 문서(OLE2) 파일: 512바이트 섹터, FAT, 디렉터리.
 *    4096바이트보다 작은 스트림은 64바이트 미니 섹터(미니 스트림)에 넣어야 한다.
 */

class ByteWriter {
  constructor() {
    this.bytes = [];
  }

  u8(value) { this.bytes.push(value & 0xFF); return this; }
  u16(value) { return this.u8(value).u8(value >>> 8); }
  u32(value) { return this.u16(value & 0xFFFF).u16(value >>> 16); }
  i32(value) { return this.u32(value >>> 0); }
  f64(value) {
    const view = new DataView(new ArrayBuffer(8));
    view.setFloat64(0, value, true);
    for (let i = 0; i < 8; i += 1) this.u8(view.getUint8(i));
    return this;
  }
  utf16(text) {
    for (const char of String(text)) {
      const code = char.codePointAt(0);
      if (code > 0xFFFF) {
        const high = Math.floor((code - 0x10000) / 0x400) + 0xD800;
        const low = ((code - 0x10000) % 0x400) + 0xDC00;
        this.u16(high).u16(low);
      } else {
        this.u16(code);
      }
    }
    return this;
  }
  append(other) { this.bytes.push(...other.bytes); return this; }
  get length() { return this.bytes.length; }
}

const utf16Length = text => [...String(text)].reduce((sum, char) => sum + (char.codePointAt(0) > 0xFFFF ? 2 : 1), 0);

function record(type, body = new ByteWriter()) {
  if (body.length > 8224) throw new Error('엑셀 레코드가 너무 큽니다.');
  return new ByteWriter().u16(type).u16(body.length).append(body);
}

// 짧은 글자(시트 이름·글꼴 이름): 글자 수 1바이트 + 유니코드 표시 + UTF-16
const shortString = text => new ByteWriter().u8(utf16Length(text)).u8(1).utf16(text);
// 셀 글자(공유 문자열 표): 글자 수 2바이트 + 유니코드 표시 + UTF-16
const longString = text => new ByteWriter().u16(utf16Length(text)).u8(1).utf16(text);

function bof(type) {
  // BIFF8, 종류(0x0005 통합 문서 / 0x0010 워크시트), 빌드 정보
  return record(0x0809, new ByteWriter().u16(0x0600).u16(type).u16(0x0DBB).u16(0x07CC).u32(0x00000041).u32(0x00000006));
}

function font(name) {
  return record(0x0031, new ByteWriter().u16(200).u16(0).u16(0x7FFF).u16(400).u16(0).u8(0).u8(0).u8(0x81).u8(0).append(shortString(name)));
}

function xf(isStyle) {
  // 기본 서식. 스타일 XF 15개 + 셀 XF 1개(15번)가 있어야 엑셀이 연다.
  const flags = isStyle ? 0xFFF5 : 0x0001;
  const used = isStyle ? 0xF4 : 0x00;
  return record(0x00E0, new ByteWriter().u16(0).u16(0).u16(flags).u8(0x20).u8(0).u8(0).u8(used).u32(0).u32(0).u16(0x20C0));
}

function globals(sheetName, strings, sheetOffset) {
  const out = new ByteWriter();
  out.append(bof(0x0005));
  out.append(record(0x0042, new ByteWriter().u16(1200)));                       // CODEPAGE: UTF-16
  out.append(record(0x003D, new ByteWriter().u16(0).u16(0).u16(0x3A5C).u16(0x23BE).u16(0x0038).u16(0).u16(0).u16(1).u16(0x0258))); // WINDOW1
  for (let i = 0; i < 5; i += 1) out.append(font('맑은 고딕'));                  // 글꼴 0~3, 5(4번은 쓰지 않는 번호)
  for (let i = 0; i < 15; i += 1) out.append(xf(true));
  out.append(xf(false));
  out.append(record(0x0293, new ByteWriter().u16(0x8000).u8(0).u8(0xFF)));      // STYLE: 표준
  out.append(record(0x0085, new ByteWriter().u32(sheetOffset).u8(0).u8(0).append(shortString(sheetName)))); // BOUNDSHEET
  // 공유 문자열 표(SST). 레코드 하나는 8224바이트까지라, 넘치면 다음 글자부터 CONTINUE 레코드에 이어 쓴다.
  let chunk = new ByteWriter().u32(strings.total).u32(strings.list.length);
  let type = 0x00FC;
  for (const text of strings.list) {
    const encoded = longString(text);
    if (chunk.length + encoded.length > 8224) {
      out.append(record(type, chunk));
      chunk = new ByteWriter();
      type = 0x003C;
    }
    chunk.append(encoded);
  }
  out.append(record(type, chunk));
  out.append(record(0x000A));                                                   // EOF
  return out;
}

function sheet(rows, strings) {
  const out = new ByteWriter();
  const columns = Math.max(0, ...rows.map(row => row.length));
  out.append(bof(0x0010));
  out.append(record(0x0200, new ByteWriter().u32(0).u32(rows.length).u16(0).u16(columns).u16(0))); // DIMENSIONS
  out.append(record(0x023E, new ByteWriter().u16(0x06B6).u16(0).u16(0).u32(64).u16(0).u16(0).u32(0))); // WINDOW2
  rows.forEach((row, r) => row.forEach((value, c) => {
    if (value === null || value === undefined || value === '') return;
    if (typeof value === 'number') {
      out.append(record(0x0203, new ByteWriter().u16(r).u16(c).u16(15).f64(value)));          // NUMBER
    } else {
      out.append(record(0x00FD, new ByteWriter().u16(r).u16(c).u16(15).u32(strings.index.get(String(value))))); // LABELSST
    }
  }));
  out.append(record(0x000A));
  return out;
}

/** 시트 하나짜리 BIFF8 Workbook 스트림 */
export function workbookStream(sheetName, rows) {
  const strings = { list: [], index: new Map(), total: 0 };
  for (const row of rows) {
    for (const value of row) {
      if (typeof value !== 'string' || value === '') continue;
      strings.total += 1;
      if (!strings.index.has(value)) {
        strings.index.set(value, strings.list.length);
        strings.list.push(value);
      }
    }
  }
  const sheetOffset = globals(sheetName, strings, 0).length;
  return new ByteWriter().append(globals(sheetName, strings, sheetOffset)).append(sheet(rows, strings)).bytes;
}

/* ---------- 복합 문서(OLE2) ---------- */

const SECTOR = 512;
const MINI = 64;
const MINI_CUTOFF = 4096;
const FREE = -1;
const END = -2;
const FAT_SECTOR = -3;

function directoryEntry(name, type, { child = -1, start = END, size = 0 } = {}) {
  const out = new ByteWriter();
  const nameBytes = new ByteWriter().utf16(name).u16(0);
  out.append(nameBytes);
  while (out.length < 64) out.u8(0);
  out.u16(name ? nameBytes.length : 0).u8(type).u8(1);   // 이름 길이, 종류(5 루트, 2 스트림, 0 빈칸), 색(검정)
  out.i32(-1).i32(-1).i32(child);                        // 왼쪽·오른쪽 형제, 자식
  for (let i = 0; i < 16 + 4 + 16; i += 1) out.u8(0);   // CLSID, 상태, 만든·고친 시각
  out.i32(start).u32(size).u32(0);
  return out;
}

const pad = (bytes, unit) => {
  const copy = [...bytes];
  while (copy.length % unit) copy.push(0);
  return copy;
};

/** Workbook 스트림을 .xls 파일 바이트로 감싼다. */
export function compoundFile(stream) {
  const useMini = stream.length < MINI_CUTOFF;
  const data = useMini ? pad(pad(stream, MINI), SECTOR) : pad(stream, SECTOR);
  const dataSectors = data.length / SECTOR;
  const miniSectors = useMini ? Math.ceil(stream.length / MINI) : 0;
  const miniFatSectors = useMini ? Math.ceil(miniSectors / (SECTOR / 4)) : 0;

  // 섹터 순서: FAT들, 디렉터리 1개, 미니 FAT들, 데이터
  let fatSectors = 1;
  while (fatSectors * (SECTOR / 4) < fatSectors + 1 + miniFatSectors + dataSectors) fatSectors += 1;
  if (fatSectors > 109) throw new Error('파일이 너무 큽니다.');
  const dirSector = fatSectors;
  const miniFatStart = dirSector + 1;
  const dataStart = miniFatStart + miniFatSectors;
  const totalSectors = dataStart + dataSectors;

  const fat = new Array(fatSectors * (SECTOR / 4)).fill(FREE);
  for (let i = 0; i < fatSectors; i += 1) fat[i] = FAT_SECTOR;
  fat[dirSector] = END;
  const chain = (start, count) => {
    for (let i = 0; i < count; i += 1) fat[start + i] = i === count - 1 ? END : start + i + 1;
  };
  chain(miniFatStart, miniFatSectors);
  chain(dataStart, dataSectors);

  const header = new ByteWriter();
  [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1].forEach(byte => header.u8(byte));
  for (let i = 0; i < 16; i += 1) header.u8(0);
  header.u16(0x003E).u16(0x0003).u16(0xFFFE).u16(9).u16(6);
  for (let i = 0; i < 6; i += 1) header.u8(0);
  header.u32(0).u32(fatSectors).i32(dirSector).u32(0).u32(MINI_CUTOFF);
  header.i32(useMini ? miniFatStart : END).u32(miniFatSectors).i32(END).u32(0);
  for (let i = 0; i < 109; i += 1) header.i32(i < fatSectors ? i : FREE);

  const fatBytes = new ByteWriter();
  fat.forEach(value => fatBytes.i32(value));

  const directory = new ByteWriter()
    .append(directoryEntry('Root Entry', 5, { child: 1, start: useMini ? dataStart : END, size: useMini ? miniSectors * MINI : 0 }))
    .append(directoryEntry('Workbook', 2, { start: useMini ? 0 : dataStart, size: stream.length }))
    .append(directoryEntry('', 0))
    .append(directoryEntry('', 0));

  const miniFat = new ByteWriter();
  if (useMini) {
    const entries = new Array(miniFatSectors * (SECTOR / 4)).fill(FREE);
    for (let i = 0; i < miniSectors; i += 1) entries[i] = i === miniSectors - 1 ? END : i + 1;
    entries.forEach(value => miniFat.i32(value));
  }

  const bytes = new Uint8Array(SECTOR * (1 + totalSectors));
  bytes.set(header.bytes, 0);
  bytes.set(fatBytes.bytes, SECTOR);
  bytes.set(directory.bytes, SECTOR * (1 + dirSector));
  if (useMini) bytes.set(miniFat.bytes, SECTOR * (1 + miniFatStart));
  bytes.set(data, SECTOR * (1 + dataStart));
  return bytes;
}

/** rows: [[글자 또는 숫자, ...], ...] → .xls 파일 바이트 */
export function buildXls(sheetName, rows) {
  return compoundFile(workbookStream(sheetName, rows));
}

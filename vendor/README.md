# 외부 라이브러리

일정 문서를 **브라우저 안에서만** 읽기 위해 아래 오픈소스를 저장소에 함께 둡니다.
문서 내용은 외부 서버로 보내지 않습니다.

| 폴더 | 이름 | 버전 | 용도 | 라이선스 |
|---|---|---|---|---|
| `pdfjs/` | PDF.js (`pdfjs-dist`) | 6.3.289 | PDF에서 글자와 위치를 읽어 일정 표를 복원 | Apache License 2.0 (`pdfjs/LICENSE`) |
| `pdfjs/cmaps/` | PDF.js CMap | 6.3.289 | 한글 등 CID 글꼴 PDF의 글자 변환 | Apache License 2.0 |
| `jszip/` | JSZip | 3.10.2 | HWPX(압축 XML) 문서 열기 | MIT 또는 GPL-3.0 중 선택, 여기서는 MIT (`jszip/LICENSE.markdown`) |

갱신할 때는 npm 패키지 `pdfjs-dist`(`build/pdf.min.mjs`, `build/pdf.worker.min.mjs`, `cmaps/`)와 `jszip`(`dist/jszip.min.js`)의 같은 버전 파일을 그대로 복사합니다.

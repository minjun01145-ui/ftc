/**
 * 일정 문서 가져오기 방식.
 * - 'local' : 문서의 표·경로를 이 컴퓨터 안에서 직접 읽는다(외부 전송 없음). 기본값.
 * - 'ai'    : AI 서버(Firebase Functions)로 문서를 보내 분석한다. 교육청 승인 전에는 쓰지 않는다.
 */
export const SCHEDULE_IMPORT_ENGINE = 'local';

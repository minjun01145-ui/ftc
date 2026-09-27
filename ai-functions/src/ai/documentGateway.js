import { getCapability } from './capabilities/registry.js';
import { executeCapability } from './gateway.js';
import { extractDocumentText } from '../documents/extractText.js';
import { parseDocumentMultipartRequest } from '../security/documentMultipart.js';
import { DocumentRequestError, validateDocumentFile } from '../security/documentPolicy.js';

export async function executeDocumentRequest(req, { runtimeConfig, providerSecrets, providerInstance } = {}) {
  const request = await parseDocumentMultipartRequest(req);
  const capability = getCapability(request.capability);
  if (!capability) {
    return {
      status: 404,
      body: { ok: false, error: { code: 'CAPABILITY_NOT_AVAILABLE', message: '현재 사용할 수 없는 문서 기능입니다.' } }
    };
  }
  if (!capability.documentOnly) {
    return {
      status: 400,
      body: { ok: false, error: { code: 'CAPABILITY_TRANSPORT_MISMATCH', message: '문서 업로드 요청에 사용할 수 없는 기능입니다.' } }
    };
  }

  const file = validateDocumentFile(request.document);
  const documentText = await extractDocumentText(file);
  const payload = {
    filename: file.filename,
    documentText,
    projectTitle: safeContextValue(request.payload.projectTitle, 200),
    schoolYear: safeContextValue(request.payload.schoolYear, 4),
    startDate: safeContextValue(request.payload.startDate, 10),
    endDate: safeContextValue(request.payload.endDate, 10)
  };
  return executeCapability({
    capabilityId: request.capability,
    payload,
    runtimeConfig,
    providerSecrets,
    documentRequest: true,
    providerInstance
  });
}

function safeContextValue(value, maximum) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : '';
}

export { DocumentRequestError };

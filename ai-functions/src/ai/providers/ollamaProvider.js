import { assertAiProvider } from '../providerContract.js';

const DEFAULT_BASE_URL = 'https://ollama.com/api';

/**
 * Ollama Cloud 전용 구현체.
 * 다른 모듈은 Ollama 요청/응답 형식을 알 필요가 없습니다.
 */
export function createOllamaProvider({ apiKey, baseUrl = DEFAULT_BASE_URL, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error('Ollama API 키가 설정되지 않았습니다.');
  const endpoint = `${String(baseUrl).replace(/\/+$/, '')}/chat`;

  return assertAiProvider({
    id: 'ollama',

    async generate({ model, messages, options = {} }) {
      if (!model) throw new Error('AI 모델이 설정되지 않았습니다.');

      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          options
        })
      });

      const body = await readJson(response);
      if (!response.ok) {
        const message = body?.error || body?.message || `Ollama 요청 실패 (${response.status})`;
        throw new Error(String(message));
      }

      return {
        text: String(body?.message?.content ?? ''),
        provider: 'ollama',
        model: String(body?.model ?? model),
        usage: extractUsage(body)
      };
    }
  });
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { message: text }; }
}

function extractUsage(body) {
  return {
    promptTokens: Number(body?.prompt_eval_count || 0),
    completionTokens: Number(body?.eval_count || 0)
  };
}

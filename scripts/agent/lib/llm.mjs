// Optional LLM adapter. Works with OpenAI-compatible endpoints and Azure OpenAI.
// If no API key is configured the agent skips this entirely (heuristic mode).
import { log } from './util.mjs';

export function llmEnabled(cfg) {
  return !!process.env[cfg.llm.apiKeyEnv];
}

function isAzure(endpoint) {
  return /openai\.azure\.com/i.test(endpoint || '');
}

// Returns parsed JSON from the model, or null on any failure (agent degrades gracefully).
export async function llmJson(cfg, system, user) {
  const apiKey = process.env[cfg.llm.apiKeyEnv];
  const endpoint = process.env[cfg.llm.endpointEnv];
  const model = process.env[cfg.llm.modelEnv] || 'gpt-4o-mini';
  if (!apiKey || !endpoint) return null;

  const azure = isAzure(endpoint);
  const url = azure
    ? `${endpoint.replace(/\/$/, '')}/openai/deployments/${model}/chat/completions?api-version=2024-08-01-preview`
    : `${endpoint.replace(/\/$/, '')}/chat/completions`;

  const headers = azure
    ? { 'Content-Type': 'application/json', 'api-key': apiKey }
    : { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };

  const body = {
    ...(azure ? {} : { model }),
    temperature: cfg.llm.temperature,
    max_tokens: cfg.llm.maxOutputTokens,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  };

  try {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!res.ok) { log('LLM error', res.status, (await res.text()).slice(0, 300)); return null; }
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    const usage = json.usage || {};
    log(`LLM ok (in=${usage.prompt_tokens ?? '?'} out=${usage.completion_tokens ?? '?'} tokens)`);
    return { data: JSON.parse(content), usage };
  } catch (e) {
    log('LLM call failed:', e.message);
    return null;
  }
}

// Provider registry for the optional import categorizer LLM. Users bring their
// own API keys. Almost every hosted provider speaks the OpenAI chat-completions
// protocol, so most entries share one code path; Anthropic (Claude) and Ollama
// have their own. Add a provider by adding a row here.

export type LlmApi = 'openai' | 'anthropic' | 'ollama'

export interface LlmProvider {
  key: string
  label: string
  group: 'Frontier' | 'Cloud & aggregators' | 'NVIDIA' | 'Local' | 'Custom'
  api: LlmApi
  baseUrl: string
  needsKey: boolean
  defaultModel: string
  keyUrl?: string
}

export const LLM_PROVIDERS: LlmProvider[] = [
  // Frontier
  { key: 'openai', label: 'OpenAI', group: 'Frontier', api: 'openai', baseUrl: 'https://api.openai.com/v1', needsKey: true, defaultModel: 'gpt-4o-mini', keyUrl: 'https://platform.openai.com/api-keys' },
  { key: 'anthropic', label: 'Anthropic (Claude)', group: 'Frontier', api: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', needsKey: true, defaultModel: 'claude-3-5-haiku-latest', keyUrl: 'https://console.anthropic.com/settings/keys' },
  { key: 'gemini', label: 'Google Gemini', group: 'Frontier', api: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', needsKey: true, defaultModel: 'gemini-2.0-flash', keyUrl: 'https://aistudio.google.com/apikey' },
  { key: 'xai', label: 'xAI (Grok)', group: 'Frontier', api: 'openai', baseUrl: 'https://api.x.ai/v1', needsKey: true, defaultModel: 'grok-2-latest', keyUrl: 'https://console.x.ai' },
  { key: 'deepseek', label: 'DeepSeek', group: 'Frontier', api: 'openai', baseUrl: 'https://api.deepseek.com/v1', needsKey: true, defaultModel: 'deepseek-chat', keyUrl: 'https://platform.deepseek.com/api_keys' },
  { key: 'mistral', label: 'Mistral', group: 'Frontier', api: 'openai', baseUrl: 'https://api.mistral.ai/v1', needsKey: true, defaultModel: 'mistral-small-latest', keyUrl: 'https://console.mistral.ai/api-keys' },

  // Cloud & aggregators (open-source model hosting)
  { key: 'openrouter', label: 'OpenRouter', group: 'Cloud & aggregators', api: 'openai', baseUrl: 'https://openrouter.ai/api/v1', needsKey: true, defaultModel: 'meta-llama/llama-3.3-70b-instruct', keyUrl: 'https://openrouter.ai/keys' },
  { key: 'groq', label: 'Groq', group: 'Cloud & aggregators', api: 'openai', baseUrl: 'https://api.groq.com/openai/v1', needsKey: true, defaultModel: 'llama-3.3-70b-versatile', keyUrl: 'https://console.groq.com/keys' },
  { key: 'together', label: 'Together AI', group: 'Cloud & aggregators', api: 'openai', baseUrl: 'https://api.together.xyz/v1', needsKey: true, defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', keyUrl: 'https://api.together.ai/settings/api-keys' },
  { key: 'fireworks', label: 'Fireworks AI', group: 'Cloud & aggregators', api: 'openai', baseUrl: 'https://api.fireworks.ai/inference/v1', needsKey: true, defaultModel: 'accounts/fireworks/models/llama-v3p3-70b-instruct', keyUrl: 'https://fireworks.ai/account/api-keys' },
  { key: 'perplexity', label: 'Perplexity', group: 'Cloud & aggregators', api: 'openai', baseUrl: 'https://api.perplexity.ai', needsKey: true, defaultModel: 'sonar', keyUrl: 'https://www.perplexity.ai/settings/api' },

  // NVIDIA
  { key: 'nvidia', label: 'NVIDIA NIM', group: 'NVIDIA', api: 'openai', baseUrl: 'https://integrate.api.nvidia.com/v1', needsKey: true, defaultModel: 'meta/llama-3.1-8b-instruct', keyUrl: 'https://build.nvidia.com' },

  // Local / open source (no key needed)
  { key: 'ollama', label: 'Ollama', group: 'Local', api: 'ollama', baseUrl: 'http://localhost:11434', needsKey: false, defaultModel: 'llama3.2' },
  { key: 'lmstudio', label: 'LM Studio', group: 'Local', api: 'openai', baseUrl: 'http://localhost:1234/v1', needsKey: false, defaultModel: 'local-model' },
  { key: 'jan', label: 'Jan', group: 'Local', api: 'openai', baseUrl: 'http://localhost:1337/v1', needsKey: false, defaultModel: 'local-model' },
  { key: 'llamacpp', label: 'llama.cpp server', group: 'Local', api: 'openai', baseUrl: 'http://localhost:8080/v1', needsKey: false, defaultModel: 'local-model' },
  { key: 'vllm', label: 'vLLM', group: 'Local', api: 'openai', baseUrl: 'http://localhost:8000/v1', needsKey: false, defaultModel: 'local-model' },
  { key: 'gpt4all', label: 'GPT4All', group: 'Local', api: 'openai', baseUrl: 'http://localhost:4891/v1', needsKey: false, defaultModel: 'local-model' },

  // Custom
  { key: 'custom', label: 'Custom (OpenAI-compatible)', group: 'Custom', api: 'openai', baseUrl: '', needsKey: false, defaultModel: '' },
  { key: 'custom_anthropic', label: 'Custom (Anthropic-compatible)', group: 'Custom', api: 'anthropic', baseUrl: '', needsKey: true, defaultModel: '' },
]

const byKey = new Map(LLM_PROVIDERS.map((p) => [p.key, p]))

export function llmProvider(key?: string): LlmProvider | undefined {
  if (!key) return undefined
  // Legacy values from older configs.
  if (key === 'none') return undefined
  return byKey.get(key)
}

export interface ResolvedLlm {
  api: LlmApi
  baseUrl: string
  model: string
  apiKey?: string
  needsKey: boolean
}

/** Merge a stored config with its provider defaults. Tolerant of legacy configs. */
export function resolveLlm(cfg?: { provider?: string; api?: LlmApi; baseUrl?: string; model?: string; apiKey?: string }): ResolvedLlm | null {
  if (!cfg || !cfg.provider || cfg.provider === 'none') return null
  const p = byKey.get(cfg.provider)
  // Legacy: older builds stored provider 'openai'/'ollama' as a protocol.
  const api: LlmApi = p?.api ?? cfg.api ?? (cfg.provider === 'ollama' ? 'ollama' : 'openai')
  const baseUrl = (cfg.baseUrl || p?.baseUrl || '').replace(/\/$/, '')
  const model = cfg.model || p?.defaultModel || ''
  const needsKey = p?.needsKey ?? api === 'anthropic'
  return { api, baseUrl, model, apiKey: cfg.apiKey, needsKey }
}

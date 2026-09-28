// Optional LLM assist for the rows the heuristics were unsure about. Supports any
// provider in lib/llmProviders: frontier (OpenAI, Anthropic, Gemini, xAI,
// DeepSeek, Mistral), aggregators (OpenRouter, Groq, Together, Fireworks,
// Perplexity), NVIDIA NIM, and local servers (Ollama, LM Studio, Jan, llama.cpp,
// vLLM, GPT4All), plus custom endpoints. Users bring their own keys. Never
// required and never called unless the user configures a provider and asks.

import type { LlmConfig, Store } from '../types'
import type { CategorizedRow } from './types'
import { resolveLlm } from '../llmProviders'
import type { ResolvedLlm } from '../llmProviders'

export function llmConfigured(cfg?: LlmConfig): boolean {
  const r = resolveLlm(cfg)
  if (!r) return false
  if (!r.baseUrl || !r.model) return false
  return r.needsKey ? !!r.apiKey : true
}

async function send(method: string, url: string, headers: Record<string, string>, body?: string): Promise<{ ok: boolean; status: number; body: string }> {
  // Transports, in order: Electron main-process proxy, Vite dev proxy (browser
  // preview), then plain fetch. On mobile, CapacitorHttp patches fetch to go
  // native, so plain fetch already bypasses CORS there.
  const bridge = window.fathom
  if (bridge?.llmFetch) return bridge.llmFetch({ url, method, headers, body })
  if (import.meta.env.DEV) {
    const res = await fetch('/__llm/fetch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, method, headers, body }) })
    return res.json()
  }
  const res = await fetch(url, { method, headers, body })
  return { ok: res.ok, status: res.status, body: await res.text() }
}

/** Reject if `p` has not settled within `ms`, so a slow/hung provider never wedges the UI. */
function withTimeout<T>(p: Promise<T>, ms: number, label = 'The AI request'): Promise<T> {
  let timer: ReturnType<typeof setTimeout>
  const timeout = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error(`${label} timed out after ${Math.round(ms / 1000)}s. The model may be slow or overloaded, try again or pick a faster model.`)), ms)
  })
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer))
}

/**
 * Turn a provider's raw HTTP error into something a person can act on. Aggregators
 * answer 404 for models the account cannot call, which reads as a mystery otherwise.
 */
function friendlyHttpError(status: number, body: string, model?: string): Error {
  const m = model ? `"${model}"` : 'that model'
  if (status === 404 || /not found for account/i.test(body)) {
    return new Error(`Your provider does not offer ${m} on this account (HTTP 404). Open Settings and run Auto-pick best, or choose a different model.`)
  }
  if (status === 401 || status === 403) return new Error(`Your provider rejected the API key (HTTP ${status}). Check the key in Settings.`)
  if (status === 429) return new Error('Rate limited by your provider (HTTP 429). Wait a moment and try again.')
  if (status >= 500) return new Error(`Your provider had a server error (HTTP ${status}). Try again shortly.`)
  return new Error(`Model HTTP ${status}: ${body.slice(0, 160)}`)
}

/** Remove reasoning wrappers and control tags some models emit around their answer. */
function stripThinking(s: string): string {
  return s
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<\|[^|]*\|>/g, '')
    .trim()
}

/**
 * First *balanced* JSON object in the text. A greedy `{[\s\S]*}` match swallows
 * everything up to the last brace, which breaks whenever a model adds commentary
 * containing braces after its JSON.
 */
function firstJsonObject(s: string): string | null {
  const start = s.indexOf('{')
  if (start < 0) return null
  let depth = 0
  let inString = false
  let escaped = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"') inString = true
    else if (ch === '{') depth++
    else if (ch === '}' && --depth === 0) return s.slice(start, i + 1)
  }
  return null
}

function extractJsonText(s: string): string {
  const t = stripThinking(s)
  try {
    JSON.parse(t)
    return t
  } catch {
    /* keep looking */
  }
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) {
    const inner = fenced[1].trim()
    try {
      JSON.parse(inner)
      return inner
    } catch {
      /* keep looking */
    }
  }
  const obj = firstJsonObject(t)
  if (obj) return obj
  throw new Error('Model did not return usable JSON')
}

const PROBE_PROMPT = 'Reply with only this JSON and nothing else: {"ok":true}'

export interface ProbeResult {
  /** The model answered with usable content. */
  ok: boolean
  /** The answer parsed as JSON with ok=true, so the model can be trusted for
   * structured tasks like statement categorization. */
  json: boolean
  reply: string
  error?: string
}

/**
 * The single definition of "this model works", shared by Auto-pick and the Test
 * button. Previously Auto-pick passed a model if the HTTP call merely succeeded
 * while Test demanded strict JSON, so a model could be reported "verified working"
 * and then immediately fail the Test with "Unexpected reply from model".
 */
async function probeModel(r: ResolvedLlm, timeoutMs: number): Promise<ProbeResult> {
  try {
    const raw = await withTimeout(callModel(r, PROBE_PROMPT, 512), timeoutMs)
    const reply = stripThinking(raw ?? '')
    if (!reply) return { ok: false, json: false, reply: '', error: 'The model returned an empty reply.' }
    let json = false
    try {
      const parsed = JSON.parse(extractJsonText(reply)) as { ok?: unknown }
      json = parsed.ok === true || parsed.ok === 'true' || parsed.ok === 1
    } catch {
      json = false
    }
    return { ok: true, json, reply }
  } catch (e) {
    return { ok: false, json: false, reply: '', error: e instanceof Error ? e.message : String(e) }
  }
}

/** Send a prompt to the configured model and return its text reply. maxTokens is
 * generous so models (including reasoning models that spend tokens before the
 * answer) return a complete reply. */
async function callModel(r: ResolvedLlm, prompt: string, maxTokens = 2048): Promise<string> {
  if (r.api === 'ollama') {
    const res = await send(
      'POST',
      `${r.baseUrl}/api/chat`,
      { 'Content-Type': 'application/json' },
      JSON.stringify({ model: r.model, stream: false, format: 'json', options: { num_predict: maxTokens, num_ctx: 8192 }, messages: [{ role: 'user', content: prompt }] }),
    )
    if (!res.ok) throw friendlyHttpError(res.status, res.body, r.model)
    return (JSON.parse(res.body) as { message?: { content?: string } }).message?.content ?? ''
  }

  if (r.api === 'anthropic') {
    const res = await send('POST', `${r.baseUrl}/messages`, anthropicHeaders(r.apiKey), JSON.stringify({ model: r.model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }))
    if (!res.ok) throw friendlyHttpError(res.status, res.body, r.model)
    const json = JSON.parse(res.body) as { content?: { type: string; text?: string }[] }
    return json.content?.find((c) => c.type === 'text')?.text ?? ''
  }

  // openai-compatible
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (r.apiKey) headers.Authorization = `Bearer ${r.apiKey}`
  const base = { model: r.model, temperature: 0, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }
  let res = await send('POST', `${r.baseUrl}/chat/completions`, headers, JSON.stringify({ ...base, response_format: { type: 'json_object' } }))
  // Some endpoints reject response_format or max_tokens naming; retry progressively.
  if (!res.ok && (res.status === 400 || res.status === 404 || res.status === 422)) {
    res = await send('POST', `${r.baseUrl}/chat/completions`, headers, JSON.stringify(base))
  }
  if (!res.ok && (res.status === 400 || res.status === 422)) {
    // A few providers use max_completion_tokens instead of max_tokens.
    res = await send('POST', `${r.baseUrl}/chat/completions`, headers, JSON.stringify({ model: r.model, temperature: 0, max_completion_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }))
  }
  if (!res.ok) throw friendlyHttpError(res.status, res.body, r.model)
  return (JSON.parse(res.body) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? ''
}

function anthropicHeaders(apiKey?: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey ?? '',
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  }
}

// ---------- free-text chat (assistant) ----------

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * Multi-turn, free-text chat with the configured model (no JSON coercion). Used by
 * the AI assistant page and the fund-overlap explainer. System messages are folded
 * into the provider's system field where the protocol has one.
 */
export async function chatModel(cfg: LlmConfig | undefined, messages: ChatMsg[], maxTokens = 1024, timeoutMs = 90_000): Promise<string> {
  const r = resolveLlm(cfg)
  if (!r) throw new Error('No AI model configured. Add one in Settings.')
  if (!r.baseUrl || !r.model) throw new Error('The AI model is not fully configured. Finish setup in Settings.')
  if (r.needsKey && !r.apiKey) throw new Error('This provider needs an API key. Add it in Settings.')
  return withTimeout(chatOnce(r, normalizeTurns(messages), maxTokens), timeoutMs, 'The assistant')
}

/**
 * Anthropic (and some OpenAI-compatible gateways) require strictly alternating
 * user/assistant turns starting with a user turn. A failed request leaves the
 * unanswered question in the transcript, so the next send would carry two user
 * turns in a row. Merge consecutive same-role turns and drop any leading
 * assistant turn; system messages are left untouched for the caller to place.
 */
export function normalizeTurns(messages: ChatMsg[]): ChatMsg[] {
  const system = messages.filter((m) => m.role === 'system')
  const turns: ChatMsg[] = []
  for (const m of messages) {
    if (m.role === 'system') continue
    if (turns.length === 0 && m.role !== 'user') continue
    const last = turns[turns.length - 1]
    if (last && last.role === m.role) last.content = `${last.content}\n\n${m.content}`
    else turns.push({ role: m.role, content: m.content })
  }
  return [...system, ...turns]
}

async function chatOnce(r: ResolvedLlm, messages: ChatMsg[], maxTokens: number): Promise<string> {
  if (r.api === 'ollama') {
    const res = await send(
      'POST',
      `${r.baseUrl}/api/chat`,
      { 'Content-Type': 'application/json' },
      JSON.stringify({ model: r.model, stream: false, options: { num_predict: maxTokens, num_ctx: 8192 }, messages }),
    )
    if (!res.ok) throw friendlyHttpError(res.status, res.body, r.model)
    return (JSON.parse(res.body) as { message?: { content?: string } }).message?.content ?? ''
  }

  if (r.api === 'anthropic') {
    const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n')
    const turns = messages.filter((m) => m.role !== 'system').map((m) => ({ role: m.role, content: m.content }))
    const body: Record<string, unknown> = { model: r.model, max_tokens: maxTokens, messages: turns }
    if (system) body.system = system
    const res = await send('POST', `${r.baseUrl}/messages`, anthropicHeaders(r.apiKey), JSON.stringify(body))
    if (!res.ok) throw friendlyHttpError(res.status, res.body, r.model)
    const json = JSON.parse(res.body) as { content?: { type: string; text?: string }[] }
    return json.content?.find((c) => c.type === 'text')?.text ?? ''
  }

  // openai-compatible
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (r.apiKey) headers.Authorization = `Bearer ${r.apiKey}`
  const base = { model: r.model, temperature: 0.4, max_tokens: maxTokens, messages }
  let res = await send('POST', `${r.baseUrl}/chat/completions`, headers, JSON.stringify(base))
  if (!res.ok && (res.status === 400 || res.status === 422)) {
    res = await send('POST', `${r.baseUrl}/chat/completions`, headers, JSON.stringify({ model: r.model, temperature: 0.4, max_completion_tokens: maxTokens, messages }))
  }
  if (!res.ok) throw friendlyHttpError(res.status, res.body, r.model)
  return (JSON.parse(res.body) as { choices?: { message?: { content?: string } }[] }).choices?.[0]?.message?.content ?? ''
}

/** Send one prompt and parse the model's JSON reply (used by the fund-overlap analyzer). */
export async function promptJson<T>(cfg: LlmConfig | undefined, prompt: string, maxTokens = 2048, timeoutMs = 120_000): Promise<T> {
  const r = resolveLlm(cfg)
  if (!r) throw new Error('No AI model configured. Add one in Settings.')
  if (!r.baseUrl || !r.model) throw new Error('The AI model is not fully configured. Finish setup in Settings.')
  if (r.needsKey && !r.apiKey) throw new Error('This provider needs an API key. Add it in Settings.')
  const reply = await withTimeout(callModel(r, prompt, maxTokens), timeoutMs, 'The AI analysis')
  return JSON.parse(extractJsonText(reply)) as T
}

// ---------- model discovery + auto-pick ----------

/** Exclude non-chat models (embeddings, audio, image, safety) before ranking. */
const NON_CHAT =
  /embed|whisper|tts|audio|speech|image|dall|vision-?only|realtime|moderation|rerank|ranking|guard|safety|bge|clip|sdxl|stable-?diffusion|flux|codestral-embed|[-/]parse|parse[-/]|ocr|retriev|riva|asr|translate|depth|segment|detect|reward|classif/i

/**
 * Rank chat models for a cheap, fast classification task (statement categorizing):
 * prefer small/fast/latest, deprioritize big/expensive. Best first.
 */
export function rankModels(models: string[]): string[] {
  const seen = new Set<string>()
  const chat = models.filter((m) => m && !NON_CHAT.test(m) && !seen.has(m) && (seen.add(m), true))
  const score = (id: string): number => {
    const m = id.toLowerCase()
    let s = 0
    for (const [kw, w] of [
      ['flash-lite', 65], ['4o-mini', 62], ['4.1-mini', 62], ['4.1-nano', 64], ['mini', 48], ['nano', 52], ['flash', 50],
      ['haiku', 58], ['instant', 46], ['8b', 46], ['9b', 44], ['7b', 42], ['small', 42], ['lite', 40], ['scout', 34],
      ['turbo', 16], ['fast', 18], ['sonar', 12],
    ] as [string, number][]) if (m.includes(kw)) s += w
    for (const [kw, w] of [
      ['opus', -45], ['405b', -60], ['405', -55], ['70b', -22], ['72b', -22], ['65b', -22], ['large', -26],
      ['ultra', -30], ['pro', -8], ['reasoning', -20], ['thinking', -20], ['o1', -25], ['o3', -18], ['r1', -18],
      ['preview', -8], ['nightly', -6], ['deprecated', -80], ['0301', -30], ['0613', -30], ['3.5-turbo', -8],
    ] as [string, number][]) if (m.includes(kw)) s += w
    // Recency: reward higher version markers.
    for (const [kw, w] of [['4.1', 14], ['4o', 12], ['2.5', 14], ['2.0', 10], ['3.5', 6], ['3.7', 16], ['-latest', 10], ['v3', 8], ['3.3', 8], ['3.2', 6]] as [string, number][]) if (m.includes(kw)) s += w
    return s
  }
  return chat.sort((a, b) => {
    const d = score(b) - score(a)
    return d !== 0 ? d : a.length - b.length
  })
}

/** Fetch the provider's available model ids. */
export async function listModels(cfg: LlmConfig): Promise<string[]> {
  const r = resolveLlm(cfg)
  if (!r) throw new Error('No provider selected')
  if (!r.baseUrl) throw new Error('Missing base URL')
  if (r.needsKey && !r.apiKey) throw new Error('This provider needs an API key')

  if (r.api === 'ollama') {
    const res = await send('GET', `${r.baseUrl}/api/tags`, {})
    if (!res.ok) throw friendlyHttpError(res.status, res.body, r.model)
    const json = JSON.parse(res.body) as { models?: { name?: string; model?: string }[] }
    return (json.models ?? []).map((m) => m.name || m.model || '').filter(Boolean)
  }
  const headers = r.api === 'anthropic' ? anthropicHeaders(r.apiKey) : r.apiKey ? { Authorization: `Bearer ${r.apiKey}` } : {}
  const res = await send('GET', `${r.baseUrl}/models`, headers)
  if (!res.ok) throw friendlyHttpError(res.status, res.body)
  const json = JSON.parse(res.body) as { data?: { id?: string }[]; models?: { id?: string; name?: string }[] }
  const raw = json.data ?? json.models ?? []
  return raw.map((m) => m.id || (m as { name?: string }).name || '').filter(Boolean)
}

/**
 * Fetch models, rank them, and (when verify is on) probe the top candidates with
 * a tiny call so the chosen model is one this account can actually run. This
 * avoids picking a listed-but-uncallable model (e.g. some NVIDIA NIM models
 * return 404 "not found for account" or 410 end-of-life).
 */
export async function autoPickModel(
  cfg: LlmConfig,
  opts?: { verify?: boolean; onProgress?: (m: string) => void },
): Promise<{ best: string; models: string[]; verified: boolean; tried: number; jsonCapable: boolean }> {
  const models = await listModels(cfg)
  const ranked = rankModels(models)
  if (!opts?.verify || ranked.length === 0) return { best: ranked[0] ?? '', models: ranked, verified: false, tried: 0, jsonCapable: false }

  const r = resolveLlm(cfg)
  if (!r) return { best: ranked[0] ?? '', models: ranked, verified: false, tried: 0, jsonCapable: false }

  // Aggregators like NVIDIA NIM list every catalogue model but only enable a subset
  // per account, so probe a wide slice rather than just the top few. Shorter per-probe
  // timeout with an overall budget keeps the worst case bounded.
  const candidates = ranked.slice(0, 40)
  const deadline = Date.now() + 150_000
  let tried = 0
  // A model that answers but not in JSON still runs the assistant fine, so keep the
  // first one as a fallback while we look for one that also handles structured output.
  let textOnly: string | undefined
  for (let i = 0; i < candidates.length; i++) {
    if (Date.now() > deadline) break
    const m = candidates[i]
    tried++
    opts.onProgress?.(`Checking ${m} (${i + 1}/${candidates.length})`)
    const res = await probeModel({ ...r, model: m }, 12_000)
    if (res.json) return { best: m, models: ranked, verified: true, tried, jsonCapable: true }
    if (res.ok && !textOnly) textOnly = m
  }
  if (textOnly) return { best: textOnly, models: ranked, verified: true, tried, jsonCapable: false }
  return { best: ranked[0] ?? '', models: ranked, verified: false, tried, jsonCapable: false }
}

/** Quick connectivity check for the Settings "Test" button. */
export async function testLlm(cfg: LlmConfig): Promise<string> {
  const r = resolveLlm(cfg)
  if (!r) throw new Error('No provider selected')
  if (!r.baseUrl) throw new Error('Missing base URL')
  if (!r.model) throw new Error('Missing model name')
  if (r.needsKey && !r.apiKey) throw new Error('This provider needs an API key')
  const res = await probeModel(r, 45_000)
  if (!res.ok) throw new Error(res.error ?? 'The model did not reply.')
  // Answering at all is the bar for "connected". Not returning strict JSON is a
  // limitation worth surfacing, not a failure: chat works either way.
  return res.json
    ? `Connected. ${r.model} responded and returns clean JSON.`
    : `Connected. ${r.model} responded, but not as strict JSON, so the Assistant will work while statement categorization may fall back to the built-in engine.`
}

/** Fill in low-confidence rows using the configured model. Returns a new array. */
export async function llmCategorize(rows: CategorizedRow[], store: Store): Promise<CategorizedRow[]> {
  const r = resolveLlm(store.settings.llm)
  if (!r) throw new Error('No AI model configured. Add one in Settings.')

  const catNames = store.categories.map((c) => c.name)
  const uncertain = rows.map((row, i) => ({ row, i })).filter(({ row }) => row.confidence === 'low' || !row.categoryId)
  if (uncertain.length === 0) return rows

  const items = uncertain.map(({ row, i }) => `${i}: ${row.merchant} | ${row.description} | ${row.amount}`).join('\n')
  const prompt = [
    'You categorize bank transactions. Choose the single best category for each line from this exact list:',
    catNames.join(', '),
    '',
    'Transactions (index: merchant | description | amount, negative = spent):',
    items,
    '',
    'Reply with JSON only: {"assignments":[{"i":<index>,"category":"<one category from the list>"}]}. Use a category only from the list above.',
  ].join('\n')

  const content = await callModel(r, prompt, 4096)
  const parsed = JSON.parse(extractJsonText(content)) as { assignments?: { i: number; category: string }[] }

  const byName = new Map(store.categories.map((c) => [c.name.toLowerCase(), c.id]))
  const next = rows.slice()
  for (const a of parsed.assignments ?? []) {
    const id = byName.get(String(a.category).toLowerCase())
    if (id && next[a.i]) next[a.i] = { ...next[a.i], categoryId: id, confidence: 'high', source: 'llm' }
  }
  return next
}

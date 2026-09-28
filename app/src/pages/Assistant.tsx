import { useMemo, useRef, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Send, Loader2, Eraser, MessageSquareText, ShieldCheck } from 'lucide-react'
import { useStore } from '../lib/store'
import { chatModel, llmConfigured } from '../lib/statements/llm'
import type { ChatMsg } from '../lib/statements/llm'
import { resolveLlm } from '../lib/llmProviders'
import { ASSISTANT_SYSTEM, SUGGESTED_PROMPTS, buildFinanceContext, trailingYear } from '../lib/assistant'
import { EmptyState } from '../components/ui'

/** Minimal, safe rich text: **bold**, `code`, and line breaks. No HTML passthrough. */
function Rich({ text }: { text: string }) {
  const blocks = text.split(/\n/)
  return (
    <>
      {blocks.map((line, i) => (
        <div key={i} style={{ minHeight: line.trim() ? undefined : 8 }}>
          {line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, j) => {
            if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={j}>{part.slice(2, -2)}</strong>
            if (/^`[^`]+`$/.test(part)) return <code key={j} className="chat-code">{part.slice(1, -1)}</code>
            return <span key={j}>{part}</span>
          })}
        </div>
      ))}
    </>
  )
}

export default function AssistantPage() {
  const store = useStore()
  const configured = llmConfigured(store.settings.llm)
  const modelName = resolveLlm(store.settings.llm)?.model

  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const systemPrompt = useMemo(
    () => `${ASSISTANT_SYSTEM}\n\nHere is the user's current financial snapshot:\n\n${buildFinanceContext(store, trailingYear())}`,
    [store],
  )

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, busy])

  const ask = async (q: string) => {
    const text = q.trim()
    if (!text || busy) return
    setInput('')
    setError(null)
    const history = [...msgs, { role: 'user' as const, content: text }]
    setMsgs(history)
    setBusy(true)
    try {
      // Send the system brief + the last dozen turns to keep tokens bounded.
      const sent: ChatMsg[] = [{ role: 'system', content: systemPrompt }, ...history.slice(-12)]
      const reply = await chatModel(store.settings.llm, sent, 1024)
      setMsgs([...history, { role: 'assistant', content: reply.trim() || '(no reply)' }])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setMsgs(history) // keep the question; let them retry
    } finally {
      setBusy(false)
    }
  }

  if (!configured) {
    return (
      <EmptyState
        title="Add an AI model to use the assistant"
        sub="The assistant runs on the AI provider you configure with your own API key (OpenAI, Anthropic, Google, NVIDIA, a local Ollama model, and more). Your question and a short summary of your finances are sent only to that provider, never to us."
        action={<Link className="btn primary" to="/settings">Open Settings</Link>}
      />
    )
  }

  return (
    <div className="chat">
      <div className="chat-scroll" ref={scrollRef}>
        {msgs.length === 0 && (
          <div className="chat-welcome">
            <div className="chat-welcome-icon"><MessageSquareText size={22} /></div>
            <h2>Ask about your money</h2>
            <p className="muted">I can see a private summary of your accounts, cash flow, spending and net worth. Ask anything, or start with one of these.</p>
            <div className="chat-suggest">
              {SUGGESTED_PROMPTS.map((p) => (
                <button key={p} className="chip" onClick={() => ask(p)}>{p}</button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m, i) => (
          <div key={i} className={`chat-msg ${m.role}`}>
            <div className="chat-bubble"><Rich text={m.content} /></div>
          </div>
        ))}

        {busy && (
          <div className="chat-msg assistant">
            <div className="chat-bubble muted row" style={{ gap: 8 }}><Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Thinking…</div>
          </div>
        )}

        {error && <div className="chat-error small red">{error}</div>}
      </div>

      <div className="chat-input">
        <div className="chat-input-row">
          <textarea
            className="control"
            rows={1}
            placeholder="Ask about your spending, savings, net worth…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input) }
            }}
          />
          {msgs.length > 0 && (
            <button className="iconbtn" title="Clear conversation" onClick={() => { setMsgs([]); setError(null) }}><Eraser size={16} /></button>
          )}
          <button className="btn primary" disabled={busy || !input.trim()} onClick={() => ask(input)}>
            <Send size={15} /> Send
          </button>
        </div>
        <div className="chat-foot small muted">
          <ShieldCheck size={12} /> Runs on your configured model{modelName ? ` (${modelName})` : ''}. Your data stays local except the summary sent to that provider. Not financial advice.
        </div>
      </div>
      <style>{'@keyframes spin { to { transform: rotate(360deg) } }'}</style>
    </div>
  )
}

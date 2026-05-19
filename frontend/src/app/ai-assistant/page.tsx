'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { aiApi } from '@/services/apiClient'
import {
  Send, Bot, User, AlertTriangle, RefreshCw, ExternalLink,
  CheckCircle, Loader2, Trash2, Zap, Copy, Check,
  Download, RotateCcw, ChevronDown, Shield,
} from 'lucide-react'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant' | 'error'
  content: string
  streaming?: boolean
}

interface LLMStatus {
  provider: string
  ollama_base_url: string
  ollama_model: string
  available_models: string[]
  model_installed: boolean | null
}

// ── Markdown renderer (full platform markdown support) ────────────────────────

function renderInline(text: string): React.ReactNode {
  const TOKEN = /\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`/g
  const parts: React.ReactNode[] = []
  let lastIdx = 0; let match: RegExpExecArray | null; let k = 0
  while ((match = TOKEN.exec(text)) !== null) {
    if (match.index > lastIdx) parts.push(text.slice(lastIdx, match.index))
    if (match[1] !== undefined) parts.push(<strong key={k++} className="font-semibold text-gray-900">{match[1]}</strong>)
    else if (match[2] !== undefined) parts.push(<em key={k++} className="italic">{match[2]}</em>)
    else if (match[3] !== undefined) parts.push(<code key={k++} className="bg-gray-100 text-blue-700 px-1 py-0.5 rounded text-[13px] font-mono">{match[3]}</code>)
    lastIdx = match.index + match[0].length
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx))
  return parts.length ? <>{parts}</> : <>{text}</>
}

function MarkdownMessage({ content, streaming }: { content: string; streaming?: boolean }) {
  const lines = content.split('\n')
  const nodes: React.ReactNode[] = []
  let i = 0; let k = 0

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('```')) {
      const lang = line.slice(3).trim()
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) { codeLines.push(lines[i]); i++ }
      nodes.push(
        <div key={k++} className="my-3 rounded-xl overflow-hidden border border-gray-200">
          {lang && <div className="bg-gray-800 text-gray-400 text-[11px] px-3 py-1.5 font-mono uppercase tracking-wide">{lang}</div>}
          <pre className="bg-gray-900 text-green-300 p-4 overflow-x-auto text-[13px] font-mono leading-relaxed whitespace-pre">
            {codeLines.join('\n')}
          </pre>
        </div>
      )
      i++; continue
    }

    if (line.startsWith('|')) {
      const tableLines: string[] = []
      while (i < lines.length && lines[i].startsWith('|')) { tableLines.push(lines[i]); i++ }
      const dataRows = tableLines
        .filter(l => !/^\|[\s\-:|]+\|$/.test(l))
        .map(l => l.replace(/^\||\|$/g, '').split('|').map(c => c.trim()))
      if (dataRows.length > 0) {
        const [header, ...body] = dataRows
        nodes.push(
          <div key={k++} className="my-3 overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {header.map((h, ci) => (
                    <th key={ci} className="text-left px-4 py-2.5 font-semibold text-gray-600 text-xs uppercase tracking-wide whitespace-nowrap">
                      {renderInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {body.map((row, ri) => (
                  <tr key={ri} className="hover:bg-gray-50/50 transition-colors">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-4 py-2.5 text-gray-700 text-sm">{renderInline(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
      continue
    }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      const items: string[] = []
      while (i < lines.length && (lines[i].startsWith('- ') || lines[i].startsWith('* '))) {
        items.push(lines[i].slice(2)); i++
      }
      nodes.push(
        <ul key={k++} className="my-2 space-y-1.5 pl-1">
          {items.map((item, ii) => (
            <li key={ii} className="flex items-start gap-2 text-sm text-gray-700 leading-relaxed">
              <span className="text-gray-400 mt-1 shrink-0 select-none">•</span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      )
      continue
    }

    if (/^\d+\.\s/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, '')); i++
      }
      nodes.push(
        <ol key={k++} className="my-2 space-y-1.5 pl-1">
          {items.map((item, ii) => (
            <li key={ii} className="flex items-start gap-2 text-sm text-gray-700 leading-relaxed">
              <span className="text-blue-600 font-semibold shrink-0 mt-0.5 select-none min-w-[1.2rem]">{ii + 1}.</span>
              <span>{renderInline(item)}</span>
            </li>
          ))}
        </ol>
      )
      continue
    }

    if (line.startsWith('### ')) {
      nodes.push(<h4 key={k++} className="text-sm font-bold text-gray-700 uppercase tracking-wide mt-4 mb-1.5 border-b border-gray-100 pb-1">{renderInline(line.slice(4))}</h4>)
      i++; continue
    }
    if (line.startsWith('## ')) {
      nodes.push(<h3 key={k++} className="text-base font-bold text-gray-800 mt-4 mb-2">{renderInline(line.slice(3))}</h3>)
      i++; continue
    }
    if (line.startsWith('# ')) {
      nodes.push(<h2 key={k++} className="text-lg font-bold text-gray-900 mt-3 mb-2">{renderInline(line.slice(2))}</h2>)
      i++; continue
    }

    if (line.startsWith('> ')) {
      nodes.push(
        <blockquote key={k++} className="border-l-3 border-blue-300 pl-4 py-1 my-2 text-sm text-gray-600 italic bg-blue-50/40 rounded-r-lg">
          {renderInline(line.slice(2))}
        </blockquote>
      )
      i++; continue
    }

    if (line.trim() === '---') {
      nodes.push(<hr key={k++} className="border-gray-200 my-3" />)
      i++; continue
    }

    if (!line.trim()) { i++; continue }

    nodes.push(<p key={k++} className="text-sm text-gray-800 leading-relaxed">{renderInline(line)}</p>)
    i++
  }

  if (streaming) {
    nodes.push(<span key="cursor" className="inline-block w-0.5 h-4 bg-blue-500 ml-0.5 animate-pulse align-middle rounded-full" />)
  }

  return <div className="space-y-1.5">{nodes}</div>
}

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })}
      className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition-colors px-2 py-1 rounded hover:bg-gray-100"
    >
      {copied ? <><Check size={11} className="text-green-500" /> Copied</> : <><Copy size={11} /> Copy</>}
    </button>
  )
}

// ── LLM Status banner ─────────────────────────────────────────────────────────

function LLMStatusBanner({ status, onRefresh, checking }: {
  status: LLMStatus | null; onRefresh: () => void; checking: boolean
}) {
  if (!status) return null
  const isOllama = status.provider === 'ollama'
  const noModels = isOllama && status.available_models.length === 0
  const modelMissing = isOllama && status.model_installed === false

  if (!isOllama) return (
    <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 mb-3">
      <CheckCircle size={14} /> Using <strong>{status.provider}</strong> — AI ready
    </div>
  )

  if (noModels || modelMissing) return (
    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-3 text-sm">
      <div className="flex items-start gap-2">
        <AlertTriangle size={16} className="text-orange-600 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-semibold text-orange-800">
            {noModels ? 'Ollama has no models downloaded' : `Model ${status.ollama_model} not downloaded`}
          </p>
          <code className="block mt-2 bg-orange-100 text-orange-900 px-3 py-2 rounded-lg font-mono text-xs">
            ollama pull {status.ollama_model}
          </code>
          <div className="flex items-center gap-3 mt-2">
            <Link href="/settings" className="text-xs text-orange-700 underline flex items-center gap-1"><ExternalLink size={11} /> Settings</Link>
            <button onClick={onRefresh} disabled={checking}
              className="flex items-center gap-1 px-2.5 py-1 text-xs bg-orange-100 text-orange-800 rounded-lg hover:bg-orange-200">
              {checking ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />} Recheck
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-xl text-xs text-green-700 mb-3">
      <CheckCircle size={13} />
      Ollama ready · model <strong>{status.ollama_model}</strong> · {status.available_models.length} installed
      <button onClick={onRefresh} disabled={checking} className="ml-auto text-green-600 hover:text-green-800">
        {checking ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
      </button>
    </div>
  )
}

// ── Example prompts (full platform scope) ─────────────────────────────────────

const EXAMPLE_GROUPS = [
  {
    label: 'Quality',
    examples: [
      'What is the overall quality score today?',
      'Which domains have the most failed rules?',
      'Show me quality trend for Revenue',
    ],
  },
  {
    label: 'Failures',
    examples: [
      'Which rules failed in the last 24 hours?',
      'What are the most critical failures right now?',
      'Show failed rules for Finance domain',
    ],
  },
  {
    label: 'Alerts',
    examples: [
      'How many open alerts do we have?',
      'Show critical open alerts',
      'Which domain has the most alerts?',
    ],
  },
  {
    label: 'Governance',
    examples: [
      'What governance policy violations are open?',
      'Show domain governance scorecards',
      'Which tables are uncertified?',
    ],
  },
  {
    label: 'Contracts & Incidents',
    examples: [
      'Are any data contracts violated?',
      'Show open quality incidents',
      'What is our average MTTR for incidents?',
    ],
  },
  {
    label: 'Rules & Schedules',
    examples: [
      'How many active rules do we have by severity?',
      'Which rules run hourly?',
      'Show all rules for HR domain',
    ],
  },
]

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'dq_ai_chat_history_v2'
const INPUT_MAX = 2000

type ChatMode = 'general' | 'governance'

const WELCOME: Message = {
  role: 'assistant',
  content: `### Welcome to DataGuardian AI

I'm your AI expert for DataGuardian. I have live access to your platform data and can answer questions about:

- **Quality scores** — global, domain, subdomain, and table level
- **Rules & executions** — failures, passing rates, execution history
- **Alerts** — open, critical, by domain or severity
- **Governance** — policy violations, scorecards, certification status
- **Data contracts** — SLA compliance, violated contracts
- **Incidents** — open incidents, MTTD, MTTR metrics
- **Schedules** — frequencies, upcoming runs, schedule levels
- **Assets** — registered tables, ownership, criticality

Ask me anything — I answer from **live platform data**, not general knowledge.`,
}

const GOVERNANCE_WELCOME: Message = {
  role: 'assistant',
  content: `### Governance Advisor

I'm your **DQ Governance Advisor** — focused on helping your governance and stewardship teams.

I have live access to:

- 🔴 **Open policy violations** — what's breached, severity, and recommended actions
- 📋 **Pending rule approvals** — rules awaiting steward review
- 🏛️ **Active policies** — what governance rules are enforced
- ✅ **Certification status** — uncertified assets and coverage gaps

Ask me to:
- Prioritise today's violations by business impact
- Explain a specific policy and what it checks
- Recommend next steps to improve your governance scorecard
- Draft a resolution note for a violation`,
}

const GOVERNANCE_EXAMPLE_GROUPS = [
  {
    label: 'Violations',
    prompts: [
      'Which violations are most critical today?',
      'What has been open the longest?',
      'How many violations are there by severity?',
    ],
  },
  {
    label: 'Approvals',
    prompts: [
      'What rules are pending approval?',
      'Which pending rule has the highest severity?',
      'Summarise the rules waiting for review',
    ],
  },
  {
    label: 'Policies',
    prompts: [
      'What governance policies are active?',
      'Which policy is triggered most often?',
      'What would improve the governance scorecard?',
    ],
  },
]

function loadHistory(): Message[] {
  if (typeof window === 'undefined') return [WELCOME]
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const saved = raw ? JSON.parse(raw) : null
    return Array.isArray(saved) && saved.length > 0 ? saved : [WELCOME]
  } catch { return [WELCOME] }
}

// ── Main page ─────────────────────────────────────────────────────────────────

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function AIAssistantPage() {
  const [mode, setMode] = useState<ChatMode>('general')
  const [messages, setMessages] = useState<Message[]>(loadHistory)
  const [govMessages, setGovMessages] = useState<Message[]>([GOVERNANCE_WELCOME])
  const [activeGovGroup, setActiveGovGroup] = useState(0)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [llmStatus, setLlmStatus] = useState<LLMStatus | null>(null)
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [activeGroup, setActiveGroup] = useState(0)
  const [lastUserMessage, setLastUserMessage] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const [rateCooldown, setRateCooldown] = useState(0)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll only when user is at bottom
  useEffect(() => {
    if (isAtBottom) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isAtBottom])

  useEffect(() => {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages)) } catch {}
  }, [messages])

  // Scroll-lock: track whether user has scrolled away from bottom
  useEffect(() => {
    const el = messagesContainerRef.current
    if (!el) return
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      setIsAtBottom(atBottom)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  const checkStatus = useCallback(async () => {
    setCheckingStatus(true)
    try { setLlmStatus((await aiApi.checkModels()).data) }
    catch { setLlmStatus(null) }
    finally { setCheckingStatus(false) }
  }, [])

  useEffect(() => { checkStatus() }, [checkStatus])
  useEffect(() => { inputRef.current?.focus() }, [])

  // Rate-limit countdown
  useEffect(() => {
    if (rateCooldown <= 0) return
    const t = setTimeout(() => setRateCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [rateCooldown])

  // Confirm-clear auto-reset after 3 seconds
  useEffect(() => {
    if (!confirmClear) return
    const t = setTimeout(() => setConfirmClear(false), 3000)
    return () => clearTimeout(t)
  }, [confirmClear])

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey
      if (e.key === 'Escape' && loading) { stopStreaming(); e.preventDefault(); return }
      if (mod && e.key === 'l') { handleClearClick(); e.preventDefault(); return }
      if (mod && e.key === '/') { inputRef.current?.focus(); e.preventDefault(); return }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, confirmClear])

  const handleClearClick = () => {
    if (confirmClear) {
      setMessages([WELCOME])
      try { sessionStorage.removeItem(STORAGE_KEY) } catch {}
      setConfirmClear(false)
    } else {
      setConfirmClear(true)
    }
  }

  const stopStreaming = () => {
    abortRef.current?.abort()
    setLoading(false)
    setMessages(m => {
      const last = m[m.length - 1]
      if (last?.role === 'assistant' && last.streaming) {
        return [...m.slice(0, -1), { ...last, streaming: false }]
      }
      return m
    })
  }

  const jumpToBottom = () => {
    setIsAtBottom(true)
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const exportChat = () => {
    const lines = messages
      .filter(m => m.role !== 'error')
      .map(m => `**${m.role === 'user' ? 'You' : 'AI'}:** ${m.content}`)
    const content = `# AI Assistant Conversation\nExported: ${new Date().toLocaleString()}\n\n${lines.join('\n\n')}`
    const blob = new Blob([content], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `dq-chat-${Date.now()}.md`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const send = async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || loading || rateCooldown > 0) return
    setInput('')
    setLastUserMessage(msg)
    setLoading(true)
    setIsAtBottom(true)

    // Build history from current messages (exclude welcome + errors)
    const history = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .filter(m => m.content !== WELCOME.content)
      .slice(-12)   // last 6 turns
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    setMessages(m => [
      ...m,
      { role: 'user', content: msg },
      { role: 'assistant', content: '', streaming: true },
    ])

    const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null
    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const resp = await fetch(`${API_URL}/ai/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: msg, history }),
        signal: ctrl.signal,
      })

      if (resp.status === 429) throw Object.assign(new Error('rate_limit'), { isRateLimit: true })
      if (!resp.ok) throw new Error(`Server error ${resp.status}`)

      const reader = resp.body!.getReader()
      const dec = new TextDecoder()
      let buf = ''
      let gotContent = false

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const d = JSON.parse(line.slice(6))
            if (d.error) {
              setMessages(m => {
                const last = m[m.length - 1]
                if (last?.role === 'assistant') {
                  return [...m.slice(0, -1), { role: 'error', content: d.error, streaming: false }]
                }
                return [...m, { role: 'error', content: d.error }]
              })
              setLoading(false)
              return
            }
            if (d.token) {
              gotContent = true
              setMessages(m => {
                const last = m[m.length - 1]
                if (last?.role === 'assistant') {
                  return [...m.slice(0, -1), { ...last, content: last.content + d.token }]
                }
                return m
              })
            }
            if (d.done) {
              setMessages(m => {
                const last = m[m.length - 1]
                if (last?.role === 'assistant') return [...m.slice(0, -1), { ...last, streaming: false }]
                return m
              })
              setLoading(false)
              return
            }
          } catch { /* partial JSON */ }
        }
      }

      // Stream ended without done=true
      if (!gotContent) {
        setMessages(m => {
          const last = m[m.length - 1]
          if (last?.role === 'assistant' && last.streaming) {
            return [...m.slice(0, -1), {
              role: 'assistant',
              content: '> ⚠️ No response received. Check LLM configuration in **Settings → AI/LLM**.',
              streaming: false,
            }]
          }
          return m
        })
      } else {
        setMessages(m => {
          const last = m[m.length - 1]
          if (last?.role === 'assistant' && last.streaming) return [...m.slice(0, -1), { ...last, streaming: false }]
          return m
        })
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return
      if ((e as any).isRateLimit) {
        setRateCooldown(10)
        setMessages(m => {
          const last = m[m.length - 1]
          if (last?.role === 'assistant' && last.streaming) {
            return [...m.slice(0, -1), { role: 'error', content: 'Too many requests — please wait a moment before sending another message.' }]
          }
          return m
        })
      } else {
        const detail = e.message || 'Connection failed'
        setMessages(m => {
          const last = m[m.length - 1]
          if (last?.role === 'assistant' && last.streaming) {
            return [...m.slice(0, -1), { role: 'error', content: detail }]
          }
          return [...m, { role: 'error', content: detail }]
        })
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Governance mode send (non-streaming) ──────────────────────────────────

  const sendGovernance = async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    setInput('')
    setLoading(true)
    setIsAtBottom(true)

    const history = govMessages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .filter(m => m.content !== GOVERNANCE_WELCOME.content)
      .slice(-12)
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    setGovMessages(m => [
      ...m,
      { role: 'user', content: msg },
      { role: 'assistant', content: '', streaming: true },
    ])

    try {
      const res = await aiApi.governanceChat({ message: msg, history })
      const reply = res.data.response || 'No response received.'
      setGovMessages(m => {
        const last = m[m.length - 1]
        if (last?.role === 'assistant' && last.streaming) {
          return [...m.slice(0, -1), { role: 'assistant', content: reply, streaming: false }]
        }
        return m
      })
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e.message || 'Connection failed'
      setGovMessages(m => {
        const last = m[m.length - 1]
        if (last?.role === 'assistant' && last.streaming) {
          return [...m.slice(0, -1), { role: 'error', content: detail }]
        }
        return [...m, { role: 'error', content: detail }]
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSend = (text?: string) => mode === 'governance' ? sendGovernance(text) : send(text)
  const activeMessages = mode === 'governance' ? govMessages : messages

  return (
    <div className="flex flex-col h-screen max-h-screen bg-gray-50">

      {/* ── Header ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${mode === 'governance' ? 'bg-violet-600' : 'bg-blue-600'}`}>
              {mode === 'governance' ? <Shield size={16} className="text-white" /> : <Bot size={16} className="text-white" />}
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">
                {mode === 'governance' ? 'Governance Advisor' : 'DQ Intelligence'}
              </h1>
              <p className="text-xs text-gray-400">
                Live platform data · {activeMessages.filter(m => m.role === 'user').length} messages
              </p>
            </div>
          </div>
          {/* Mode tabs */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setMode('general')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                mode === 'general' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Bot size={12} /> General
            </button>
            <button
              onClick={() => setMode('governance')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                mode === 'governance' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Shield size={12} /> Governance
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[10px] text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
            <Zap size={9} className="text-blue-500" /> answers from live DB data
          </span>
          {messages.length > 1 && (
            <button onClick={exportChat}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-blue-600 border border-gray-200 hover:border-blue-200 px-2.5 py-1.5 rounded-lg transition-colors"
              title="Export conversation as Markdown">
              <Download size={12} /> Export
            </button>
          )}
          {messages.length > 1 && (
            <button onClick={handleClearClick}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                confirmClear
                  ? 'text-red-600 border-red-300 bg-red-50 hover:bg-red-100'
                  : 'text-gray-400 hover:text-red-500 border-gray-200 hover:border-red-200'
              }`}>
              <Trash2 size={12} /> {confirmClear ? 'Confirm clear?' : 'Clear'}
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Left sidebar: example prompts ── */}
        <div className="w-64 shrink-0 bg-white border-r border-gray-200 overflow-y-auto p-4 space-y-4">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-3">Example Questions</p>
            {mode === 'general' ? (
              <>
                <div className="flex flex-wrap gap-1 mb-3">
                  {EXAMPLE_GROUPS.map((g, i) => (
                    <button key={i} onClick={() => setActiveGroup(i)}
                      className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors ${
                        activeGroup === i
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'border-gray-200 text-gray-500 hover:border-blue-300 hover:text-blue-600'
                      }`}>
                      {g.label}
                    </button>
                  ))}
                </div>
                <div className="space-y-1.5">
                  {EXAMPLE_GROUPS[activeGroup].examples.map(ex => (
                    <button key={ex} onClick={() => handleSend(ex)} disabled={loading}
                      className="w-full text-left px-3 py-2 text-xs text-gray-600 bg-gray-50 hover:bg-blue-50 hover:text-blue-700 border border-gray-100 hover:border-blue-200 rounded-lg transition-colors leading-relaxed disabled:opacity-50">
                      {ex}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex flex-wrap gap-1 mb-3">
                  {GOVERNANCE_EXAMPLE_GROUPS.map((g, i) => (
                    <button key={i} onClick={() => setActiveGovGroup(i)}
                      className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors ${
                        activeGovGroup === i
                          ? 'bg-violet-600 text-white border-violet-600'
                          : 'border-gray-200 text-gray-500 hover:border-violet-300 hover:text-violet-600'
                      }`}>
                      {g.label}
                    </button>
                  ))}
                </div>
                <div className="space-y-1.5">
                  {GOVERNANCE_EXAMPLE_GROUPS[activeGovGroup].prompts.map(ex => (
                    <button key={ex} onClick={() => handleSend(ex)} disabled={loading}
                      className="w-full text-left px-3 py-2 text-xs text-gray-600 bg-violet-50 hover:bg-violet-100 hover:text-violet-700 border border-violet-100 hover:border-violet-300 rounded-lg transition-colors leading-relaxed disabled:opacity-50">
                      {ex}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="border-t border-gray-100 pt-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Tips</p>
            <ul className="space-y-1.5 text-[11px] text-gray-500">
              <li>• Ask follow-up questions — conversation history is maintained</li>
              <li>• Be specific: mention domain or table names for precise answers</li>
              <li>• Use the <strong className="text-gray-700">AI Copilot</strong> (bottom-right) for quick queries & rule creation</li>
            </ul>
          </div>
        </div>

        {/* ── Main chat area ── */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 relative">

          {/* Jump to latest pill — shown when scrolled up during streaming */}
          {!isAtBottom && loading && (
            <button onClick={jumpToBottom}
              className="absolute bottom-24 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-full shadow-lg hover:bg-blue-700 transition-colors">
              <ChevronDown size={13} /> Jump to latest
            </button>
          )}

          {/* Messages */}
          <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-6 space-y-6">
            {activeMessages.map((msg, i) => {
              if (msg.role === 'error') return (
                <div key={i} className="flex gap-3">
                  <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                    <AlertTriangle size={15} className="text-red-600" />
                  </div>
                  <div className="flex-1 max-w-3xl bg-red-50 border border-red-200 rounded-2xl rounded-tl-sm px-5 py-4">
                    <p className="font-semibold text-red-800 text-sm mb-1">AI Unavailable</p>
                    <p className="text-sm text-red-700">{msg.content}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <Link href="/settings" className="inline-flex items-center gap-1 text-xs text-red-600 underline">
                        <ExternalLink size={11} /> Open LLM Settings
                      </Link>
                      {lastUserMessage && (
                        <button
                          onClick={() => {
                            setMessages(m => m.filter((_, idx) => idx !== i))
                            send(lastUserMessage)
                          }}
                          disabled={loading}
                          className="inline-flex items-center gap-1 text-xs text-red-700 bg-red-100 hover:bg-red-200 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50">
                          <RotateCcw size={11} /> Retry
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )

              if (msg.role === 'user') return (
                <div key={i} className="flex justify-end gap-3">
                  <div className="max-w-2xl bg-blue-600 text-white px-5 py-3 rounded-2xl rounded-br-sm text-sm leading-relaxed">
                    {msg.content}
                  </div>
                  <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                    <User size={15} className="text-blue-600" />
                  </div>
                </div>
              )

              // Assistant message
              const isWelcome = msg.content === WELCOME.content
              return (
                <div key={i} className="flex gap-3 items-start">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${msg.streaming ? 'bg-blue-100' : 'bg-blue-50'}`}>
                    {msg.streaming
                      ? <Loader2 size={15} className="text-blue-500 animate-spin" />
                      : <Bot size={15} className="text-blue-600" />}
                  </div>
                  <div className={`flex-1 min-w-0 max-w-3xl bg-white border rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm ${
                    isWelcome ? 'border-blue-100 bg-blue-50/30' : 'border-gray-200'
                  }`}>
                    {msg.content || msg.streaming
                      ? <>
                          <MarkdownMessage content={msg.content} streaming={msg.streaming} />
                          {!msg.streaming && msg.content && !isWelcome && (
                            <div className="mt-3 pt-2 border-t border-gray-100 flex items-center gap-2">
                              <span className="flex items-center gap-1 text-[11px] text-gray-400">
                                <Zap size={10} className="text-blue-400" /> AI · Live data
                              </span>
                              <CopyButton text={msg.content} />
                            </div>
                          )}
                        </>
                      : <span className="text-sm text-gray-400 italic">Thinking…</span>}
                  </div>
                </div>
              )
            })}

            {/* Loading dots when streaming not yet started */}
            {loading && messages[messages.length - 1]?.content === '' && messages[messages.length - 1]?.streaming && (
              <div className="flex gap-3 items-start">
                <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                  <Loader2 size={15} className="text-blue-500 animate-spin" />
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-5 py-4 shadow-sm">
                  <div className="flex gap-1.5 items-center">
                    {[0, 1, 2].map(ii => (
                      <div key={ii} className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                        style={{ animationDelay: `${ii * 0.15}s` }} />
                    ))}
                    <span className="text-xs text-gray-400 ml-2">Gathering platform data…</span>
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* ── Input ── */}
          <div className="shrink-0 bg-white border-t border-gray-200 px-6 py-4">
            <div className="flex gap-3 items-end max-w-3xl">
              <textarea
                ref={inputRef}
                rows={2}
                value={input}
                onChange={e => setInput(e.target.value.slice(0, INPUT_MAX))}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
                }}
                placeholder={mode === 'governance'
                  ? 'Ask about violations, approvals, policies… (Shift+Enter for new line)'
                  : 'Ask about quality, rules, governance, incidents… (Shift+Enter for new line)'}
                disabled={loading}
                className={`flex-1 px-4 py-3 border rounded-xl text-sm focus:outline-none bg-white disabled:opacity-60 resize-none overflow-y-auto max-h-32 ${
                  mode === 'governance'
                    ? 'border-violet-200 focus:ring-2 focus:ring-violet-400 focus:border-transparent'
                    : 'border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent'
                }`}
              />
              {loading ? (
                <button onClick={mode === 'governance' ? () => setLoading(false) : stopStreaming}
                  className="flex items-center gap-1.5 px-4 py-3 bg-red-50 text-red-600 border border-red-200 rounded-xl text-sm font-medium hover:bg-red-100 transition-colors shrink-0">
                  <div className="w-3 h-3 bg-red-500 rounded-sm" /> Stop
                </button>
              ) : (
                <button onClick={() => handleSend()} disabled={!input.trim() || rateCooldown > 0 || input.length >= INPUT_MAX}
                  className={`p-3 text-white rounded-xl disabled:opacity-40 transition-colors shrink-0 ${
                    mode === 'governance' ? 'bg-violet-600 hover:bg-violet-700' : 'bg-blue-600 hover:bg-blue-700'
                  }`}>
                  {rateCooldown > 0 ? <span className="text-xs font-bold px-1">{rateCooldown}s</span> : <Send size={18} />}
                </button>
              )}
            </div>
            <div className="flex items-center justify-between max-w-3xl mt-1.5">
              <p className="text-[11px] text-gray-400">
                Enter send · Shift+Enter newline · Esc stop · Ctrl+/ focus · Ctrl+L clear
              </p>
              {input.length > 1600 && (
                <p className={`text-[11px] font-medium ${input.length >= INPUT_MAX ? 'text-red-500' : input.length >= 1900 ? 'text-orange-500' : 'text-gray-400'}`}>
                  {input.length} / {INPUT_MAX}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

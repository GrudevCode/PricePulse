import { useState, useRef, useEffect, useCallback } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { cn } from '@/lib/utils';
import {
  ArrowUp, Brain, Plus, TrendingUp, Package,
  CalendarDays, Zap, BarChart3, Copy, ThumbsUp,
  ThumbsDown, RotateCcw, Square, MessageSquare, ChevronDown,
  PanelLeftClose, PanelLeftOpen, Check, Map,
} from 'lucide-react';
import { streamAIResponse, getReasoningSteps, type ChatHistoryItem } from '@/lib/aiService';
import { MapIntelligencePanel } from '@/components/intelligence/MapIntelligencePanel';

// ─── Types ────────────────────────────────────────────────────────────────────

type StepStatus = 'pending' | 'running' | 'done';

interface ReasoningStep {
  text: string;
  status: StepStatus;
}

interface UserMsg {
  id: string;
  role: 'user';
  content: string;
}

interface AiMsg {
  id: string;
  role: 'assistant';
  /** thinking → reasoning → streaming → done */
  phase: 'thinking' | 'reasoning' | 'streaming' | 'done';
  steps: ReasoningStep[];
  stepsVisible: boolean;
  content: string;
}

type Message = UserMsg | AiMsg;

interface Convo {
  id: string;
  title: string;
  when: string;
}

// ─── Static data ─────────────────────────────────────────────────────────────

const PAST: Convo[] = [
  { id: 'c1', title: 'Weekend pricing strategy',   when: 'Today' },
  { id: 'c2', title: 'Inventory reorder analysis', when: 'Yesterday' },
  { id: 'c3', title: 'Menu performance review',    when: 'Mar 17' },
  { id: 'c4', title: 'Booking pattern insights',   when: 'Mar 15' },
  { id: 'c5', title: 'Staff cost vs revenue',      when: 'Mar 12' },
];

const SUGGESTIONS = [
  { icon: TrendingUp,   text: 'Forecast demand for this weekend' },
  { icon: Zap,          text: 'Optimise Friday evening menu prices' },
  { icon: Package,      text: 'Which inventory items need restocking?' },
  { icon: CalendarDays, text: 'Analyse my booking patterns this month' },
  { icon: BarChart3,    text: 'What are my highest-margin dishes?' },
  { icon: Brain,        text: 'Give me a full business health summary' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} className="font-semibold text-foreground">{p.slice(2, -2)}</strong>
      : p,
  );
}

function MdContent({ text }: { text: string }) {
  const blocks = text.split('\n\n');
  return (
    <div className="space-y-2.5">
      {blocks.map((block, bi) => {
        const lines = block.split('\n');

        // Standalone **Heading**
        if (lines.length === 1 && lines[0].startsWith('**') && lines[0].endsWith('**')) {
          return (
            <h4 key={bi} className="font-semibold text-[13px] text-foreground mt-1">
              {lines[0].slice(2, -2)}
            </h4>
          );
        }

        // Table: lines containing |
        if (lines.every(l => l.includes('|'))) {
          const rows = lines.filter(l => !/^[\s|:-]+$/.test(l));
          return (
            <table key={bi} className="w-full text-[12px] border-collapse">
              <tbody>
                {rows.map((row, ri) => {
                  const cells = row.split('|').filter((_, ci) => ci > 0 && ci < row.split('|').length - 1);
                  return (
                    <tr key={ri} className={ri === 0 ? 'border-b border-border' : ''}>
                      {cells.map((cell, ci) => {
                        const Tag = ri === 0 ? 'th' : 'td';
                        return (
                          <Tag key={ci} className={cn('py-1 px-1.5 text-left', ri === 0 ? 'font-semibold text-foreground/70' : 'text-foreground/80')}>
                            {renderInline(cell.trim())}
                          </Tag>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          );
        }

        // All list items
        const allList = lines.every(l => /^[-\d]/.test(l.trim()));
        if (allList) {
          return (
            <ul key={bi} className="space-y-1">
              {lines.map((l, li) => {
                const isOrdered = /^\d+\./.test(l.trim());
                const content = l.replace(/^[-\d]+\.?\s*/, '');
                return (
                  <li key={li} className="flex gap-2 text-[13px] leading-relaxed text-foreground/85">
                    {isOrdered
                      ? <span className="shrink-0 text-muted-foreground/50 tabular-nums w-3.5">{l.match(/^\d+/)?.[0]}.</span>
                      : <span className="mt-[6px] w-1 h-1 rounded-full bg-muted-foreground/40 shrink-0" />}
                    <span>{renderInline(content)}</span>
                  </li>
                );
              })}
            </ul>
          );
        }

        // Mixed lines
        return (
          <div key={bi} className="space-y-1">
            {lines.map((line, li) => {
              if (line.startsWith('- ')) {
                return (
                  <div key={li} className="flex gap-2 text-[13px] leading-relaxed text-foreground/85">
                    <span className="mt-[6px] w-1 h-1 rounded-full bg-muted-foreground/40 shrink-0" />
                    <span>{renderInline(line.slice(2))}</span>
                  </div>
                );
              }
              if (/^\d+\./.test(line)) {
                const num = line.match(/^\d+/)?.[0];
                return (
                  <div key={li} className="flex gap-2 text-[13px] leading-relaxed text-foreground/85">
                    <span className="shrink-0 text-muted-foreground/50 tabular-nums w-3.5">{num}.</span>
                    <span>{renderInline(line.replace(/^\d+\.\s*/, ''))}</span>
                  </div>
                );
              }
              return (
                <p key={li} className="text-[13px] leading-relaxed text-foreground/85">
                  {renderInline(line)}
                </p>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── Micro components ─────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="w-3 h-3 animate-spin shrink-0" viewBox="0 0 24 24" fill="none" style={{ color: '#D25F2A' }}>
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.37 0 0 5.37 0 12h4z" />
    </svg>
  );
}

function ThinkingDots() {
  return (
    <span className="flex gap-1 items-center">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-muted-foreground/35 animate-bounce"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </span>
  );
}

// ─── Message components ───────────────────────────────────────────────────────

function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div
        className="max-w-[520px] rounded-2xl rounded-br-sm px-4 py-2.5"
        style={{ background: '#ECEAE7' }}
      >
        <p className="text-[13px] leading-relaxed text-foreground">{content}</p>
      </div>
    </div>
  );
}

function AiBubble({ msg, isLast }: { msg: AiMsg; isLast: boolean }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex gap-3 group">
      {/* Avatar */}
      <div
        className="w-6 h-6 rounded-full border flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: '#FEF3EC', borderColor: '#F5C9A3' }}
      >
        <Brain className="h-3 w-3" style={{ color: '#D25F2A' }} />
      </div>

      <div className="flex-1 min-w-0">

        {/* ── Phase: thinking ── */}
        {msg.phase === 'thinking' && (
          <div className="flex items-center gap-2 py-1">
            <span className="text-[12px] text-muted-foreground/60">Thinking</span>
            <ThinkingDots />
          </div>
        )}

        {/* ── Reasoning steps (visible during reasoning + streaming) ── */}
        {msg.phase !== 'thinking' && (
          <div
            className="space-y-[5px]"
            style={{
              opacity: msg.stepsVisible ? 1 : 0,
              maxHeight: msg.stepsVisible ? '260px' : '0px',
              overflow: 'hidden',
              marginBottom: msg.stepsVisible ? '12px' : 0,
              transition: 'opacity 0.55s ease, max-height 0.55s ease, margin-bottom 0.55s ease',
            }}
          >
            {msg.steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-4 flex items-center justify-center shrink-0">
                  {step.status === 'running' && <Spinner />}
                  {step.status === 'done'    && <Check className="w-3 h-3 text-emerald-500" />}
                  {step.status === 'pending' && <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/20" />}
                </span>
                <span
                  className="text-[11.5px] leading-snug transition-colors duration-300"
                  style={{
                    color: step.status === 'done'
                      ? 'var(--muted-foreground)'
                      : step.status === 'running'
                        ? 'var(--foreground)'
                        : '#C4BDB5',
                    opacity: step.status === 'done' ? 0.55 : 1,
                  }}
                >
                  {step.text}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* ── Streamed / done content ── */}
        {(msg.phase === 'streaming' || msg.phase === 'done') && (
          <div>
            <MdContent text={msg.content} />
            {msg.phase === 'streaming' && (
              <span
                className="inline-block w-[2px] h-3.5 rounded-sm ml-0.5 align-text-bottom animate-pulse"
                style={{ background: '#D25F2A', opacity: 0.7 }}
              />
            )}
          </div>
        )}

        {/* ── Action bar (done + last message) ── */}
        {msg.phase === 'done' && (
          <div className={cn(
            'flex items-center gap-0.5 mt-2 transition-opacity',
            isLast ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-foreground px-2 py-1 rounded-md hover:bg-muted/50 transition-colors"
            >
              <Copy className="h-3 w-3" />
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button className="flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-foreground px-2 py-1 rounded-md hover:bg-muted/50 transition-colors">
              <ThumbsUp className="h-3 w-3" />
            </button>
            <button className="flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-foreground px-2 py-1 rounded-md hover:bg-muted/50 transition-colors">
              <ThumbsDown className="h-3 w-3" />
            </button>
            <button className="flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-foreground px-2 py-1 rounded-md hover:bg-muted/50 transition-colors">
              <RotateCcw className="h-3 w-3" />
              Retry
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Intelligence() {
  const [messages, setMessages]     = useState<Message[]>([]);
  const [input, setInput]           = useState('');
  const [loading, setLoading]       = useState(false);
  const [activeConvo, setActiveConvo] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showMap, setShowMap]         = useState(false);

  const bottomRef   = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const historyRef  = useRef<ChatHistoryItem[]>([]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 180) + 'px';
  }, [input]);

  // Scroll to bottom on new content
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Update a single AI message by id ──────────────────────────────────────
  const updateAi = useCallback((id: string, updater: (m: AiMsg) => AiMsg) => {
    setMessages(prev => prev.map(m => m.id === id ? updater(m as AiMsg) : m));
  }, []);

  // ── Core send logic ───────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    setInput('');
    setLoading(true);

    // 1. Append user message
    const userMsg: UserMsg = { id: `u-${Date.now()}`, role: 'user', content: trimmed };

    // 2. Create placeholder AI message
    const aiId = `a-${Date.now() + 1}`;
    const steps = getReasoningSteps(trimmed);
    const aiMsg: AiMsg = {
      id: aiId,
      role: 'assistant',
      phase: 'thinking',
      steps: steps.map(t => ({ text: t, status: 'pending' })),
      stepsVisible: true,
      content: '',
    };

    setMessages(prev => [...prev, userMsg, aiMsg]);

    // 3. Thinking phase (500 ms)
    await sleep(480);

    // 4. Reasoning phase — step through each item
    updateAi(aiId, m => ({ ...m, phase: 'reasoning' }));

    for (let i = 0; i < steps.length; i++) {
      // Mark running
      updateAi(aiId, m => ({
        ...m,
        steps: m.steps.map((s, idx) => idx === i ? { ...s, status: 'running' } : s),
      }));
      await sleep(360 + Math.random() * 180);
      // Mark done
      updateAi(aiId, m => ({
        ...m,
        steps: m.steps.map((s, idx) => idx === i ? { ...s, status: 'done' } : s),
      }));
      await sleep(60);
    }

    // Brief pause after last step before fading
    await sleep(220);

    // 5. Switch to streaming — fade steps simultaneously
    updateAi(aiId, m => ({ ...m, phase: 'streaming', stepsVisible: false }));

    // 6. Stream response tokens
    let accumulated = '';
    try {
      for await (const token of streamAIResponse(trimmed, historyRef.current)) {
        accumulated += token;
        const snap = accumulated;
        updateAi(aiId, m => ({ ...m, content: snap }));
      }
    } catch {
      accumulated = 'Sorry, something went wrong. Please try again.';
      updateAi(aiId, m => ({ ...m, content: accumulated }));
    }

    // 7. Mark done
    updateAi(aiId, m => ({ ...m, phase: 'done' }));

    // Update conversation history for Groq context
    historyRef.current.push({ role: 'user', content: trimmed });
    historyRef.current.push({ role: 'assistant', content: accumulated });
    // Keep last 10 turns
    if (historyRef.current.length > 20) historyRef.current = historyRef.current.slice(-20);

    setLoading(false);
  }, [loading, updateAi]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const startNewChat = () => {
    setMessages([]);
    setActiveConvo(null);
    setInput('');
    historyRef.current = [];
  };

  const isEmpty = messages.length === 0;

  return (
    <AppLayout>
      <div className="flex h-full overflow-hidden">

        {/* ── Left sidebar ─────────────────────────────────────────────────── */}
        <aside className={cn(
          'shrink-0 border-r border-border flex flex-col bg-muted/10 transition-all duration-200 overflow-hidden',
          sidebarOpen ? 'w-56' : 'w-0 border-r-0',
        )}>
          <div className="h-14 px-3 flex items-center gap-2 border-b border-border shrink-0 min-w-[224px]">
            <button
              onClick={startNewChat}
              className="flex items-center gap-2 flex-1 px-2.5 py-2 rounded-lg text-xs font-medium text-foreground hover:bg-muted/60 transition-colors border border-border/60 hover:border-border"
            >
              <Plus className="h-3.5 w-3.5" />
              New chat
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-colors shrink-0"
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5 min-w-[224px]">
            <p className="px-2 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
              Recent
            </p>
            {PAST.map(c => (
              <button
                key={c.id}
                onClick={() => setActiveConvo(c.id)}
                className={cn(
                  'w-full text-left flex items-start gap-2 px-2.5 py-2 rounded-lg transition-colors',
                  activeConvo === c.id
                    ? 'bg-primary/8 text-primary border border-primary/12'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                )}
              >
                <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium truncate leading-tight">{c.title}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">{c.when}</p>
                </div>
              </button>
            ))}
          </div>

          <div className="px-2.5 py-3 border-t border-border/80 shrink-0 min-w-[224px]">
            <div className="flex items-center gap-2 px-1 py-1">
              <span
                className="w-7 h-7 rounded-full border flex items-center justify-center shrink-0"
                style={{ background: '#FEF3EC', borderColor: '#F5C9A3' }}
              >
                <Brain className="h-3.5 w-3.5" style={{ color: '#D25F2A' }} />
              </span>
              <span className="truncate text-[13px] font-medium text-foreground">PricePulse AI</span>
            </div>
          </div>
        </aside>

        {/* ── Main chat area ────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

          {/* Header */}
          <div className="h-14 border-b border-border flex items-center px-4 gap-3 shrink-0">
            {!sidebarOpen && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-colors shrink-0"
              >
                <PanelLeftOpen className="h-3.5 w-3.5" />
              </button>
            )}
            <div
              className="w-7 h-7 rounded-full border flex items-center justify-center shrink-0"
              style={{ background: '#FEF3EC', borderColor: '#F5C9A3' }}
            >
              <Brain className="h-3.5 w-3.5" style={{ color: '#D25F2A' }} />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground leading-none">Intelligence</h1>
              <p className="text-[11px] text-muted-foreground mt-0.5">AI assistant for your venue</p>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-[11px] text-muted-foreground">Online</span>
            </div>
          </div>

          {/* Messages / empty state */}
          <div className="flex-1 overflow-y-auto">
            {isEmpty ? (
              /* ── Empty state ── */
              <div className="h-full flex flex-col items-center justify-center px-6 pb-8">
                <div
                  className="w-14 h-14 rounded-2xl border flex items-center justify-center mb-5"
                  style={{ background: '#FEF3EC', borderColor: '#F5C9A3' }}
                >
                  <Brain className="h-7 w-7" style={{ color: '#D25F2A' }} />
                </div>
                <h2 className="text-xl font-semibold text-foreground tracking-tight mb-1.5">
                  What can I help you with?
                </h2>
                <p className="text-sm text-muted-foreground text-center max-w-[360px] mb-8 leading-relaxed">
                  Ask anything about your menus, pricing, bookings, or inventory. I have live access to all your venue data.
                </p>

                <div className="grid grid-cols-2 gap-2 w-full max-w-[600px]" style={{ gridAutoRows: '1fr' }}>
                  {SUGGESTIONS.map(({ icon: Icon, text }) => (
                    <button
                      key={text}
                      onClick={() => sendMessage(text)}
                      className="flex items-center gap-3 text-left px-4 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/4 transition-colors group h-16"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground/60 group-hover:text-primary shrink-0 transition-colors" />
                      <span className="text-[13px] text-foreground/75 group-hover:text-foreground transition-colors leading-snug">
                        {text}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* ── Message thread ── */
              <div className="max-w-[720px] mx-auto px-6 py-8 space-y-7">
                {messages.map((msg, i) =>
                  msg.role === 'user'
                    ? <UserBubble key={msg.id} content={msg.content} />
                    : <AiBubble key={msg.id} msg={msg} isLast={i === messages.length - 1} />
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="shrink-0 px-6 pb-5 pt-4">
            <div className="max-w-[720px] mx-auto">
              <div className="rounded-2xl border border-border bg-background shadow-sm">

                <div className="px-4 pt-3.5 pb-1">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Message Intelligence…"
                    rows={1}
                    className="w-full resize-none bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground/40 outline-none leading-relaxed min-h-[28px]"
                    style={{ maxHeight: 180 }}
                  />
                </div>

                <div className="flex items-center gap-2 px-3 pb-3 pt-1">
                  <button className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 transition-colors">
                    <Plus className="h-4 w-4" />
                  </button>

                  <button className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-border/70 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
                    <Zap className="h-3 w-3" />
                    <span>Venue context</span>
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </button>

                  <button
                    onClick={() => setShowMap(true)}
                    className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-border/70 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
                  >
                    <Map className="h-3 w-3" />
                    <span>Map intelligence</span>
                  </button>

                  <div className="ml-auto flex items-center gap-2">
                    <button className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors">
                      <span>PricePulse AI</span>
                      <ChevronDown className="h-3 w-3 opacity-60" />
                    </button>

                    <button
                      onClick={() => loading ? undefined : sendMessage(input)}
                      disabled={!input.trim() && !loading}
                      className={cn(
                        'flex items-center justify-center w-7 h-7 rounded-lg transition-all',
                        loading
                          ? 'text-white'
                          : input.trim()
                            ? 'text-white hover:opacity-90 shadow-sm'
                            : 'bg-muted/60 text-muted-foreground/30 cursor-not-allowed',
                      )}
                      style={loading || input.trim() ? { background: '#D25F2A' } : undefined}
                    >
                      {loading
                        ? <Square className="h-3 w-3 fill-current" />
                        : <ArrowUp className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

              </div>
              <p className="text-center text-[10.5px] text-muted-foreground/40 mt-2">
                PricePulse AI can make mistakes. Verify important decisions.
              </p>
            </div>
          </div>

        </div>
      </div>

      {showMap && <MapIntelligencePanel onClose={() => setShowMap(false)} />}

    </AppLayout>
  );
}

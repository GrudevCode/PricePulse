import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn, formatMultiplier } from '@/lib/utils';
import { Send, Bot, User, Zap, Sparkles } from 'lucide-react';
import { pricingApi } from '@/lib/api';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  recommendation?: { overallMultiplier: number; confidence: string };
  timestamp: Date;
}

const QUICK_QUESTIONS = [
  { label: 'Price at 2am?',    message: 'What should our prices be at 2am tonight?' },
  { label: 'Run a promo?',     message: 'Should I run a promotion right now? What would be most effective?' },
  { label: 'Rain stops?',      message: 'What if it stops raining — how should pricing change?' },
  { label: 'Concert ended',    message: 'A concert just ended nearby — what should we do with our prices right now?' },
];

// Strip JSON code blocks (internal recommendation objects) before rendering
function stripJsonBlocks(text: string) {
  return text.replace(/```json[\s\S]*?```/g, '').trim();
}

interface ChatPanelProps {
  venueId: string;
}

export function ChatPanel({ venueId }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        "Hi! I'm **PricePulse AI**. I have full context on your venue's current signals, demand score, and menu pricing.\n\nAsk me anything about pricing strategy, or try one of the quick questions below.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, [messages, isLoading]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;

    const userMsg: Message = { role: 'user', content: text, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
      const resp = await pricingApi.chat(venueId, text, history);
      const { response, recommendation } = resp.data.data;
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: response,
        recommendation,
        timestamp: new Date(),
      }]);
    } catch {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        timestamp: new Date(),
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-background">
      {/* Header */}
      <div className="pb-3 pt-4 px-4 border-b border-border shrink-0 flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-primary/12 border border-primary/20 flex items-center justify-center">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="text-[13px] font-semibold tracking-tight">PricePulse AI</span>
        <Badge variant="success" className="text-xs ml-auto">
          <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full mr-1 live-pulse" />
          Live context
        </Badge>
      </div>

      {/* Messages — scrollable */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0 px-3 py-3 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={cn('flex gap-2.5', msg.role === 'user' && 'flex-row-reverse')}>
            {/* Avatar */}
            <div className={cn(
              'w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-1',
              msg.role === 'assistant'
                ? 'bg-primary/20 border border-primary/30'
                : 'bg-secondary border border-border'
            )}>
              {msg.role === 'assistant'
                ? <Bot className="h-3 w-3 text-primary" />
                : <User className="h-3 w-3 text-muted-foreground" />}
            </div>

            <div className={cn('min-w-0 flex-1 space-y-1.5', msg.role === 'user' && 'items-end flex flex-col')}>
              {/* Bubble */}
            <div className={cn(
              'rounded-2xl px-3.5 py-2.5 text-sm max-w-full',
              msg.role === 'assistant'
                ? 'bg-white border border-border text-foreground shadow-sm'
                : 'bg-primary/10 border border-primary/20 text-foreground'
            )}>
                {msg.role === 'assistant' ? (
                  <div className="chat-md max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {stripJsonBlocks(msg.content)}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                )}
              </div>

              {/* Inline recommendation card */}
              {msg.recommendation && (
                <div className="bg-green-500/10 border border-green-500/30 rounded-xl px-3 py-2.5 flex items-center gap-3">
                  <Zap className="h-4 w-4 text-green-400 shrink-0" />
                  <div>
                    <div className="text-[10px] font-semibold text-green-400/70 uppercase tracking-wider mb-0.5">
                      Price Recommendation
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-bold text-green-400 font-mono">
                        {formatMultiplier(msg.recommendation.overallMultiplier)}
                      </span>
                      <Badge
                        variant={
                          msg.recommendation.confidence === 'high' ? 'success' :
                          msg.recommendation.confidence === 'medium' ? 'warning' : 'danger'
                        }
                        className="text-xs"
                      >
                        {msg.recommendation.confidence}
                      </Badge>
                    </div>
                  </div>
                </div>
              )}

              <div className={cn(
                'text-[10px] text-muted-foreground/50',
                msg.role === 'user' && 'text-right'
              )}>
                {msg.timestamp.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {isLoading && (
          <div className="flex gap-2.5">
            <div className="w-6 h-6 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0">
              <Bot className="h-3 w-3 text-primary" />
            </div>
            <div className="bg-white border border-border rounded-2xl px-3.5 py-3 shadow-sm">
              <div className="flex gap-1 items-center h-4">
                <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick questions + input */}
      <div className="shrink-0 px-3 pb-3 pt-2.5 border-t border-border space-y-2.5 bg-background">
        <div className="flex flex-wrap gap-1.5">
          {QUICK_QUESTIONS.map((q) => (
            <button
              key={q.label}
              onClick={() => sendMessage(q.message)}
              disabled={isLoading}
              className="text-[11px] bg-secondary hover:bg-secondary/60 border border-border rounded-full px-2.5 py-1 transition-colors disabled:opacity-40 text-muted-foreground hover:text-foreground font-medium"
            >
              {q.label}
            </button>
          ))}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); sendMessage(input); }} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about pricing strategy…"
            disabled={isLoading}
            className="flex-1 text-sm h-9"
          />
          <Button
            type="submit"
            size="icon"
            className="h-9 w-9 shrink-0"
            disabled={!input.trim() || isLoading}
          >
            <Send className="h-3.5 w-3.5" />
          </Button>
        </form>
      </div>
    </div>
  );
}

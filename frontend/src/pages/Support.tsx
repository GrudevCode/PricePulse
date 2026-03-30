import { useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { cn } from '@/lib/utils';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  BookOpen, HelpCircle, PlayCircle, Ticket,
  ChevronDown, ChevronUp, ExternalLink, Search,
  FileText, Zap, BarChart2, Settings, ShieldCheck,
  Check, Clock, AlertCircle,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'docs' | 'faq' | 'tutorials' | 'ticket';

// ── Docs tab ──────────────────────────────────────────────────────────────────

interface DocArticle {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  title: string;
  description: string;
  tag?: string;
  tagColor?: string;
  href?: string;
}

const DOC_SECTIONS: { heading: string; articles: DocArticle[] }[] = [
  {
    heading: 'Getting started',
    articles: [
      {
        icon: Zap,
        iconBg: 'bg-amber-50',
        iconColor: 'text-amber-500',
        title: 'Quick-start guide',
        description: 'Set up your first venue, connect a POS, and publish a live-pricing menu in under 10 minutes.',
        tag: 'Recommended',
        tagColor: 'bg-primary/10 text-primary border-primary/20',
      },
      {
        icon: Settings,
        iconBg: 'bg-gray-100',
        iconColor: 'text-gray-500',
        title: 'Venue & menu setup',
        description: 'Create venues, build menu categories, and configure base prices.',
      },
      {
        icon: ShieldCheck,
        iconBg: 'bg-emerald-50',
        iconColor: 'text-emerald-500',
        title: 'User roles & permissions',
        description: 'Manage team members and control what each role can view or edit.',
      },
    ],
  },
  {
    heading: 'Pricing engine',
    articles: [
      {
        icon: BarChart2,
        iconBg: 'bg-blue-50',
        iconColor: 'text-blue-500',
        title: 'How dynamic pricing works',
        description: 'Understand occupancy signals, event detection, and competitor rate scraping.',
      },
      {
        icon: FileText,
        iconBg: 'bg-violet-50',
        iconColor: 'text-violet-500',
        title: 'Pricing rules & constraints',
        description: 'Set price floors, ceilings, blackout dates, and step-size limits.',
      },
    ],
  },
  {
    heading: 'Integrations',
    articles: [
      {
        icon: Zap,
        iconBg: 'bg-yellow-50',
        iconColor: 'text-yellow-500',
        title: 'Connecting Square, Toast & Lightspeed',
        description: 'Step-by-step OAuth and token-based integration guides for every supported POS.',
      },
      {
        icon: FileText,
        iconBg: 'bg-cyan-50',
        iconColor: 'text-cyan-500',
        title: 'Custom API integration',
        description: 'Map any REST endpoint to PricePulse using our configurable field mapping.',
        tag: 'Advanced',
        tagColor: 'bg-secondary text-muted-foreground border-border',
      },
    ],
  },
];

function DocsTab() {
  const [search, setSearch] = useState('');
  const query = search.toLowerCase();

  const filtered = DOC_SECTIONS.map((sec) => ({
    ...sec,
    articles: sec.articles.filter(
      (a) => a.title.toLowerCase().includes(query) || a.description.toLowerCase().includes(query),
    ),
  })).filter((sec) => sec.articles.length > 0);

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-10">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search documentation…"
          className="w-full h-10 pl-9 pr-4 border border-border rounded-xl text-sm bg-white outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 placeholder:text-muted-foreground/60"
        />
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No articles found for &ldquo;{search}&rdquo;
        </div>
      )}

      {filtered.map((sec) => (
        <section key={sec.heading}>
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
              {sec.heading}
            </h2>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
            {sec.articles.map((art) => (
              <div
                key={art.title}
                className="flex items-start gap-4 px-4 py-4 bg-white hover:bg-gray-50/60 transition-colors cursor-pointer group"
              >
                <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5', art.iconBg)}>
                  <art.icon className={cn('h-5 w-5', art.iconColor)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    <span className="text-sm font-semibold text-foreground">{art.title}</span>
                    {art.tag && (
                      <span className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5 border', art.tagColor)}>
                        {art.tag}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{art.description}</p>
                </div>
                <ExternalLink className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 mt-1.5 transition-colors" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ── FAQ tab ───────────────────────────────────────────────────────────────────

const FAQS = [
  {
    q: 'How does dynamic pricing affect my existing POS system?',
    a: 'PricePulse sits on top of your POS — it reads your current prices and pushes updated prices back via the POS API. Your staff and hardware require no changes; updated prices appear automatically on terminals and digital menus.',
  },
  {
    q: 'Can I set minimum and maximum price limits?',
    a: 'Yes. Every item has configurable floor (minimum) and ceiling (maximum) prices. The AI engine will never suggest a price outside these bounds, and you\'ll receive a notification any time the engine reaches a limit.',
  },
  {
    q: 'How often does the pricing engine re-calculate prices?',
    a: 'By default, prices are evaluated every 15 minutes. You can increase the frequency to every 5 minutes or decrease it to hourly in your venue settings. Price changes are only pushed if the new price differs by at least the configured step size.',
  },
  {
    q: 'Which POS systems are supported?',
    a: 'PricePulse natively supports Square, Toast POS, Lightspeed (Restaurant), and Wix Menus. A Custom API option lets you connect any REST-based POS. Native integrations for Revel, Aloha, and NCR are on the roadmap.',
  },
  {
    q: 'Is my data secure?',
    a: 'All data is encrypted at rest (AES-256) and in transit (TLS 1.3). POS credentials are stored using envelope encryption and are never exposed in plain text. We are SOC 2 Type II certified and conduct annual penetration tests.',
  },
  {
    q: 'Can I pause dynamic pricing for a specific day or menu?',
    a: 'Absolutely. Use the Menu Scheduler to assign a static menu to any date — the engine will skip re-pricing for those days. You can also disable dynamic pricing for individual items in the product editor.',
  },
  {
    q: 'How do I cancel my subscription?',
    a: 'You can cancel at any time from Settings → Billing. Your account remains active until the end of the current billing period. All your venue data is exportable as CSV before cancellation.',
  },
  {
    q: 'Does PricePulse work for multiple venues?',
    a: 'Yes. The PricePulse dashboard supports unlimited venues under one account. Each venue has its own menus, schedule, integrations, and pricing rules. You can view cross-venue analytics from the Home dashboard.',
  },
];

function FaqTab() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 space-y-2">
      {FAQS.map((faq, i) => (
        <div
          key={i}
          className={cn(
            'rounded-xl border transition-colors overflow-hidden',
            open === i ? 'border-primary/30 bg-primary/2' : 'border-border bg-white',
          )}
        >
          <button
            onClick={() => setOpen(open === i ? null : i)}
            className="w-full flex items-start gap-3 px-5 py-4 text-left"
          >
            <HelpCircle className={cn('h-4 w-4 mt-0.5 shrink-0 transition-colors', open === i ? 'text-primary' : 'text-muted-foreground/40')} />
            <span className="flex-1 text-sm font-medium text-foreground">{faq.q}</span>
            {open === i
              ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            }
          </button>
          {open === i && (
            <div className="px-5 pb-5 pl-12">
              <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Tutorials tab ─────────────────────────────────────────────────────────────

interface Tutorial {
  title: string;
  description: string;
  duration: string;
  tag: string;
  tagColor: string;
  thumb: string; // gradient classes
}

const TUTORIALS: Tutorial[] = [
  {
    title: 'Setting up your first venue',
    description: 'Walk through creating a venue, adding menus, and configuring baseline prices end-to-end.',
    duration: '6 min',
    tag: 'Beginner',
    tagColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    thumb: 'from-emerald-400 to-teal-500',
  },
  {
    title: 'Connecting a Square integration',
    description: 'Authorise Square via OAuth, map your existing menu items, and run a test sync.',
    duration: '4 min',
    tag: 'Integrations',
    tagColor: 'bg-blue-50 text-blue-700 border-blue-200',
    thumb: 'from-blue-400 to-indigo-500',
  },
  {
    title: 'Understanding the pricing engine',
    description: 'Deep-dive into how occupancy, competitor rates, and event signals drive price suggestions.',
    duration: '9 min',
    tag: 'Core concepts',
    tagColor: 'bg-violet-50 text-violet-700 border-violet-200',
    thumb: 'from-violet-400 to-purple-500',
  },
  {
    title: 'Using the Menu Scheduler',
    description: 'Paint menus onto the 12-month calendar, use range select, and apply quarterly templates.',
    duration: '5 min',
    tag: 'Feature guide',
    tagColor: 'bg-amber-50 text-amber-700 border-amber-200',
    thumb: 'from-amber-400 to-orange-500',
  },
  {
    title: 'Inventory management & alerts',
    description: 'Track stock levels, set par values, and use the database calendar to spot reorder windows.',
    duration: '7 min',
    tag: 'Feature guide',
    tagColor: 'bg-amber-50 text-amber-700 border-amber-200',
    thumb: 'from-rose-400 to-pink-500',
  },
  {
    title: 'Custom API integration walkthrough',
    description: 'Connect any REST-based POS using bearer auth, configure field mapping, and validate the sync.',
    duration: '12 min',
    tag: 'Advanced',
    tagColor: 'bg-gray-100 text-gray-600 border-gray-200',
    thumb: 'from-slate-400 to-gray-600',
  },
];

function TutorialsTab() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {TUTORIALS.map((t) => (
          <div
            key={t.title}
            className="rounded-xl border border-border bg-white overflow-hidden hover:shadow-md hover:border-primary/20 transition-all cursor-pointer group"
          >
            {/* Thumbnail */}
            <div className={cn('h-28 bg-gradient-to-br flex items-center justify-center', t.thumb)}>
              <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform">
                <PlayCircle className="h-7 w-7 text-white" />
              </div>
            </div>

            {/* Body */}
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5 border', t.tagColor)}>
                  {t.tag}
                </span>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground ml-auto">
                  <Clock className="h-3 w-3" />
                  {t.duration}
                </span>
              </div>
              <h3 className="text-[13px] font-semibold text-foreground mb-1">{t.title}</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">{t.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Submit Ticket tab ─────────────────────────────────────────────────────────

const CATEGORIES = [
  'Billing & payments',
  'Integrations',
  'Pricing engine',
  'Inventory',
  'Bookings',
  'Account & settings',
  'Bug report',
  'Feature request',
  'Other',
];

const PRIORITIES = [
  { value: 'low',    label: 'Low',      desc: 'General enquiry',   color: 'text-muted-foreground' },
  { value: 'medium', label: 'Medium',   desc: 'Something is off',  color: 'text-amber-600'        },
  { value: 'high',   label: 'High',     desc: 'Affects business',  color: 'text-red-600'          },
];

function TicketTab() {
  const [form, setForm] = useState({
    subject:  '',
    category: '',
    priority: 'medium',
    email:    '',
    message:  '',
  });
  const [submitted, setSubmitted] = useState(false);

  function set(field: string, value: string) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
  }

  const labelCls = 'block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5';
  const inputCls = 'w-full h-9 text-sm border border-border rounded-lg px-3 bg-white outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 placeholder:text-muted-foreground/50';

  if (submitted) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-10 text-center">
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <Check className="h-7 w-7 text-emerald-600" />
          </div>
          <h3 className="text-[16px] font-bold text-foreground mb-2">Ticket submitted</h3>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
            We've received your message and will respond to <strong>{form.email || 'your email'}</strong> within 24 hours.
          </p>
          <button
            onClick={() => { setSubmitted(false); setForm({ subject: '', category: '', priority: 'medium', email: '', message: '' }); }}
            className="mt-6 h-9 px-6 text-sm font-medium border border-border rounded-lg text-foreground hover:bg-secondary transition-colors"
          >
            Submit another ticket
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-8">
      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Email */}
        <div>
          <label className={labelCls}>Your email</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            placeholder="you@example.com"
            className={inputCls}
          />
        </div>

        {/* Subject */}
        <div>
          <label className={labelCls}>Subject</label>
          <input
            required
            value={form.subject}
            onChange={(e) => set('subject', e.target.value)}
            placeholder="Brief summary of your issue"
            className={inputCls}
          />
        </div>

        {/* Category */}
        <div>
          <label className={labelCls}>Category</label>
          <Select value={form.category || '__none__'} onValueChange={(v) => set('category', v === '__none__' ? '' : v)}>
            <SelectTrigger className={cn(inputCls, 'cursor-pointer')}>
              <SelectValue placeholder="Select a category..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Select a category...</SelectItem>
              {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Priority */}
        <div>
          <label className={labelCls}>Priority</label>
          <div className="grid grid-cols-3 gap-2">
            {PRIORITIES.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => set('priority', p.value)}
                className={cn(
                  'flex flex-col items-center gap-0.5 rounded-xl border py-3 px-2 text-center transition-colors',
                  form.priority === p.value
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border bg-white hover:bg-gray-50',
                )}
              >
                <AlertCircle className={cn('h-4 w-4', p.color)} />
                <span className="text-[11px] font-semibold text-foreground">{p.label}</span>
                <span className="text-[10px] text-muted-foreground">{p.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Message */}
        <div>
          <label className={labelCls}>Message</label>
          <textarea
            required
            rows={5}
            value={form.message}
            onChange={(e) => set('message', e.target.value)}
            placeholder="Please describe your issue in as much detail as possible, including any steps to reproduce it…"
            className="w-full text-sm border border-border rounded-lg px-3 py-2.5 bg-white outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 placeholder:text-muted-foreground/50 resize-none"
          />
        </div>

        <button
          type="submit"
          className="w-full h-10 text-sm font-semibold bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors"
        >
          Submit ticket
        </button>
      </form>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const TABS: { id: Tab; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { id: 'docs',     icon: BookOpen,    label: 'Documentation' },
  { id: 'faq',      icon: HelpCircle,  label: 'FAQ'           },
  { id: 'tutorials',icon: PlayCircle,  label: 'Tutorials'     },
  { id: 'ticket',   icon: Ticket,      label: 'Submit Ticket' },
];

export default function Support() {
  const [tab, setTab] = useState<Tab>('docs');

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden" style={{ animation: 'page-enter 0.25s ease both' }}>

        {/* ── Header ── */}
        <header className="shrink-0 h-14 border-b border-border px-6 flex items-center gap-4 bg-background">
          <div className="flex items-center gap-2 text-muted-foreground">
            <HelpCircle className="h-4 w-4" />
          </div>
          <span className="text-[15px] font-bold text-foreground tracking-tight">Support</span>

          <div className="flex-1" />

          <div className="hidden md:flex items-center gap-3">
            {[
              { label: 'Articles',  value: '7',   color: 'text-foreground'     },
              { label: 'FAQs',      value: String(FAQS.length), color: 'text-foreground' },
              { label: 'Tutorials', value: String(TUTORIALS.length), color: 'text-foreground' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <div className={cn('text-base font-bold tabular-nums', color)}>{value}</div>
                <div className="text-[10px] text-muted-foreground/60">{label}</div>
              </div>
            ))}
          </div>
        </header>

        {/* ── Mini navbar (tabs) ── */}
        <div className="shrink-0 border-b border-border bg-background px-6">
          <nav className="flex items-center gap-0">
            {TABS.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-[13px] font-medium border-b-2 transition-colors -mb-px',
                  tab === id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </nav>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto bg-gray-50/30">
          {tab === 'docs'      && <DocsTab />}
          {tab === 'faq'       && <FaqTab />}
          {tab === 'tutorials' && <TutorialsTab />}
          {tab === 'ticket'    && <TicketTab />}
        </div>

      </div>
    </AppLayout>
  );
}

import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { useAuthStore } from '@/store/authStore';
import { useVenueStore } from '@/store/venueStore';
import { cn } from '@/lib/utils';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Settings, User, Building2, Bell, Palette, CreditCard,
  Globe, Check, Eye, EyeOff, ChevronRight, AlertCircle,
  Sun, Moon, Monitor, Zap, Clock, Calendar, DollarSign,
  Shield, Trash2, Download, Plus,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'general' | 'profile' | 'venue' | 'notifications' | 'appearance' | 'billing';

// ── Shared primitives ─────────────────────────────────────────────────────────

const labelCls = 'block text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1.5';
const inputCls = 'w-full h-9 text-sm border border-border rounded-lg px-3 bg-white outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 placeholder:text-muted-foreground/50';

function SettingRow({
  label,
  description,
  children,
  last = false,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-6 py-4', !last && 'border-b border-border/60')}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={cn(
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none',
        value ? 'bg-primary' : 'bg-gray-200',
      )}
    >
      <span
        className={cn(
          'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
          value ? 'translate-x-4.5' : 'translate-x-0.5',
        )}
        style={{ transform: value ? 'translateX(18px)' : 'translateX(2px)' }}
      />
    </button>
  );
}

function SaveBar({ onSave, onDiscard }: { onSave: () => void; onDiscard: () => void }) {
  const [saved, setSaved] = useState(false);
  function handle() {
    onSave();
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }
  return (
    <div className="flex items-center justify-end gap-2 pt-6 mt-2 border-t border-border">
      <button
        type="button"
        onClick={onDiscard}
        className="h-9 px-4 text-sm border border-border rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
      >
        Discard
      </button>
      <button
        type="button"
        onClick={handle}
        className={cn(
          'flex items-center gap-1.5 h-9 px-5 text-sm font-semibold rounded-lg transition-colors',
          saved ? 'bg-emerald-600 text-white' : 'bg-primary text-white hover:bg-primary/90',
        )}
      >
        {saved ? <><Check className="h-3.5 w-3.5" />Saved</> : 'Save changes'}
      </button>
    </div>
  );
}

// ── General tab ───────────────────────────────────────────────────────────────

const LANGUAGES = [
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'fr',    label: 'Français' },
  { value: 'de',    label: 'Deutsch' },
  { value: 'es',    label: 'Español' },
  { value: 'it',    label: 'Italiano' },
  { value: 'pt',    label: 'Português' },
  { value: 'nl',    label: 'Nederlands' },
  { value: 'ja',    label: '日本語' },
  { value: 'zh',    label: '中文（简体）' },
  { value: 'ar',    label: 'العربية' },
];

const CURRENCIES = [
  { value: 'GBP', label: '£  British Pound (GBP)' },
  { value: 'USD', label: '$  US Dollar (USD)' },
  { value: 'EUR', label: '€  Euro (EUR)' },
  { value: 'AUD', label: 'A$  Australian Dollar (AUD)' },
  { value: 'CAD', label: 'C$  Canadian Dollar (CAD)' },
  { value: 'CHF', label: 'Fr  Swiss Franc (CHF)' },
  { value: 'JPY', label: '¥  Japanese Yen (JPY)' },
  { value: 'SGD', label: 'S$  Singapore Dollar (SGD)' },
  { value: 'AED', label: 'د.إ  UAE Dirham (AED)' },
  { value: 'NZD', label: 'NZ$  New Zealand Dollar (NZD)' },
  { value: 'HKD', label: 'HK$  Hong Kong Dollar (HKD)' },
  { value: 'MXN', label: '$  Mexican Peso (MXN)' },
  { value: 'BRL', label: 'R$  Brazilian Real (BRL)' },
];

const TIMEZONES = [
  { value: 'Europe/London',      label: 'London (GMT / BST)' },
  { value: 'Europe/Paris',       label: 'Paris (CET / CEST)' },
  { value: 'Europe/Berlin',      label: 'Berlin (CET / CEST)' },
  { value: 'Europe/Amsterdam',   label: 'Amsterdam (CET / CEST)' },
  { value: 'Europe/Madrid',      label: 'Madrid (CET / CEST)' },
  { value: 'Europe/Rome',        label: 'Rome (CET / CEST)' },
  { value: 'Europe/Zurich',      label: 'Zurich (CET / CEST)' },
  { value: 'Europe/Istanbul',    label: 'Istanbul (TRT)' },
  { value: 'Europe/Moscow',      label: 'Moscow (MSK)' },
  { value: 'America/New_York',   label: 'New York (ET)' },
  { value: 'America/Chicago',    label: 'Chicago (CT)' },
  { value: 'America/Denver',     label: 'Denver (MT)' },
  { value: 'America/Los_Angeles','label': 'Los Angeles (PT)' },
  { value: 'America/Toronto',    label: 'Toronto (ET)' },
  { value: 'America/Vancouver',  label: 'Vancouver (PT)' },
  { value: 'America/Sao_Paulo',  label: 'São Paulo (BRT)' },
  { value: 'America/Mexico_City',label: 'Mexico City (CST)' },
  { value: 'Asia/Dubai',         label: 'Dubai (GST)' },
  { value: 'Asia/Singapore',     label: 'Singapore (SGT)' },
  { value: 'Asia/Tokyo',         label: 'Tokyo (JST)' },
  { value: 'Asia/Shanghai',      label: 'Shanghai (CST)' },
  { value: 'Asia/Kolkata',       label: 'Mumbai / Delhi (IST)' },
  { value: 'Asia/Bangkok',       label: 'Bangkok (ICT)' },
  { value: 'Asia/Seoul',         label: 'Seoul (KST)' },
  { value: 'Australia/Sydney',   label: 'Sydney (AEST / AEDT)' },
  { value: 'Australia/Melbourne',label: 'Melbourne (AEST / AEDT)' },
  { value: 'Pacific/Auckland',   label: 'Auckland (NZST / NZDT)' },
  { value: 'Africa/Johannesburg',label: 'Johannesburg (SAST)' },
  { value: 'Africa/Cairo',       label: 'Cairo (EET)' },
  { value: 'UTC',                label: 'UTC' },
];

const DATE_FORMATS = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY  (31/03/2026)' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY  (03/31/2026)' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD  (2026-03-31)' },
  { value: 'D MMM YYYY', label: 'D MMM YYYY  (31 Mar 2026)' },
  { value: 'MMMM D, YYYY', label: 'MMMM D, YYYY  (March 31, 2026)' },
];

const WEEK_STARTS = [
  { value: 'monday',   label: 'Monday' },
  { value: 'sunday',   label: 'Sunday' },
  { value: 'saturday', label: 'Saturday' },
];

const NUMBER_FORMATS = [
  { value: 'en-GB', label: '1,234.56  (comma thousands, dot decimal)' },
  { value: 'de',    label: '1.234,56  (dot thousands, comma decimal)' },
  { value: 'fr',    label: '1 234,56  (space thousands, comma decimal)' },
];

function GeneralTab() {
  const [lang,      setLang]      = useState('en-GB');
  const [currency,  setCurrency]  = useState('GBP');
  const [tz,        setTz]        = useState('Europe/London');
  const [dateFormat,setDateFormat]= useState('DD/MM/YYYY');
  const [timeFormat,setTimeFormat]= useState('24h');
  const [weekStart, setWeekStart] = useState('monday');
  const [numFormat, setNumFormat] = useState('en-GB');
  const init = { lang: 'en-GB', currency: 'GBP', tz: 'Europe/London', dateFormat: 'DD/MM/YYYY', timeFormat: '24h', weekStart: 'monday', numFormat: 'en-GB' };

  return (
    <div className="space-y-8 max-w-2xl">

      <section>
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Language & Region</h2>
        <div className="h-px bg-border mb-4" />
        <div className="rounded-xl border border-border bg-white divide-y divide-border/60 overflow-hidden">

          <div className="px-5">
            <SettingRow label="Display language" description="The language used throughout the PricePulse interface.">
              <div className="relative">
                <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Select value={lang} onValueChange={setLang}>
                  <SelectTrigger className="w-52 pl-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{LANGUAGES.map((l) => <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </SettingRow>
          </div>

          <div className="px-5">
            <SettingRow label="Currency" description="Used for all price displays, cost calculations, and exports.">
              <div className="relative">
                <DollarSign className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="w-52 pl-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </SettingRow>
          </div>

          <div className="px-5">
            <SettingRow label="Timezone" description="Schedules, timestamps, and reports will use this timezone.">
              <div className="relative">
                <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Select value={tz} onValueChange={setTz}>
                  <SelectTrigger className="w-64 pl-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{TIMEZONES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </SettingRow>
          </div>

          <div className="px-5">
            <SettingRow label="Number format" description="How numbers are formatted in tables and reports." last>
              <Select value={numFormat} onValueChange={setNumFormat}>
                <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
                <SelectContent>{NUMBER_FORMATS.map((n) => <SelectItem key={n.value} value={n.value}>{n.label}</SelectItem>)}</SelectContent>
              </Select>
            </SettingRow>
          </div>

        </div>
      </section>

      <section>
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Date & Time</h2>
        <div className="h-px bg-border mb-4" />
        <div className="rounded-xl border border-border bg-white divide-y divide-border/60 overflow-hidden">

          <div className="px-5">
            <SettingRow label="Date format" description="How dates are displayed across the app.">
              <div className="relative">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Select value={dateFormat} onValueChange={setDateFormat}>
                  <SelectTrigger className="w-64 pl-8"><SelectValue /></SelectTrigger>
                  <SelectContent>{DATE_FORMATS.map((d) => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </SettingRow>
          </div>

          <div className="px-5">
            <SettingRow label="Time format" description="12-hour (AM/PM) or 24-hour clock.">
              <div className="flex items-center gap-1 bg-secondary border border-border rounded-lg p-0.5">
                {[{ v: '24h', l: '24h' }, { v: '12h', l: '12h AM/PM' }].map(({ v, l }) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setTimeFormat(v)}
                    className={cn(
                      'h-7 px-3 rounded-md text-xs font-medium transition-colors',
                      timeFormat === v ? 'bg-white text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </SettingRow>
          </div>

          <div className="px-5">
            <SettingRow label="First day of week" description="Used in calendar and scheduler views." last>
              <Select value={weekStart} onValueChange={setWeekStart}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>{WEEK_STARTS.map((w) => <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>)}</SelectContent>
              </Select>
            </SettingRow>
          </div>

        </div>
      </section>

      <SaveBar onSave={() => {}} onDiscard={() => { setLang(init.lang); setCurrency(init.currency); setTz(init.tz); setDateFormat(init.dateFormat); setTimeFormat(init.timeFormat); setWeekStart(init.weekStart); setNumFormat(init.numFormat); }} />
    </div>
  );
}

// ── Profile tab ───────────────────────────────────────────────────────────────

function ProfileTab() {
  const { user } = useAuthStore();
  const [name,     setName]     = useState(user?.name  ?? '');
  const [email,    setEmail]    = useState(user?.email ?? '');
  const [phone,    setPhone]    = useState('');
  const [jobTitle, setJobTitle] = useState('');

  const [curPw,    setCurPw]    = useState('');
  const [newPw,    setNewPw]    = useState('');
  const [confPw,   setConfPw]   = useState('');
  const [showPw,   setShowPw]   = useState(false);

  const initials = name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase() ?? '').join('') || 'PP';
  const pwMatch = newPw && confPw && newPw !== confPw;
  const pwStrength = newPw.length === 0 ? 0 : newPw.length < 8 ? 1 : newPw.length < 12 ? 2 : 3;
  const pwColors = ['', 'bg-red-400', 'bg-amber-400', 'bg-emerald-500'];
  const pwLabels = ['', 'Weak', 'Good', 'Strong'];

  return (
    <div className="space-y-8 max-w-2xl">

      <section>
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Personal information</h2>
        <div className="h-px bg-border mb-4" />
        <div className="rounded-xl border border-border bg-white overflow-hidden">
          <div className="px-5 py-5 flex items-center gap-5 border-b border-border/60">
            <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center text-xl font-bold text-primary shrink-0">
              {initials}
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{name || 'Your Name'}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{email}</p>
              <button type="button" className="mt-2 text-xs text-primary hover:underline font-medium">
                Change avatar
              </button>
            </div>
          </div>

          <div className="px-5 grid grid-cols-2 gap-4 py-5">
            <div>
              <label className={labelCls}>Full name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Jane Smith" />
            </div>
            <div>
              <label className={labelCls}>Job title</label>
              <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} className={inputCls} placeholder="Operations Manager" />
            </div>
            <div>
              <label className={labelCls}>Email address</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="you@example.com" />
            </div>
            <div>
              <label className={labelCls}>Phone number</label>
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="+44 7700 900000" />
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Change password</h2>
        <div className="h-px bg-border mb-4" />
        <div className="rounded-xl border border-border bg-white px-5 py-5 space-y-4">
          <div>
            <label className={labelCls}>Current password</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={curPw} onChange={(e) => setCurPw(e.target.value)} className={cn(inputCls, 'pr-9')} placeholder="••••••••" />
              <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>New password</label>
              <input type={showPw ? 'text' : 'password'} value={newPw} onChange={(e) => setNewPw(e.target.value)} className={inputCls} placeholder="Min. 8 characters" />
              {newPw.length > 0 && (
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex-1 h-1 rounded-full bg-gray-100 overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all', pwColors[pwStrength])} style={{ width: `${(pwStrength / 3) * 100}%` }} />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{pwLabels[pwStrength]}</span>
                </div>
              )}
            </div>
            <div>
              <label className={labelCls}>Confirm password</label>
              <input type={showPw ? 'text' : 'password'} value={confPw} onChange={(e) => setConfPw(e.target.value)} className={cn(inputCls, pwMatch && 'border-red-300 focus:border-red-400')} placeholder="Repeat new password" />
              {pwMatch && <p className="text-[10px] text-red-500 mt-1">Passwords don&apos;t match</p>}
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Danger zone</h2>
        <div className="h-px bg-border mb-4" />
        <div className="rounded-xl border border-red-200 bg-red-50/40 px-5 py-4 flex items-center gap-4">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-700">Delete account</p>
            <p className="text-xs text-red-600/80 mt-0.5">Permanently delete your account and all associated data. This cannot be undone.</p>
          </div>
          <button type="button" className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium border border-red-300 rounded-lg text-red-600 hover:bg-red-100 transition-colors shrink-0">
            <Trash2 className="h-3.5 w-3.5" />
            Delete account
          </button>
        </div>
      </section>

      <SaveBar onSave={() => {}} onDiscard={() => { setName(user?.name ?? ''); setEmail(user?.email ?? ''); setPhone(''); setJobTitle(''); setCurPw(''); setNewPw(''); setConfPw(''); }} />
    </div>
  );
}

// ── Venue tab ─────────────────────────────────────────────────────────────────

const CUISINE_TYPES = [
  'Restaurant', 'Bar & Grill', 'Café', 'Pub', 'Fine Dining',
  'Fast Casual', 'Food Truck', 'Bakery', 'Hotel', 'Event Venue',
  'Night Club', 'Sports Bar', 'Other',
];

const PRICING_MODES = [
  { value: 'auto',    label: 'Automatic',  desc: 'Engine applies price changes automatically.' },
  { value: 'suggest', label: 'Suggestions', desc: 'Engine suggests changes; you approve each one.' },
  { value: 'manual',  label: 'Manual',     desc: 'All price changes are made by you manually.' },
];

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function VenueTab() {
  const { id: venueId } = useParams<{ id: string }>();
  const { venues } = useVenueStore();
  const venue = venues.find((v) => v.id === venueId) ?? venues[0];

  const [venueName, setVenueName] = useState(String(venue?.name ?? ''));
  const [cuisineType, setCuisineType] = useState('Restaurant');
  const [capacity, setCapacity]   = useState(String(venue?.capacity ?? '80'));
  const [pricingMode, setPricingMode] = useState(venue?.pricingMode ?? 'auto');
  const [addr1,  setAddr1]  = useState('');
  const [addr2,  setAddr2]  = useState('');
  const [city,   setCity]   = useState('');
  const [county, setCounty] = useState('');
  const [postcode, setPostcode] = useState('');
  const [country, setCountry]  = useState('GB');

  const [hours, setHours] = useState<Record<string, { open: boolean; from: string; to: string }>>(
    Object.fromEntries(DAYS.map((d) => [d, { open: true, from: '17:00', to: '23:00' }]))
  );

  function toggleDay(day: string) {
    setHours((h) => ({ ...h, [day]: { ...h[day], open: !h[day].open } }));
  }
  function setDayTime(day: string, field: 'from' | 'to', val: string) {
    setHours((h) => ({ ...h, [day]: { ...h[day], [field]: val } }));
  }

  return (
    <div className="space-y-8 max-w-2xl">

      <section>
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Venue details</h2>
        <div className="h-px bg-border mb-4" />
        <div className="rounded-xl border border-border bg-white px-5 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelCls}>Venue name</label>
              <input value={venueName} onChange={(e) => setVenueName(e.target.value)} className={inputCls} placeholder="The Grand Brasserie" />
            </div>
            <div>
              <label className={labelCls}>Venue type</label>
              <Select value={cuisineType} onValueChange={setCuisineType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CUISINE_TYPES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className={labelCls}>Seating capacity</label>
              <input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} className={inputCls} placeholder="80" />
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Address</h2>
        <div className="h-px bg-border mb-4" />
        <div className="rounded-xl border border-border bg-white px-5 py-5 space-y-4">
          <div>
            <label className={labelCls}>Address line 1</label>
            <input value={addr1} onChange={(e) => setAddr1(e.target.value)} className={inputCls} placeholder="12 Market Street" />
          </div>
          <div>
            <label className={labelCls}>Address line 2 <span className="text-muted-foreground/40 normal-case tracking-normal font-normal">(optional)</span></label>
            <input value={addr2} onChange={(e) => setAddr2(e.target.value)} className={inputCls} placeholder="Suite 4" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>City</label>
              <input value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} placeholder="London" />
            </div>
            <div>
              <label className={labelCls}>County / State</label>
              <input value={county} onChange={(e) => setCounty(e.target.value)} className={inputCls} placeholder="Greater London" />
            </div>
            <div>
              <label className={labelCls}>Postcode / ZIP</label>
              <input value={postcode} onChange={(e) => setPostcode(e.target.value)} className={inputCls} placeholder="EC1A 1BB" />
            </div>
            <div>
              <label className={labelCls}>Country</label>
              <Select value={country} onValueChange={setCountry}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[
                    ['GB','United Kingdom'],['US','United States'],['AU','Australia'],['CA','Canada'],
                    ['FR','France'],['DE','Germany'],['ES','Spain'],['IT','Italy'],['NL','Netherlands'],
                    ['CH','Switzerland'],['IE','Ireland'],['NZ','New Zealand'],['SG','Singapore'],
                    ['AE','United Arab Emirates'],['JP','Japan'],['ZA','South Africa'],
                  ].map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Pricing mode</h2>
        <div className="h-px bg-border mb-4" />
        <div className="grid grid-cols-3 gap-3">
          {PRICING_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setPricingMode(m.value as 'auto' | 'suggest' | 'manual')}
              className={cn(
                'flex flex-col gap-1 rounded-xl border p-4 text-left transition-colors',
                pricingMode === m.value
                  ? 'border-primary/40 bg-primary/5 shadow-sm'
                  : 'border-border bg-white hover:bg-gray-50',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">{m.label}</span>
                {pricingMode === m.value && <Check className="h-3.5 w-3.5 text-primary" />}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{m.desc}</p>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Operating hours</h2>
        <div className="h-px bg-border mb-4" />
        <div className="rounded-xl border border-border bg-white overflow-hidden divide-y divide-border/60">
          {DAYS.map((day, i) => {
            const h = hours[day];
            return (
              <div key={day} className={cn('flex items-center gap-4 px-5 py-3', !h.open && 'opacity-50')}>
                <div className="w-24 shrink-0">
                  <span className="text-sm font-medium text-foreground">{day.slice(0, 3)}</span>
                </div>
                <Toggle value={h.open} onChange={() => toggleDay(day)} />
                {h.open ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="time"
                      value={h.from}
                      onChange={(e) => setDayTime(day, 'from', e.target.value)}
                      className="h-8 text-sm border border-border rounded-lg px-2.5 bg-white outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                    />
                    <span className="text-muted-foreground text-xs">to</span>
                    <input
                      type="time"
                      value={h.to}
                      onChange={(e) => setDayTime(day, 'to', e.target.value)}
                      className="h-8 text-sm border border-border rounded-lg px-2.5 bg-white outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                    />
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground italic">Closed</span>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <SaveBar onSave={() => {}} onDiscard={() => { setVenueName(String(venue?.name ?? '')); }} />
    </div>
  );
}

// ── Notifications tab ─────────────────────────────────────────────────────────

interface NotifSetting {
  id: string;
  label: string;
  description: string;
  email: boolean;
  push: boolean;
}

function NotificationsTab() {
  const [emailMaster, setEmailMaster] = useState(true);
  const [pushMaster,  setPushMaster]  = useState(true);
  const [digestFreq,  setDigestFreq]  = useState('weekly');
  const [stockThresh, setStockThresh] = useState('80');

  const [notifs, setNotifs] = useState<NotifSetting[]>([
    { id: 'price_change',  label: 'Price change applied',   description: 'When the engine auto-applies a price update.',     email: true,  push: true  },
    { id: 'price_suggest', label: 'Price suggestion ready', description: 'When a new suggestion is awaiting approval.',      email: true,  push: true  },
    { id: 'low_stock',     label: 'Low inventory alert',    description: 'When an item drops below its par level threshold.', email: true,  push: false },
    { id: 'critical_stock',label: 'Critical stock warning', description: 'When an item reaches below 40% of par level.',     email: true,  push: true  },
    { id: 'high_occupancy',label: 'High occupancy trigger', description: 'When occupancy exceeds 80% and pricing adjusts.',  email: false, push: true  },
    { id: 'new_booking',   label: 'New booking received',   description: 'When a new table booking is confirmed.',           email: false, push: false },
    { id: 'integration',   label: 'Integration sync error', description: 'When a POS sync fails or returns an error.',       email: true,  push: true  },
    { id: 'weekly_digest', label: 'Weekly performance digest','description': 'Summary of pricing, revenue and stock events.', email: true,  push: false },
  ]);

  function toggle(id: string, channel: 'email' | 'push') {
    setNotifs((prev) => prev.map((n) => n.id === id ? { ...n, [channel]: !n[channel] } : n));
  }

  return (
    <div className="space-y-8 max-w-2xl">

      <section>
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Master controls</h2>
        <div className="h-px bg-border mb-4" />
        <div className="rounded-xl border border-border bg-white divide-y divide-border/60 overflow-hidden">
          <div className="px-5">
            <SettingRow label="Email notifications" description="Receive notifications via email to your account address.">
              <Toggle value={emailMaster} onChange={setEmailMaster} />
            </SettingRow>
          </div>
          <div className="px-5">
            <SettingRow label="Push notifications" description="In-app and browser push notifications." last>
              <Toggle value={pushMaster} onChange={setPushMaster} />
            </SettingRow>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Notification events</h2>
        <div className="h-px bg-border mb-4" />
        <div className="rounded-xl border border-border bg-white overflow-hidden">
          {/* Column headers */}
          <div className="flex items-center gap-4 px-5 py-2.5 bg-gray-50/80 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            <div className="flex-1">Event</div>
            <div className="w-12 text-center">Email</div>
            <div className="w-12 text-center">Push</div>
          </div>
          {notifs.map((n, i) => (
            <div key={n.id} className={cn('flex items-center gap-4 px-5 py-3.5', i < notifs.length - 1 && 'border-b border-border/50')}>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{n.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{n.description}</p>
              </div>
              <div className="w-12 flex justify-center">
                <Toggle value={n.email && emailMaster} onChange={() => toggle(n.id, 'email')} />
              </div>
              <div className="w-12 flex justify-center">
                <Toggle value={n.push && pushMaster} onChange={() => toggle(n.id, 'push')} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Alert preferences</h2>
        <div className="h-px bg-border mb-4" />
        <div className="rounded-xl border border-border bg-white divide-y divide-border/60 overflow-hidden">
          <div className="px-5">
            <SettingRow label="Digest frequency" description="How often to send the performance digest email.">
              <Select value={digestFreq} onValueChange={setDigestFreq}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="never">Never</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
          </div>
          <div className="px-5">
            <SettingRow label="Low stock threshold" description="Alert when on-hand stock falls below this % of par level." last>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="10" max="100"
                  value={stockThresh}
                  onChange={(e) => setStockThresh(e.target.value)}
                  className="w-20 h-9 text-sm border border-border rounded-lg px-3 bg-white outline-none focus:ring-2 focus:ring-primary/20 text-right tabular-nums"
                />
                <span className="text-sm text-muted-foreground font-medium">%</span>
              </div>
            </SettingRow>
          </div>
        </div>
      </section>

      <SaveBar onSave={() => {}} onDiscard={() => {}} />
    </div>
  );
}

// ── Appearance tab ────────────────────────────────────────────────────────────

function AppearanceTab() {
  const [theme,    setTheme]    = useState<'light' | 'dark' | 'system'>('light');
  const [density,  setDensity]  = useState<'comfortable' | 'compact'>('comfortable');
  const [fontSize, setFontSize] = useState('14');
  const [animationsOn, setAnimationsOn] = useState(true);
  const [sidebarStyle, setSidebarStyle] = useState<'default' | 'icons'>('default');
  const [accentColor, setAccentColor]   = useState('#6366f1');

  const ACCENT_COLORS = [
    '#6366f1', '#8b5cf6', '#ec4899', '#ef4444',
    '#f97316', '#f59e0b', '#22c55e', '#14b8a6',
    '#3b82f6', '#0ea5e9', '#64748b', '#1e293b',
  ];

  const THEMES = [
    { value: 'light',  label: 'Light',  icon: Sun  },
    { value: 'dark',   label: 'Dark',   icon: Moon },
    { value: 'system', label: 'System', icon: Monitor },
  ] as const;

  return (
    <div className="space-y-8 max-w-2xl">

      <section>
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Theme</h2>
        <div className="h-px bg-border mb-4" />
        <div className="grid grid-cols-3 gap-3">
          {THEMES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTheme(value)}
              className={cn(
                'flex flex-col items-center gap-2.5 rounded-xl border p-5 transition-colors',
                theme === value ? 'border-primary/40 bg-primary/5 shadow-sm' : 'border-border bg-white hover:bg-gray-50',
              )}
            >
              <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', theme === value ? 'bg-primary/10' : 'bg-gray-100')}>
                <Icon className={cn('h-5 w-5', theme === value ? 'text-primary' : 'text-muted-foreground')} />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-semibold text-foreground">{label}</span>
                {theme === value && <Check className="h-3.5 w-3.5 text-primary" />}
              </div>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Accent colour</h2>
        <div className="h-px bg-border mb-4" />
        <div className="rounded-xl border border-border bg-white px-5 py-5">
          <p className="text-xs text-muted-foreground mb-3">Used for buttons, active states, and highlights throughout the app.</p>
          <div className="flex flex-wrap gap-2">
            {ACCENT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setAccentColor(c)}
                className={cn(
                  'w-8 h-8 rounded-full transition-transform hover:scale-110 border-2',
                  accentColor === c ? 'border-gray-800 scale-110' : 'border-transparent',
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Layout & display</h2>
        <div className="h-px bg-border mb-4" />
        <div className="rounded-xl border border-border bg-white divide-y divide-border/60 overflow-hidden">

          <div className="px-5">
            <SettingRow label="Table density" description="Controls the row height in data tables.">
              <div className="flex items-center gap-1 bg-secondary border border-border rounded-lg p-0.5">
                {(['comfortable', 'compact'] as const).map((v) => (
                  <button key={v} type="button" onClick={() => setDensity(v)}
                    className={cn('h-7 px-3 rounded-md text-xs font-medium transition-colors capitalize',
                      density === v ? 'bg-white text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                    {v}
                  </button>
                ))}
              </div>
            </SettingRow>
          </div>

          <div className="px-5">
            <SettingRow label="Sidebar style" description="Default shows labels; icons-only collapses to just icons.">
              <div className="flex items-center gap-1 bg-secondary border border-border rounded-lg p-0.5">
                {([['default', 'Default'], ['icons', 'Icons only']] as const).map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setSidebarStyle(v)}
                    className={cn('h-7 px-3 rounded-md text-xs font-medium transition-colors',
                      sidebarStyle === v ? 'bg-white text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                    {l}
                  </button>
                ))}
              </div>
            </SettingRow>
          </div>

          <div className="px-5">
            <SettingRow label="Base font size" description="Adjusts the body text size across the app.">
              <div className="flex items-center gap-2">
                <Select value={fontSize} onValueChange={setFontSize}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>{['12','13','14','15','16'].map((s) => <SelectItem key={s} value={s}>{s}px</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </SettingRow>
          </div>

          <div className="px-5">
            <SettingRow label="Animations" description="Enable or disable transition animations and motion effects." last>
              <Toggle value={animationsOn} onChange={setAnimationsOn} />
            </SettingRow>
          </div>

        </div>
      </section>

      <SaveBar onSave={() => {}} onDiscard={() => { setTheme('light'); setDensity('comfortable'); setFontSize('14'); setAnimationsOn(true); setSidebarStyle('default'); setAccentColor('#6366f1'); }} />
    </div>
  );
}

// ── Billing tab ───────────────────────────────────────────────────────────────

const PLANS = [
  { id: 'starter',  name: 'Starter',  price: '£49/mo',  features: ['1 venue', '2 menus', 'QR menu', 'Email support'],                                                          color: 'border-border' },
  { id: 'pro',      name: 'Pro',      price: '£149/mo', features: ['3 venues', 'Unlimited menus', 'All integrations', 'Inventory module', 'Priority support'],                  color: 'border-primary', highlight: true },
  { id: 'business', name: 'Business', price: '£399/mo', features: ['Unlimited venues', 'Custom API', 'Booking & rooms', 'Dedicated account manager', 'SLA 99.9%'], color: 'border-violet-400' },
];

const INVOICES = [
  { id: 'INV-2026-03', date: '1 Mar 2026',  amount: '£149.00', status: 'paid'    },
  { id: 'INV-2026-02', date: '1 Feb 2026',  amount: '£149.00', status: 'paid'    },
  { id: 'INV-2026-01', date: '1 Jan 2026',  amount: '£149.00', status: 'paid'    },
  { id: 'INV-2025-12', date: '1 Dec 2025',  amount: '£149.00', status: 'paid'    },
  { id: 'INV-2025-11', date: '1 Nov 2025',  amount: '£149.00', status: 'paid'    },
];

function BillingTab() {
  const [currentPlan, setCurrentPlan] = useState('pro');

  return (
    <div className="space-y-8 max-w-2xl">

      <section>
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Current plan</h2>
        <div className="h-px bg-border mb-4" />
        <div className="grid grid-cols-3 gap-3">
          {PLANS.map((p) => (
            <div
              key={p.id}
              className={cn(
                'rounded-xl border-2 bg-white p-4 flex flex-col gap-3 transition-all cursor-pointer',
                currentPlan === p.id ? p.color + ' shadow-sm' : 'border-border opacity-70 hover:opacity-90',
              )}
              onClick={() => setCurrentPlan(p.id)}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-foreground">{p.name}</p>
                  <p className="text-lg font-bold text-primary mt-0.5 tabular-nums">{p.price}</p>
                </div>
                {currentPlan === p.id && (
                  <span className="text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5">
                    Active
                  </span>
                )}
              </div>
              <ul className="space-y-1.5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Check className="h-3 w-3 text-emerald-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              {currentPlan !== p.id && (
                <button type="button" className="mt-auto h-8 text-xs font-medium border border-border rounded-lg hover:bg-secondary transition-colors">
                  Switch to {p.name}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Payment method</h2>
        <div className="h-px bg-border mb-4" />
        <div className="rounded-xl border border-border bg-white overflow-hidden divide-y divide-border/60">
          <div className="flex items-center gap-4 px-5 py-4">
            <div className="w-12 h-8 rounded-md bg-blue-600 flex items-center justify-center shrink-0">
              <span className="text-white text-[10px] font-bold tracking-wide">VISA</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Visa ending in 4242</p>
              <p className="text-xs text-muted-foreground mt-0.5">Expires 09 / 2028</p>
            </div>
            <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5">Default</span>
            <button type="button" className="h-8 px-3 text-xs border border-border rounded-lg text-muted-foreground hover:bg-secondary transition-colors">
              Edit
            </button>
          </div>
          <div className="px-5 py-3">
            <button type="button" className="flex items-center gap-1.5 text-xs text-primary font-medium hover:underline">
              <Plus className="h-3.5 w-3.5" />
              Add payment method
            </button>
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Invoice history</h2>
        <div className="h-px bg-border mb-4" />
        <div className="rounded-xl border border-border bg-white overflow-hidden divide-y divide-border/60">
          {INVOICES.map((inv) => (
            <div key={inv.id} className="flex items-center gap-4 px-5 py-3.5">
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{inv.id}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{inv.date}</p>
              </div>
              <span className="text-sm font-semibold tabular-nums text-foreground">{inv.amount}</span>
              <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full px-2 py-0.5 capitalize">
                {inv.status}
              </span>
              <button type="button" className="flex items-center gap-1 h-7 px-2.5 text-xs border border-border rounded-lg text-muted-foreground hover:bg-secondary transition-colors">
                <Download className="h-3 w-3" />
                PDF
              </button>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest mb-1">Danger zone</h2>
        <div className="h-px bg-border mb-4" />
        <div className="rounded-xl border border-red-200 bg-red-50/40 px-5 py-4 flex items-center gap-4">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-700">Cancel subscription</p>
            <p className="text-xs text-red-600/80 mt-0.5">Your account stays active until the end of the billing period. All data can be exported before cancellation.</p>
          </div>
          <button type="button" className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium border border-red-300 rounded-lg text-red-600 hover:bg-red-100 transition-colors shrink-0">
            Cancel plan
          </button>
        </div>
      </section>

    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const TABS: { id: Tab; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { id: 'general',       icon: Globe,       label: 'General'       },
  { id: 'profile',       icon: User,        label: 'Profile'       },
  { id: 'venue',         icon: Building2,   label: 'Venue'         },
  { id: 'notifications', icon: Bell,        label: 'Notifications' },
  { id: 'appearance',    icon: Palette,     label: 'Appearance'    },
  { id: 'billing',       icon: CreditCard,  label: 'Billing'       },
];

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('general');

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden" style={{ animation: 'page-enter 0.25s ease both' }}>

        {/* ── Header ── */}
        <header className="shrink-0 h-14 border-b border-border px-6 flex items-center gap-4 bg-background">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Settings className="h-4 w-4" />
          </div>
          <span className="text-[15px] font-bold text-foreground tracking-tight">Settings</span>
          <div className="flex-1" />
          <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary border border-border rounded-lg px-3 py-1.5">
            <Shield className="h-3.5 w-3.5" />
            <span>Changes auto-save per section</span>
          </div>
        </header>

        {/* ── Mini navbar (tabs) ── */}
        <div className="shrink-0 border-b border-border bg-background px-6">
          <nav className="flex items-center gap-0 overflow-x-auto">
            {TABS.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-[13px] font-medium border-b-2 transition-colors -mb-px whitespace-nowrap',
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
          <div className="px-6 py-8 max-w-2xl mx-auto">
            {tab === 'general'       && <GeneralTab />}
            {tab === 'profile'       && <ProfileTab />}
            {tab === 'venue'         && <VenueTab />}
            {tab === 'notifications' && <NotificationsTab />}
            {tab === 'appearance'    && <AppearanceTab />}
            {tab === 'billing'       && <BillingTab />}
          </div>
        </div>

      </div>
    </AppLayout>
  );
}

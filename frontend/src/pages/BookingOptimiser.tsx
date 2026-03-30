import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { cn } from '@/lib/utils';
import {
  ArrowLeft, CalendarCheck, ChevronLeft, ChevronRight, Info,
  Users, Clock, AlertTriangle, Zap, Lightbulb, CheckCircle,
  TrendingUp, Activity, MapPin, Star, Plus, DollarSign,
  LayoutGrid, ChevronUp, ChevronDown, Sparkles,
} from 'lucide-react';

// ─── Palette ─────────────────────────────────────────────────────────────────
const P = {
  primary: '#D25F2A', rose: '#F43F5E', muted: '#9A9189', border: '#E2DDD4', bg: '#FAF9F6',
};

// ─── Types ────────────────────────────────────────────────────────────────────
type BookingStatus = 'confirmed' | 'pending' | 'seated' | 'completed' | 'cancelled' | 'no-show';
type Session = 'all' | 'lunch' | 'dinner';
type TableStatus = BookingStatus | 'available';
type RType = 'critical' | 'warning' | 'info' | 'success';

interface Booking {
  id: string; tableNumber: string; section: string;
  guestName: string; partySize: number;
  date: string; startTime: string; duration: number;
  status: BookingStatus; notes?: string; phone?: string; email?: string;
}

interface TableDef {
  id: string; label: string; section: string;
  cap: number; x: number; y: number; w: number; h: number;
}

interface Recommendation {
  id: string; type: RType; impact: 'high' | 'medium' | 'low';
  title: string; detail: string; tableIds?: string[];
}

interface ExpansionSlot {
  id: string; label: string; section: string;
  cap: number; x: number; y: number; w: number; h: number;
  revenueScore: number; avgSpend: number; reason: string;
}

interface AlgoResult {
  score: number; occupancy: number; totalCovers: number;
  totalCapacity: number; avgTurnMin: number; gapCount: number;
  mismatchCount: number; criticalCount: number;
  tableScores: Record<string, number>;
  recommendations: Recommendation[];
  sectionDemand: Record<string, number>; // 0–100 per section
  recommendedSlots: ExpansionSlot[];
  extraRevenue: number;                  // weekly £ uplift estimate
}

// ─── Session ranges (minutes from midnight) ───────────────────────────────────
const SESSION_RANGE: Record<Session, [number, number]> = {
  all: [720, 1380], lunch: [720, 960], dinner: [1020, 1380],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function tm(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function fmt(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function fmtDate(s: string) {
  return new Date(s + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
}
function minToTime(min: number) {
  return `${Math.floor(min / 60).toString().padStart(2, '0')}:${(min % 60).toString().padStart(2, '0')}`;
}

// ─── Floor layout ─────────────────────────────────────────────────────────────
const SECTIONS = [
  { id: 'main',    label: 'Main Floor', x: 1,  y: 1,  w: 52, h: 58, bg: '#FAF9F6', bc: '#C8C2B8' },
  { id: 'terrace', label: 'Terrace',    x: 55, y: 1,  w: 44, h: 47, bg: '#F5F3F0', bc: '#C8C2B8' },
  { id: 'bar',     label: 'Bar Area',   x: 1,  y: 62, w: 52, h: 36, bg: '#F5F3F0', bc: '#C8C2B8' },
  { id: 'private', label: 'Private',    x: 55, y: 51, w: 44, h: 47, bg: '#F5F3F0', bc: '#C8C2B8' },
];

const TABLES: TableDef[] = [
  // Main Floor (8 tables)
  { id: '1',  label: '1',  section: 'main',    cap: 2,  x: 3,  y: 7,  w: 9,  h: 14 },
  { id: '2',  label: '2',  section: 'main',    cap: 4,  x: 3,  y: 26, w: 11, h: 14 },
  { id: '3',  label: '3',  section: 'main',    cap: 4,  x: 3,  y: 44, w: 11, h: 14 },
  { id: '4',  label: '4',  section: 'main',    cap: 2,  x: 17, y: 7,  w: 9,  h: 14 },
  { id: '5',  label: '5',  section: 'main',    cap: 6,  x: 17, y: 26, w: 13, h: 14 },
  { id: '6',  label: '6',  section: 'main',    cap: 4,  x: 17, y: 44, w: 11, h: 14 },
  { id: '7',  label: '7',  section: 'main',    cap: 2,  x: 33, y: 7,  w: 9,  h: 14 },
  { id: '8',  label: '8',  section: 'main',    cap: 4,  x: 33, y: 26, w: 11, h: 14 },
  // Terrace (5 tables)
  { id: 'T1', label: 'T1', section: 'terrace', cap: 2,  x: 57, y: 7,  w: 9,  h: 13 },
  { id: 'T2', label: 'T2', section: 'terrace', cap: 4,  x: 69, y: 7,  w: 11, h: 13 },
  { id: 'T3', label: 'T3', section: 'terrace', cap: 4,  x: 82, y: 7,  w: 11, h: 13 },
  { id: 'T4', label: 'T4', section: 'terrace', cap: 2,  x: 57, y: 27, w: 9,  h: 13 },
  { id: 'T5', label: 'T5', section: 'terrace', cap: 6,  x: 69, y: 27, w: 13, h: 15 },
  // Bar Area (5 tables)
  { id: 'B1', label: 'B1', section: 'bar',     cap: 2,  x: 3,  y: 68, w: 8,  h: 12 },
  { id: 'B2', label: 'B2', section: 'bar',     cap: 2,  x: 13, y: 68, w: 8,  h: 12 },
  { id: 'B3', label: 'B3', section: 'bar',     cap: 3,  x: 23, y: 68, w: 8,  h: 12 },
  { id: 'B4', label: 'B4', section: 'bar',     cap: 2,  x: 33, y: 68, w: 8,  h: 12 },
  { id: 'B5', label: 'B5', section: 'bar',     cap: 3,  x: 43, y: 68, w: 8,  h: 12 },
  // Private (2 large tables)
  { id: 'P1', label: 'P1', section: 'private', cap: 10, x: 57, y: 57, w: 17, h: 22 },
  { id: 'P2', label: 'P2', section: 'private', cap: 8,  x: 77, y: 57, w: 17, h: 22 },
];

const TOTAL_CAP = TABLES.reduce((s, t) => s + t.cap, 0); // 76

// ─── Pre-mapped expansion slots (empty floor space) ───────────────────────────
// Positions verified to not overlap any existing table or section boundary.
const EXPANSION_SLOTS: ExpansionSlot[] = [
  {
    id: 'e1', label: '+9', section: 'main', cap: 4,
    x: 33, y: 44, w: 11, h: 14,
    revenueScore: 72, avgSpend: 32,
    reason: 'Main floor corner — high-footfall area near kitchen pass. Ideal for groups of 3–4 during peak dinner service.',
  },
  {
    id: 'e2', label: '+10', section: 'main', cap: 2,
    x: 44, y: 7, w: 8, h: 13,
    revenueScore: 62, avgSpend: 32,
    reason: 'Window-side spot — premium position popular with couples, commands a slight spend uplift.',
  },
  {
    id: 'e3', label: '+T6', section: 'terrace', cap: 4,
    x: 82, y: 27, w: 11, h: 13,
    revenueScore: 84, avgSpend: 38,
    reason: 'Terrace extension — al-fresco dining is in demand on busy evenings; higher avg spend than main floor.',
  },
  {
    id: 'e4', label: '+P3', section: 'private', cap: 6,
    x: 62, y: 82, w: 28, h: 14,
    revenueScore: 95, avgSpend: 45,
    reason: 'Private dining expansion — highest revenue per cover. Suits corporate groups and celebrations.',
  },
];

// ─── Booking seed data ────────────────────────────────────────────────────────
const BOOKINGS: Booking[] = [
  { id: 'b01', tableNumber: '2',  section: 'Main Floor', guestName: 'Smith, J.',     partySize: 3, date: '2026-03-14', startTime: '19:00', duration: 90,  status: 'completed', notes: 'Anniversary dinner' },
  { id: 'b02', tableNumber: 'B1', section: 'Bar Area',   guestName: 'Chen, L.',      partySize: 2, date: '2026-03-14', startTime: '20:30', duration: 60,  status: 'completed' },
  { id: 'b03', tableNumber: 'P1', section: 'Private',    guestName: 'Apex Ltd',      partySize: 9, date: '2026-03-14', startTime: '19:00', duration: 120, status: 'completed', notes: 'Pre-ordered set menu' },
  { id: 'b04', tableNumber: '3',  section: 'Main Floor', guestName: 'Patel, A.',     partySize: 4, date: '2026-03-15', startTime: '12:30', duration: 75,  status: 'completed' },
  { id: 'b05', tableNumber: '5',  section: 'Main Floor', guestName: 'Müller, K.',    partySize: 3, date: '2026-03-15', startTime: '19:30', duration: 90,  status: 'completed' },
  { id: 'b06', tableNumber: 'T2', section: 'Terrace',    guestName: 'García, R.',    partySize: 4, date: '2026-03-15', startTime: '13:00', duration: 60,  status: 'completed', notes: 'Vegetarian menu required' },
  { id: 'b07', tableNumber: '8',  section: 'Main Floor', guestName: 'Jones, B.',     partySize: 2, date: '2026-03-17', startTime: '20:00', duration: 90,  status: 'completed', notes: 'Window seat request' },
  { id: 'b08', tableNumber: 'B5', section: 'Bar Area',   guestName: 'Williams, S.',  partySize: 3, date: '2026-03-17', startTime: '19:00', duration: 75,  status: 'completed' },
  // March 18
  { id: 'b09', tableNumber: '2',  section: 'Main Floor', guestName: 'Nakamura, Y.',  partySize: 2, date: '2026-03-18', startTime: '12:00', duration: 60,  status: 'seated' },
  { id: 'b10', tableNumber: '3',  section: 'Main Floor', guestName: 'Okafor, C.',    partySize: 6, date: '2026-03-18', startTime: '12:30', duration: 75,  status: 'seated' },
  { id: 'b11', tableNumber: 'P1', section: 'Private',    guestName: 'Crown Corp',    partySize: 8, date: '2026-03-18', startTime: '19:00', duration: 120, status: 'confirmed', notes: 'Champagne on arrival' },
  { id: 'b12', tableNumber: '5',  section: 'Main Floor', guestName: 'Dubois, F.',    partySize: 4, date: '2026-03-18', startTime: '19:30', duration: 90,  status: 'confirmed' },
  { id: 'b13', tableNumber: 'T3', section: 'Terrace',    guestName: 'Kowalski, M.',  partySize: 3, date: '2026-03-18', startTime: '20:00', duration: 75,  status: 'confirmed' },
  { id: 'b14', tableNumber: 'B2', section: 'Bar Area',   guestName: 'Hassan, A.',    partySize: 2, date: '2026-03-18', startTime: '21:00', duration: 60,  status: 'pending' },
  // March 19
  { id: 'b15', tableNumber: '1',  section: 'Main Floor', guestName: 'Fernandez, L.', partySize: 2, date: '2026-03-19', startTime: '12:00', duration: 60,  status: 'confirmed' },
  { id: 'b16', tableNumber: '7',  section: 'Main Floor', guestName: 'Berg, E.',      partySize: 2, date: '2026-03-19', startTime: '13:00', duration: 60,  status: 'confirmed', notes: 'Allergic to nuts' },
  { id: 'b17', tableNumber: 'P2', section: 'Private',    guestName: 'TechConf Ltd',  partySize: 7, date: '2026-03-19', startTime: '18:30', duration: 150, status: 'confirmed', notes: 'AV setup required' },
  { id: 'b18', tableNumber: '4',  section: 'Main Floor', guestName: 'Rossi, G.',     partySize: 2, date: '2026-03-19', startTime: '20:00', duration: 90,  status: 'pending' },
  // March 20 (today)
  { id: 'b19', tableNumber: 'T1', section: 'Terrace',    guestName: 'Andersen, H.',  partySize: 2, date: '2026-03-20', startTime: '12:30', duration: 60,  status: 'confirmed' },
  { id: 'b20', tableNumber: 'B3', section: 'Bar Area',   guestName: 'Taylor, M.',    partySize: 1, date: '2026-03-20', startTime: '19:00', duration: 60,  status: 'confirmed' },
  { id: 'b21', tableNumber: '6',  section: 'Main Floor', guestName: 'Sato, H.',      partySize: 4, date: '2026-03-20', startTime: '20:00', duration: 90,  status: 'pending' },
  // March 21
  { id: 'b22', tableNumber: '3',  section: 'Main Floor', guestName: 'Ivanova, O.',   partySize: 3, date: '2026-03-21', startTime: '19:00', duration: 75,  status: 'confirmed' },
  { id: 'b23', tableNumber: 'T5', section: 'Terrace',    guestName: 'Singh, P.',     partySize: 6, date: '2026-03-21', startTime: '20:30', duration: 90,  status: 'confirmed', notes: 'Birthday cake requested' },
  { id: 'b24', tableNumber: '8',  section: 'Main Floor', guestName: 'Dupont, A.',    partySize: 2, date: '2026-03-21', startTime: '12:00', duration: 60,  status: 'pending' },
  // March 22
  { id: 'b25', tableNumber: '2',  section: 'Main Floor', guestName: 'Clarke, B.',    partySize: 4, date: '2026-03-22', startTime: '19:00', duration: 90,  status: 'cancelled', notes: 'Cancelled same day' },
  { id: 'b26', tableNumber: 'B4', section: 'Bar Area',   guestName: 'Unknown',       partySize: 2, date: '2026-03-22', startTime: '20:00', duration: 60,  status: 'no-show'  },
  // March 25
  { id: 'b27', tableNumber: 'P1', section: 'Private',    guestName: 'Global Corp',   partySize: 10, date: '2026-03-25', startTime: '19:00', duration: 120, status: 'confirmed', notes: 'VIP clients' },
  { id: 'b28', tableNumber: '5',  section: 'Main Floor', guestName: 'Meyer, K.',     partySize: 3, date: '2026-03-25', startTime: '20:00', duration: 75,  status: 'confirmed' },
  { id: 'b29', tableNumber: '5',  section: 'Main Floor', guestName: 'Larsson, E.',   partySize: 2, date: '2026-03-25', startTime: '12:00', duration: 60,  status: 'confirmed' },
  // March 28
  { id: 'b30', tableNumber: 'T2', section: 'Terrace',    guestName: 'Santos, M.',    partySize: 4, date: '2026-03-28', startTime: '13:00', duration: 75,  status: 'confirmed' },
  { id: 'b31', tableNumber: '4',  section: 'Main Floor', guestName: 'Hoffman, R.',   partySize: 2, date: '2026-03-28', startTime: '19:30', duration: 90,  status: 'pending' },
  // Extra busy day: March 22 (Sat) — add many bookings to demo high occupancy
  { id: 'b32', tableNumber: '1',  section: 'Main Floor', guestName: 'Walsh, C.',     partySize: 2, date: '2026-03-22', startTime: '19:00', duration: 90,  status: 'confirmed' },
  { id: 'b33', tableNumber: '3',  section: 'Main Floor', guestName: 'Nkosi, A.',     partySize: 4, date: '2026-03-22', startTime: '19:30', duration: 90,  status: 'confirmed' },
  { id: 'b34', tableNumber: '4',  section: 'Main Floor', guestName: 'Lane, K.',      partySize: 2, date: '2026-03-22', startTime: '20:00', duration: 75,  status: 'confirmed' },
  { id: 'b35', tableNumber: '5',  section: 'Main Floor', guestName: 'Obi, T.',       partySize: 5, date: '2026-03-22', startTime: '19:00', duration: 105, status: 'confirmed' },
  { id: 'b36', tableNumber: '7',  section: 'Main Floor', guestName: 'Moore, P.',     partySize: 2, date: '2026-03-22', startTime: '19:30', duration: 90,  status: 'confirmed' },
  { id: 'b37', tableNumber: '8',  section: 'Main Floor', guestName: 'Banks, J.',     partySize: 3, date: '2026-03-22', startTime: '20:30', duration: 75,  status: 'confirmed' },
  { id: 'b38', tableNumber: 'T1', section: 'Terrace',    guestName: 'Ito, M.',       partySize: 2, date: '2026-03-22', startTime: '19:00', duration: 90,  status: 'confirmed' },
  { id: 'b39', tableNumber: 'T2', section: 'Terrace',    guestName: 'Perez, D.',     partySize: 4, date: '2026-03-22', startTime: '19:30', duration: 90,  status: 'confirmed' },
  { id: 'b40', tableNumber: 'T4', section: 'Terrace',    guestName: 'Ford, A.',      partySize: 2, date: '2026-03-22', startTime: '20:00', duration: 75,  status: 'pending' },
  { id: 'b41', tableNumber: 'P2', section: 'Private',    guestName: 'Summit Events', partySize: 7, date: '2026-03-22', startTime: '18:30', duration: 150, status: 'confirmed', notes: 'Corporate dinner' },
  { id: 'b42', tableNumber: 'B1', section: 'Bar Area',   guestName: 'Tan, S.',       partySize: 2, date: '2026-03-22', startTime: '20:00', duration: 60,  status: 'confirmed' },
  { id: 'b43', tableNumber: 'B3', section: 'Bar Area',   guestName: 'Ray, E.',       partySize: 2, date: '2026-03-22', startTime: '21:00', duration: 60,  status: 'pending' },
  // Back-to-back demo for March 25 on Table 5 (b28 and b29 are 12:00 and 20:00 — no conflict there)
  // Add a tight one on March 25 Table 8:
  { id: 'b44', tableNumber: '8',  section: 'Main Floor', guestName: 'Haas, G.',      partySize: 3, date: '2026-03-25', startTime: '19:00', duration: 90,  status: 'confirmed' },
  { id: 'b45', tableNumber: '8',  section: 'Main Floor', guestName: 'Diaz, L.',      partySize: 4, date: '2026-03-25', startTime: '20:35', duration: 90,  status: 'confirmed', notes: 'Only 5 min gap!' },
];

// ─── Status colours ───────────────────────────────────────────────────────────
const STATUS_COLOR: Record<BookingStatus, string> = {
  confirmed: P.primary, pending: P.muted, seated: P.primary,
  completed: P.muted, cancelled: P.rose, 'no-show': P.muted,
};
const TABLE_BG: Record<TableStatus, string> = {
  available: '#FFFFFF', confirmed: '#FEF3EC', pending: P.bg,
  seated: '#FEF3EC', completed: '#FAFAFA', cancelled: '#FEF2F2', 'no-show': '#FAFAFA',
};
const TABLE_BORDER: Record<TableStatus, string> = {
  available: P.border, confirmed: `${P.primary}50`, pending: P.border,
  seated: `${P.primary}50`, completed: P.border, cancelled: `${P.rose}50`, 'no-show': P.border,
};

// ─── Table status for a given date/session ────────────────────────────────────
function getTableStatus(tableId: string, date: string, session: Session): { status: TableStatus; booking?: Booking; count: number } {
  const [sStart, sEnd] = SESSION_RANGE[session];
  const tbs = BOOKINGS.filter(b => {
    if (b.tableNumber !== tableId || b.date !== date) return false;
    if (b.status === 'cancelled' || b.status === 'no-show') return false;
    const bStart = tm(b.startTime);
    if (session === 'lunch')  return bStart >= sStart && bStart < 960;
    if (session === 'dinner') return bStart >= 1020 && bStart < sEnd;
    return true;
  });
  if (tbs.length === 0) return { status: 'available', count: 0 };
  const seated    = tbs.find(b => b.status === 'seated');
  if (seated)    return { status: 'seated',    booking: seated,    count: tbs.length };
  const confirmed = tbs.find(b => b.status === 'confirmed');
  if (confirmed) return { status: 'confirmed', booking: confirmed, count: tbs.length };
  return { status: tbs[0].status, booking: tbs[0], count: tbs.length };
}

// ─── Core optimisation algorithm ─────────────────────────────────────────────
function runAlgorithm(date: string, session: Session, extraSeats = 0): AlgoResult {
  const [sStart, sEnd] = SESSION_RANGE[session];
  const sLen = sEnd - sStart;

  const dayBkgs = BOOKINGS.filter(b => {
    if (b.date !== date) return false;
    if (b.status === 'cancelled' || b.status === 'no-show') return false;
    const bStart = tm(b.startTime);
    if (session === 'lunch')  return bStart >= sStart && bStart < 960;
    if (session === 'dinner') return bStart >= 1020 && bStart < sEnd;
    return true;
  });

  let totalCovers = 0, totalDuration = 0, bookedTables = 0;
  let gapCount = 0, mismatchCount = 0;
  const tableScores: Record<string, number> = {};
  const recommendations: Recommendation[] = [];

  for (const table of TABLES) {
    const tbs = dayBkgs.filter(b => b.tableNumber === table.id)
      .sort((a, b) => tm(a.startTime) - tm(b.startTime));

    const bookedMin = tbs.reduce((s, b) => s + b.duration, 0);
    const utilizationPct = Math.min(100, (bookedMin / sLen) * 100);

    // Back-to-back gaps
    let backToBack = false;
    for (let i = 0; i < tbs.length - 1; i++) {
      const endA   = tm(tbs[i].startTime) + tbs[i].duration;
      const startB = tm(tbs[i + 1].startTime);
      const gap = startB - endA;
      if (gap < 15) {
        backToBack = true;
        recommendations.push({
          id: `btb-${table.id}-${i}`, type: 'critical', impact: 'high',
          title: `Turn risk — Table ${table.label}`,
          detail: `Only ${gap} min between ${fmtTime(tbs[i].startTime)} and ${fmtTime(tbs[i + 1].startTime)} booking. Risk of overrun — add a buffer or stagger arrival times.`,
          tableIds: [table.id],
        });
      }
      if (gap >= 75) {
        gapCount++;
        recommendations.push({
          id: `gap-${table.id}-${i}`, type: 'info', impact: 'medium',
          title: `${gap}-min gap on Table ${table.label}`,
          detail: `Free slot ${fmtTime(minToTime(endA))}–${fmtTime(minToTime(startB))} — ideal for a walk-in or same-day booking.`,
          tableIds: [table.id],
        });
      }
    }

    // Size mismatch
    for (const b of tbs) {
      if (b.partySize < table.cap * 0.5) {
        mismatchCount++;
        const altTable = TABLES.find(t => t.cap >= b.partySize && t.cap < table.cap && !dayBkgs.some(x => x.tableNumber === t.id));
        recommendations.push({
          id: `mismatch-${table.id}-${b.id}`, type: 'warning', impact: 'medium',
          title: `Table ${table.label} over-allocated`,
          detail: `Party of ${b.partySize} on a ${table.cap}-cap table at ${fmtTime(b.startTime)}.${altTable ? ` Move to Table ${altTable.label} (${altTable.cap}-cap) to free this slot.` : ' Consider reassigning to a smaller table.'}`,
          tableIds: [table.id, ...(altTable ? [altTable.id] : [])],
        });
        break;
      }
    }

    // Per-table score
    const coverRatio = tbs.length > 0
      ? tbs.reduce((s, b) => s + b.partySize / table.cap, 0) / tbs.length
      : 0;
    const raw = utilizationPct * 0.5 + coverRatio * 100 * 0.35 + (backToBack ? -15 : 5) + (mismatchCount > 0 ? -8 : 4);
    tableScores[table.id] = tbs.length === 0 ? 0 : Math.max(5, Math.min(100, Math.round(raw)));

    if (tbs.length > 0) { bookedTables++; totalDuration += bookedMin / tbs.length; }
    totalCovers += tbs.reduce((s, b) => s + b.partySize, 0);
  }

  // Section underutilisation
  for (const sec of SECTIONS) {
    const secTables   = TABLES.filter(t => t.section === sec.id);
    const secBookings = dayBkgs.filter(b => secTables.some(t => t.id === b.tableNumber));
    const pct = (secBookings.length / secTables.length) * 100;
    if (pct < 30 && dayBkgs.length >= 2) {
      recommendations.push({
        id: `section-${sec.id}`, type: 'info', impact: 'low',
        title: `${sec.label} underutilised`,
        detail: `${secBookings.length}/${secTables.length} tables booked in ${sec.label}. Promote this area for walk-ins or add online availability.`,
        tableIds: secTables.map(t => t.id),
      });
    }
  }

  // Pending bookings warning
  const pendingCount = dayBkgs.filter(b => b.status === 'pending').length;
  if (pendingCount > 0) {
    recommendations.push({
      id: 'pending', type: 'warning', impact: 'high',
      title: `${pendingCount} unconfirmed booking${pendingCount > 1 ? 's' : ''}`,
      detail: `Chase ${pendingCount} pending reservation${pendingCount > 1 ? 's' : ''} before service — unconfirmed bookings risk empty tables if guests do not show.`,
    });
  }

  // High occupancy tip
  const occupancy = Math.round((totalCovers / TOTAL_CAP) * 100);
  if (occupancy >= 70) {
    recommendations.push({
      id: 'high-occ', type: 'success', impact: 'high',
      title: 'Strong occupancy — maximise revenue',
      detail: `${occupancy}% capacity filled. Brief staff on efficient turn times, upsell high-margin items, and ensure pre-authorised cards for large parties.`,
    });
  }

  // Sort: critical → warning → info → success
  const ORDER: Record<RType, number> = { critical: 0, warning: 1, info: 2, success: 3 };
  recommendations.sort((a, b) => ORDER[a.type] - ORDER[b.type]);

  const criticalCount = recommendations.filter(r => r.type === 'critical').length;
  const avgTurnMin = bookedTables > 0 ? Math.round(totalDuration / bookedTables) : 0;

  // Section demand % (how full is each section)
  const sectionDemand: Record<string, number> = {};
  for (const sec of SECTIONS) {
    const secTables   = TABLES.filter(t => t.section === sec.id);
    const secCovers   = dayBkgs.filter(b => secTables.some(t => t.id === b.tableNumber)).reduce((s, b) => s + b.partySize, 0);
    const secCap      = secTables.reduce((s, t) => s + t.cap, 0);
    sectionDemand[sec.id] = secCap > 0 ? Math.round((secCovers / secCap) * 100) : 0;
  }

  // Expansion slot recommendation (runs when extraSeats > 0)
  const recommendedSlots: ExpansionSlot[] = [];
  let extraRevenue = 0;
  if (extraSeats > 0) {
    // Score each slot: revenue weight + demand in its section
    const scored = EXPANSION_SLOTS.map(s => ({
      slot: s,
      score: s.revenueScore * 0.65 + (sectionDemand[s.section] ?? 0) * 0.35,
    })).sort((a, b) => b.score - a.score);

    let seated = 0;
    for (const { slot } of scored) {
      if (seated >= extraSeats) break;
      recommendedSlots.push(slot);
      seated += slot.cap;
      // Weekly revenue uplift: cap × avgSpend × 1.5 turns × 3 busy nights
      extraRevenue += slot.cap * slot.avgSpend * 1.5 * 3;
    }
  }

  // Overall score
  const score = Math.max(10, Math.min(100, Math.round(
    occupancy * 0.45 +
    (100 - Math.min(mismatchCount * 12, 36)) * 0.25 +
    (100 - Math.min(criticalCount * 25, 50)) * 0.20 +
    (dayBkgs.length > 0 ? 15 : 0),
  )));

  return {
    score, occupancy, totalCovers, totalCapacity: TOTAL_CAP,
    avgTurnMin, gapCount, mismatchCount, criticalCount,
    tableScores, recommendations, sectionDemand, recommendedSlots, extraRevenue,
  };
}

// ─── Floor Plan component ─────────────────────────────────────────────────────
function FloorPlan({ date, session, selected, onSelect, algo, rearrangeMode }: {
  date: string; session: Session;
  selected: string | null; onSelect: (id: string | null) => void;
  algo: AlgoResult; rearrangeMode: boolean;
}) {
  const [hovered,        setHovered]        = useState<string | null>(null);
  const [hoveredSlot,    setHoveredSlot]    = useState<string | null>(null);
  const [selectedSlot,   setSelectedSlot]   = useState<string | null>(null);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden"
      style={{ background: '#EFECE6' }}>
      {/* Dot grid texture */}
      <div className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle, #9A9189 1px, transparent 1px)',
          backgroundSize: '18px 18px',
        }} />

      {/* Section zones */}
      {SECTIONS.map(sec => (
        <div key={sec.id} className="absolute rounded-xl pointer-events-none"
          style={{
            left: `${sec.x}%`, top: `${sec.y}%`,
            width: `${sec.w}%`, height: `${sec.h}%`,
            background: sec.bg, border: `1.5px solid ${sec.bc}`,
          }}>
          <span className="absolute top-1.5 left-2.5 text-[9px] font-bold uppercase tracking-widest"
            style={{ color: sec.bc }}>
            {sec.label}
          </span>
          {sec.id === 'bar' && (
            <div className="absolute bottom-2 left-2 right-2 h-4 rounded flex items-center justify-center"
              style={{ background: P.border, opacity: 0.6 }}>
              <span className="text-[8px] font-bold tracking-widest uppercase" style={{ color: P.muted }}>Bar Counter</span>
            </div>
          )}
          {sec.id === 'private' && (
            <div className="absolute top-1.5 right-2.5">
              <Star className="w-2.5 h-2.5" style={{ color: P.muted }} />
            </div>
          )}
        </div>
      ))}

      {/* Tables */}
      {TABLES.map(table => {
        const { status, booking, count } = getTableStatus(table.id, date, session);
        const isSelected = selected === table.id;
        const isHovered  = hovered === table.id;
        const hasAlert   = algo.recommendations.some(r => r.tableIds?.includes(table.id));
        const score      = algo.tableScores[table.id] ?? 0;

        return (
          <div key={table.id}
            onMouseEnter={() => setHovered(table.id)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onSelect(isSelected ? null : table.id)}
            className="absolute rounded-lg cursor-pointer transition-all duration-150 flex flex-col items-center justify-center select-none"
            style={{
              left: `${table.x}%`, top: `${table.y}%`,
              width: `${table.w}%`, height: `${table.h}%`,
              background: TABLE_BG[status],
              border: `${isSelected ? 2 : 1.5}px solid ${isSelected ? P.primary : TABLE_BORDER[status]}`,
              boxShadow: isSelected
                ? `0 0 0 3px ${P.primary}30, 0 2px 8px rgba(0,0,0,0.15)`
                : isHovered ? '0 2px 10px rgba(0,0,0,0.14)' : '0 1px 3px rgba(0,0,0,0.06)',
              transform: (isSelected || isHovered) ? 'scale(1.06)' : 'scale(1)',
              zIndex: isSelected || isHovered ? 20 : 5,
            }}>
            <span className="text-[9px] font-bold text-foreground leading-none">{table.label}</span>
            <span className="text-[7px] text-muted-foreground leading-none mt-0.5">{table.cap}p</span>
            {booking && (
              <span className="text-[7px] font-semibold mt-0.5"
                style={{ color: STATUS_COLOR[booking.status] }}>
                {booking.partySize}{count > 1 ? `+${count - 1}` : ''}
              </span>
            )}
            {/* Efficiency bar */}
            {score > 0 && (
              <div className="absolute bottom-1 left-1 right-1 h-0.5 rounded-full bg-muted/20 overflow-hidden">
                <div className="h-full rounded-full"
                  style={{
                    width: `${score}%`,
                    background: score >= 65 ? P.primary : score >= 40 ? P.muted : P.rose,
                  }} />
              </div>
            )}
            {/* Alert dot */}
            {hasAlert && (
              <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full flex items-center justify-center"
                style={{ background: P.primary, border: '1.5px solid white', zIndex: 25 }}>
                <span className="text-[6px] font-black text-white">!</span>
              </span>
            )}
          </div>
        );
      })}

      {/* Expansion ghost tables (rearrange mode) */}
      {rearrangeMode && algo.recommendedSlots.map(slot => {
        const isHov = hoveredSlot === slot.id;
        const isSel = selectedSlot === slot.id;
        return (
          <div key={slot.id}
            onMouseEnter={() => setHoveredSlot(slot.id)}
            onMouseLeave={() => setHoveredSlot(null)}
            onClick={() => setSelectedSlot(isSel ? null : slot.id)}
            className="absolute rounded-lg cursor-pointer flex flex-col items-center justify-center select-none transition-all duration-200"
            style={{
              left: `${slot.x}%`, top: `${slot.y}%`,
              width: `${slot.w}%`, height: `${slot.h}%`,
              background: '#FEF3EC',
              border: `2px dashed ${P.primary}`,
              boxShadow: isSel
                ? `0 0 0 3px ${P.primary}30, 0 2px 12px ${P.primary}25`
                : isHov ? `0 2px 10px ${P.primary}18` : 'none',
              transform: (isSel || isHov) ? 'scale(1.06)' : 'scale(1)',
              zIndex: isSel || isHov ? 20 : 6,
            }}>
            <Plus className="w-2.5 h-2.5 mb-0.5" style={{ color: P.primary }} />
            <span className="text-[8px] font-bold leading-none" style={{ color: P.primary }}>{slot.label}</span>
            <span className="text-[7px] leading-none mt-0.5" style={{ color: P.muted }}>{slot.cap}p</span>
            {/* Revenue indicator */}
            <span className="absolute -top-1.5 -left-1.5 text-[7px] font-black text-white rounded px-0.5 leading-tight"
              style={{ background: P.primary }}>
              £{slot.avgSpend}
            </span>
          </div>
        );
      })}

      {/* Rearrange mode overlay label */}
      {rearrangeMode && algo.recommendedSlots.length > 0 && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-white text-[9px] font-bold rounded-full px-3 py-1 shadow-lg"
          style={{ background: P.primary, zIndex: 40 }}>
          <Sparkles className="w-2.5 h-2.5" />
          {algo.recommendedSlots.length} expansion zones suggested — click to inspect
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-white/85 backdrop-blur-sm rounded-lg px-2.5 py-1.5 border border-white/60 shadow-sm"
        style={{ zIndex: 30 }}>
        {[
          { label: 'Free',      bg: '#FFF',    bc: '#D5CFC7' },
          { label: 'Reserved',  bg: '#EFF6FF', bc: '#93C5FD' },
          { label: 'Pending',   bg: '#FFFBEB', bc: '#FCD34D' },
          { label: 'Seated',    bg: '#F0FDF4', bc: '#86EFAC' },
          ...(rearrangeMode ? [{ label: 'Expansion', bg: '#FEF3EC', bc: P.primary }] : []),
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1">
            <span className="w-3 h-3 rounded shrink-0"
              style={{ background: l.bg, border: l.label === 'Expansion' ? `2px dashed ${P.primary}` : `1px solid ${l.bc}` }} />
            <span className="text-[8.5px] text-muted-foreground">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Algorithm panel ─────────────────────────────────────────────────────────
function AlgoPanel({ result, selected, date, session, rearrangeMode, extraSeats }: {
  result: AlgoResult; selected: string | null; date: string; session: Session;
  rearrangeMode: boolean; extraSeats: number;
}) {
  const selTable = selected ? TABLES.find(t => t.id === selected) : null;
  const [sStart, sEnd] = SESSION_RANGE[session];
  const selBookings = selTable
    ? BOOKINGS.filter(b => {
        if (b.tableNumber !== selTable.id || b.date !== date) return false;
        if (b.status === 'cancelled' || b.status === 'no-show') return false;
        const bStart = tm(b.startTime);
        if (session === 'lunch')  return bStart >= sStart && bStart < 960;
        if (session === 'dinner') return bStart >= 1020 && bStart < sEnd;
        return true;
      }).sort((a, b) => tm(a.startTime) - tm(b.startTime))
    : [];

  const REC_ICON: Record<RType, React.ComponentType<{ className?: string }>> = {
    critical: AlertTriangle, warning: AlertTriangle, info: Lightbulb, success: CheckCircle,
  };
  const REC_COLOR: Record<RType, string> = {
    critical: P.rose, warning: P.primary, info: P.muted, success: P.primary,
  };

  const scoreColor = result.score >= 75 ? P.primary : result.score >= 50 ? P.muted : P.rose;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Score strip */}
      <div className="px-4 pt-4 pb-3 border-b border-border shrink-0">
        <div className="flex items-start justify-between mb-2">
          <div>
            <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: P.primary }} />
              Algorithm Intelligence
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {fmtDate(date)} · {session === 'all' ? 'All day' : session.charAt(0).toUpperCase() + session.slice(1)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[26px] font-bold leading-none" style={{ color: scoreColor }}>{result.score}</p>
            <p className="text-[9px] text-muted-foreground">/100</p>
          </div>
        </div>

        <div className="h-1.5 bg-muted/20 rounded-full overflow-hidden mb-3">
          <div className="h-full rounded-full transition-all duration-700"
            style={{ width: `${result.score}%`, background: scoreColor }} />
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          {[
            { icon: Users,    label: 'Occupancy',  value: `${result.occupancy}%` },
            { icon: Users,    label: 'Covers',     value: `${result.totalCovers}` },
            { icon: Clock,    label: 'Avg turn',   value: result.avgTurnMin ? `${result.avgTurnMin}m` : '—' },
            { icon: Activity, label: 'Issues',     value: `${result.criticalCount + result.mismatchCount}` },
          ].map(k => (
            <div key={k.label} className="bg-muted/15 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5">
              <k.icon className="w-3 h-3 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-[11px] font-bold text-foreground leading-none">{k.value}</p>
                <p className="text-[9px] text-muted-foreground leading-none mt-0.5">{k.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto min-h-0">

        {/* Selected table detail */}
        {selTable && (
          <div className="px-4 py-3 border-b border-border bg-orange-50/50 shrink-0">
            <p className="text-[11px] font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <MapPin className="w-3 h-3" style={{ color: P.primary }} />
              Table {selTable.label} · {selTable.cap}-cap · {selTable.section}
            </p>
            {selBookings.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic">No bookings this session — available</p>
            ) : (
              <div className="space-y-1.5">
                {selBookings.map(b => (
                  <div key={b.id} className="flex items-center gap-2 bg-white rounded-md px-2.5 py-1.5 border border-border/60">
                    <span className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: STATUS_COLOR[b.status] }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold text-foreground truncate">{b.guestName}</p>
                      <p className="text-[9px] text-muted-foreground">{fmtTime(b.startTime)} · {b.partySize}p · {b.duration}min</p>
                      {b.notes && <p className="text-[9px] text-muted-foreground/60 truncate italic">{b.notes}</p>}
                    </div>
                    <span className="text-[8px] font-medium px-1.5 py-0.5 rounded-md border shrink-0 capitalize"
                      style={{
                        color: STATUS_COLOR[b.status],
                        background: `${STATUS_COLOR[b.status]}12`,
                        borderColor: `${STATUS_COLOR[b.status]}30`,
                      }}>
                      {b.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2.5">
              <div className="flex justify-between text-[9px] text-muted-foreground mb-1">
                <span>Efficiency score</span>
                <span className="font-semibold">{result.tableScores[selTable.id] ?? 0}/100</span>
              </div>
              <div className="h-1.5 bg-muted/20 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${result.tableScores[selTable.id] ?? 0}%`,
                    background: (result.tableScores[selTable.id] ?? 0) >= 60 ? P.primary : P.muted,
                  }} />
              </div>
            </div>
          </div>
        )}

        {/* ── Expansion plan (rearrange mode) ──────────────────────────── */}
        {rearrangeMode && (
          <div className="border-b border-border shrink-0">
            {/* Header */}
            <div className="px-4 pt-3 pb-2 flex items-center gap-2">
              <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: '#FEF3EC' }}>
                <LayoutGrid className="w-3 h-3" style={{ color: P.primary }} />
              </div>
              <p className="text-[11px] font-semibold text-foreground">Expansion Plan</p>
              <span className="ml-auto text-[9px] font-bold rounded px-1.5 py-0.5"
                style={{ color: P.primary, background: `${P.primary}12`, border: `1px solid ${P.primary}30` }}>
                +{extraSeats} seats
              </span>
            </div>

            {result.recommendedSlots.length === 0 ? (
              <p className="px-4 pb-3 text-[11px] text-muted-foreground italic">
                Set extra seats above to generate an expansion plan.
              </p>
            ) : (
              <div className="px-4 pb-3 space-y-2">
                {/* Revenue uplift card */}
                <div className="rounded-xl border px-3 py-2.5 flex items-center gap-2.5"
                  style={{ background: '#FEF3EC', borderColor: `${P.primary}40` }}>
                  <DollarSign className="w-4 h-4 shrink-0" style={{ color: P.primary }} />
                  <div>
                    <p className="text-[11px] font-bold" style={{ color: P.primary }}>
                      +£{result.extraRevenue.toLocaleString()} / week
                    </p>
                    <p className="text-[9px]" style={{ color: P.muted }}>
                      estimated at {result.recommendedSlots.reduce((s, sl) => s + sl.cap, 0)} extra covers × avg spend × 1.5 turns × 3 nights
                    </p>
                  </div>
                </div>

                {/* Ranked slot list */}
                {result.recommendedSlots.map((slot, i) => (
                  <div key={slot.id}
                    className="rounded-xl border-2 border-dashed px-3 py-2.5"
                    style={{ borderColor: `${P.primary}50`, background: '#FEF3EC' }}>
                    <div className="flex items-start justify-between gap-1 mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded text-white text-[8px] font-black flex items-center justify-center shrink-0"
                          style={{ background: P.primary }}>
                          {i + 1}
                        </span>
                        <span className="text-[11px] font-semibold text-foreground">{slot.label}</span>
                        <span className="text-[9px] text-muted-foreground">{slot.cap}-cap</span>
                      </div>
                      <span className="text-[9px] font-bold rounded px-1.5 py-0.5 shrink-0"
                        style={{ color: P.primary, background: `${P.primary}15`, border: `1px solid ${P.primary}30` }}>
                        £{slot.avgSpend}/cover
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">{slot.reason}</p>
                    {/* Section demand bar */}
                    <div className="mt-1.5">
                      <div className="flex justify-between text-[8px] text-muted-foreground mb-0.5">
                        <span>{SECTIONS.find(s => s.id === slot.section)?.label} demand</span>
                        <span className="font-semibold">{result.sectionDemand[slot.section] ?? 0}%</span>
                      </div>
                      <div className="h-1 bg-muted/20 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${result.sectionDemand[slot.section] ?? 0}%`, background: P.primary }} />
                      </div>
                    </div>
                    <div className="mt-1.5 text-[9px] font-medium" style={{ color: P.primary }}>
                      +£{Math.round(slot.cap * slot.avgSpend * 1.5 * 3).toLocaleString()} / week from this table
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recommendations */}
        <div className="px-4 py-3">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Recommendations · {result.recommendations.length}
          </p>

          {result.recommendations.length === 0 ? (
            <div className="flex items-center gap-2 text-[11px] rounded-xl px-3 py-3 border"
              style={{ color: P.primary, background: '#FEF3EC', borderColor: `${P.primary}30` }}>
              <CheckCircle className="w-3.5 h-3.5 shrink-0" />
              Fully optimised — no actions needed for this session
            </div>
          ) : (
            <div className="space-y-2">
              {result.recommendations.map(rec => {
                const Icon = REC_ICON[rec.type];
                const col  = REC_COLOR[rec.type];
                return (
                  <div key={rec.id} className="rounded-xl border px-3 py-2.5"
                    style={{ background: `${col}08`, borderColor: `${col}28` }}>
                    <div className="flex items-start gap-2">
                      <div className="shrink-0 mt-0.5" style={{ color: col }}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-[11px] font-semibold text-foreground">{rec.title}</p>
                          <span className="text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0"
                            style={{ background: `${col}18`, color: col }}>
                            {rec.impact}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">{rec.detail}</p>
                        {rec.tableIds && rec.tableIds.length > 0 && (
                          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                            {rec.tableIds.map(id => (
                              <span key={id} className="text-[9px] font-medium px-1.5 py-0.5 rounded border"
                                style={{ background: `${col}10`, borderColor: `${col}30`, color: col }}>
                                T{id}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function BookingOptimiser() {
  const navigate = useNavigate();
  const [showBanner,    setShowBanner]    = useState(true);
  const [date,          setDate]          = useState('2026-03-20');
  const [session,       setSession]       = useState<Session>('all');
  const [selected,      setSelected]      = useState<string | null>(null);
  const [extraSeats,    setExtraSeats]    = useState(0);
  const [rearrangeMode, setRearrangeMode] = useState(false);

  const algoResult = useMemo(
    () => runAlgorithm(date, session, rearrangeMode ? extraSeats : 0),
    [date, session, rearrangeMode, extraSeats],
  );

  const dayBookings = useMemo(() =>
    BOOKINGS
      .filter(b => b.date === date && b.status !== 'cancelled')
      .sort((a, b) => tm(a.startTime) - tm(b.startTime)),
    [date],
  );

  const prevDay = () => { setSelected(null); setDate(fmt(addDays(new Date(date), -1))); };
  const nextDay = () => { setSelected(null); setDate(fmt(addDays(new Date(date),  1))); };

  return (
    <AppLayout>
      <div className="flex flex-col h-full min-h-0" style={{ background: P.bg }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="h-14 border-b border-border flex items-center px-5 gap-3 shrink-0 bg-white/90 backdrop-blur-sm">
          <button onClick={() => navigate('/optimizers')}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />
            Optimizers
          </button>
          <span className="text-muted-foreground/40">·</span>
          <div className="flex items-center gap-1.5">
            <CalendarCheck className="w-4 h-4" style={{ color: P.primary }} />
            <h1 className="text-sm font-semibold tracking-tight">Booking Optimiser</h1>
          </div>

          <div className="flex-1" />

          {/* Session tabs */}
          <div className="flex items-center bg-muted/40 rounded-lg p-0.5 border border-border/60 gap-0.5">
            {(['all', 'lunch', 'dinner'] as Session[]).map(s => (
              <button key={s} onClick={() => setSession(s)}
                className={cn('px-3 py-1 text-[11px] font-medium rounded-md transition-all',
                  session === s
                    ? 'bg-white text-foreground shadow-sm border border-border/40'
                    : 'text-muted-foreground hover:text-foreground')}>
                {s === 'all' ? 'All day' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {/* How it works */}
          <button onClick={() => setShowBanner(v => !v)}
            className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors',
              showBanner
                ? 'bg-orange-50 border-orange-200 text-orange-700'
                : 'border-border text-muted-foreground hover:text-foreground')}>
            <Info className="w-3.5 h-3.5" />
            {showBanner ? 'Hide' : 'How it works'}
          </button>
        </div>

        {/* ── Explanation banner ──────────────────────────────────────────── */}
        {showBanner && (
          <div className="border-b border-border bg-white shrink-0">
            <div className="px-5 py-4 flex gap-4 items-start">
              <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: '#FEF3EC' }}>
                <CalendarCheck className="w-4 h-4" style={{ color: P.primary }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-foreground">How the Booking Optimiser works</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                  A live algorithm scans your restaurant floor plan and booking calendar to surface inefficiencies before service begins — party-size mismatches, back-to-back turn risks, idle gaps, underutilised sections, and unconfirmed reservations. Click any table on the floor map to inspect its bookings and get targeted actions from the algorithm.
                </p>
              </div>
              <button onClick={() => setShowBanner(false)}
                className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground text-xs mt-0.5">✕</button>
            </div>
            <div className="grid grid-cols-4 divide-x divide-border border-t border-border">
              {[
                { icon: MapPin,         title: 'Live floor map',       body: 'Top-down interactive view of your restaurant. Tables are colour-coded by status — click any to inspect bookings and efficiency score.' },
                { icon: Zap,            title: 'Real-time algorithm',  body: 'Recomputes every time you change date or session. Scores each table 0–100 and generates a prioritised actions list instantly.' },
                { icon: AlertTriangle,  title: 'Turn-time risk',       body: 'Flags back-to-back bookings with under 15 min buffer, party-size mismatches, and idle gaps longer than 75 minutes.' },
                { icon: TrendingUp,     title: 'Occupancy & capacity', body: 'Tracks covers vs total capacity, avg turn time, section utilisation, and pending bookings so you act before the first guest arrives.' },
              ].map(({ icon: Icon, title, body }) => (
                <div key={title} className="px-5 py-3.5 flex gap-3">
                  <div className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center mt-0.5"
                    style={{ background: '#FEF3EC' }}>
                    <Icon className="w-3.5 h-3.5" style={{ color: P.primary }} />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-foreground">{title}</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── KPI strip ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3 px-5 py-3 border-b border-border shrink-0 bg-white/60">
          {[
            { label: 'Occupancy',     value: `${algoResult.occupancy}%`,                              sub: `${algoResult.totalCovers} of ${TOTAL_CAP} covers`,             color: P.primary, icon: Users    },
            { label: 'Avg turn time', value: algoResult.avgTurnMin ? `${algoResult.avgTurnMin}m` : '—', sub: 'minutes per table',                                           color: P.primary, icon: Clock    },
            { label: 'Issues found',  value: algoResult.criticalCount + algoResult.mismatchCount,     sub: `${algoResult.recommendations.length} recommendations`,          color: algoResult.criticalCount > 0 ? P.rose : P.primary, icon: Activity },
          ].map(k => (
            <div key={k.label} className="flex items-center gap-3 bg-white rounded-xl border border-border px-4 py-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${k.color}12` }}>
                <k.icon className="w-4 h-4" style={{ color: k.color }} />
              </div>
              <div>
                <p className="text-xl font-bold leading-tight" style={{ color: k.color }}>{k.value}</p>
                <p className="text-[10px] text-muted-foreground font-medium">{k.label}</p>
                <p className="text-[9px] text-muted-foreground/70">{k.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Main 3-panel body ────────────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* Left: booking list */}
          <div className="w-60 border-r border-border flex flex-col shrink-0 bg-white overflow-hidden">

            {/* ── Capacity panel ─────────────────────────────────────────── */}
            <div className="px-3 pt-3 pb-3 border-b border-border shrink-0"
              style={{ background: rearrangeMode ? '#FEF3EC' : 'white' }}>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
                <LayoutGrid className="w-3 h-3" />
                Capacity Planner
              </p>

              {/* Extra seats input */}
              <div className="mb-2.5">
                <label className="text-[10px] text-muted-foreground block mb-1">Extra seats available</label>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setExtraSeats(s => Math.max(0, s - 1))}
                    className="w-6 h-6 rounded border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors">
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  <div className="flex-1 text-center text-[13px] font-bold text-foreground tabular-nums">
                    {extraSeats}
                  </div>
                  <button
                    onClick={() => setExtraSeats(s => Math.min(30, s + 1))}
                    className="w-6 h-6 rounded border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors">
                    <ChevronUp className="w-3 h-3" />
                  </button>
                </div>
                <input
                  type="range" min={0} max={30} value={extraSeats}
                  onChange={e => setExtraSeats(Number(e.target.value))}
                  className="w-full mt-1.5 accent-orange-500 h-1"
                />
                <div className="flex justify-between text-[9px] text-muted-foreground/60 mt-0.5">
                  <span>0</span><span>30</span>
                </div>
              </div>

              {/* Rearrange button */}
              <button
                onClick={() => {
                  if (extraSeats === 0) { setRearrangeMode(false); return; }
                  setRearrangeMode(v => !v);
                }}
                disabled={extraSeats === 0}
                className={cn(
                  'w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[11px] font-semibold transition-all duration-200',
                  rearrangeMode
                    ? 'text-white scale-[1.02]'
                    : extraSeats > 0
                      ? 'text-white hover:opacity-90'
                      : 'bg-muted/30 text-muted-foreground cursor-not-allowed',
                )}
                style={extraSeats > 0 ? { background: P.primary } : {}}>
                <Sparkles className="w-3.5 h-3.5" />
                {rearrangeMode ? 'Hide expansion zones' : 'Rearrange for demand'}
              </button>
              {extraSeats === 0 && (
                <p className="text-[9px] text-muted-foreground text-center mt-1.5">
                  Set extra seats above to enable
                </p>
              )}
              {rearrangeMode && (
                <p className="text-[9px] text-center mt-1.5 font-medium" style={{ color: P.primary }}>
                  {algoResult.recommendedSlots.length} zones highlighted on floor map
                </p>
              )}
            </div>

            {/* Date nav */}
            <div className="h-11 border-b border-border flex items-center px-3 gap-2 shrink-0">
              <button onClick={prevDay}
                className="p-1 rounded hover:bg-muted/30 text-muted-foreground hover:text-foreground">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="flex-1 text-center text-[11px] font-semibold text-foreground">{fmtDate(date)}</span>
              <button onClick={nextDay}
                className="p-1 rounded hover:bg-muted/30 text-muted-foreground hover:text-foreground">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Day summary strip */}
            <div className="px-3 py-2 border-b border-border/60 bg-muted/10 shrink-0">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span><span className="font-semibold text-foreground">{dayBookings.filter(b => b.status !== 'no-show').length}</span> bookings</span>
                <span><span className="font-semibold text-foreground">{dayBookings.reduce((s, b) => s + (b.status !== 'no-show' ? b.partySize : 0), 0)}</span> covers</span>
                <span>Score: <span className="font-bold" style={{ color: P.primary }}>{algoResult.score}</span></span>
              </div>
            </div>

            {/* Booking list */}
            <div className="flex-1 overflow-y-auto min-h-0 py-1.5">
              {dayBookings.length === 0 ? (
                <div className="px-4 py-10 text-center text-[11px] text-muted-foreground">
                  No bookings for this date
                </div>
              ) : (
                <div className="space-y-1 px-2">
                  {dayBookings.map(b => {
                    const isHl = selected === b.tableNumber;
                    return (
                      <div key={b.id}
                        onClick={() => setSelected(isHl ? null : b.tableNumber)}
                        className={cn(
                          'rounded-lg px-2.5 py-2 cursor-pointer border transition-colors',
                          isHl
                            ? 'bg-orange-50 border-orange-200'
                            : 'bg-white border-border/60 hover:bg-muted/10 hover:border-border',
                        )}>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] font-semibold text-foreground truncate flex-1">{b.guestName}</span>
                          <span className="text-[9px] font-medium px-1 py-0.5 rounded border shrink-0 capitalize"
                            style={{
                              color: STATUS_COLOR[b.status],
                              background: `${STATUS_COLOR[b.status]}12`,
                              borderColor: `${STATUS_COLOR[b.status]}30`,
                            }}>
                            {b.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 text-[9px] text-muted-foreground">
                          <span>{fmtTime(b.startTime)}</span>
                          <span className="text-muted-foreground/40">·</span>
                          <span>{b.partySize}p</span>
                          <span className="text-muted-foreground/40">·</span>
                          <span>T{b.tableNumber}</span>
                        </div>
                        {b.notes && (
                          <p className="text-[9px] text-muted-foreground/60 mt-0.5 truncate italic">{b.notes}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Center: floor plan */}
          <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden p-4">
            <FloorPlan
              date={date}
              session={session}
              selected={selected}
              onSelect={setSelected}
              algo={algoResult}
              rearrangeMode={rearrangeMode}
            />
          </div>

          {/* Right: algorithm panel */}
          <div className="w-72 border-l border-border bg-white shrink-0 flex flex-col overflow-hidden">
            <AlgoPanel
              result={algoResult} selected={selected}
              date={date} session={session}
              rearrangeMode={rearrangeMode} extraSeats={extraSeats}
            />
          </div>

        </div>
      </div>
    </AppLayout>
  );
}

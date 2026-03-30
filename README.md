# PricePulse 🚀

AI-powered dynamic pricing engine for bars, restaurants, and hospitality venues. Claude reasons across live real-world signals and recommends real-time price adjustments pushed directly to your digital menu.

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 14+
- Redis 7+
- Anthropic API key

### 1. Environment Setup

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and fill in:
- `DATABASE_URL` — your PostgreSQL connection string
- `REDIS_URL` — your Redis URL
- `ANTHROPIC_API_KEY` — your Anthropic API key (`sk-ant-...`)
- `ENCRYPTION_KEY` — exactly 32 characters (for encrypting POS credentials)
- `JWT_SECRET` — any random string
- `JWT_REFRESH_SECRET` — any random string

Optional (for richer signals):
- `PREDICTHQ_API_KEY` — for nearby events (free tier available)
- `GOOGLE_PLACES_API_KEY` — for nearby venue status
- Weather is via Open-Meteo — **completely free, no key required**

### 2. Database Setup

```bash
# Create the database
createdb pricepulse

# Run migrations
npm run db:migrate --workspace=backend
```

### 3. Install & Run

```bash
# Install all dependencies
npm install

# Run both backend and frontend
npm run dev
```

- Backend: http://localhost:3001
- Frontend: http://localhost:5173

## Architecture

```
/pricepulse
  /backend        Node.js + Express + TypeScript
  /frontend       React + Vite + TypeScript + Tailwind
  /shared         Shared TypeScript types
```

### Signal Collection (every 60s per venue)

1. **Time signals** — Current time, day, period (Dinner Rush, Late Night, etc.), UK bank holidays
2. **Weather** — Open-Meteo API (free, no key) — condition, temperature, precipitation
3. **Nearby events** — PredictHQ API — concerts, sports, festivals within 1km
4. **Nearby venues** — Google Places API — open/closing status of competitors
5. **Occupancy** — Manual input or POS webhook

A **demand score (0–100)** is computed from all signals and sent to Claude.

### Claude Pricing Engine

Every 60 seconds, Claude receives full context (venue, signals, menu items, pricing history) and returns:
- Overall price multiplier (e.g. ×1.25)
- Per-item price recommendations with reasons
- Confidence level (high/medium/low)
- Plain English reasoning for the venue owner
- "Review again at" timestamp

### Pricing Modes

| Mode | Behaviour |
|------|-----------|
| **Auto** | Prices applied immediately, no approval needed |
| **Suggest** | Claude recommends, owner approves with 5-min countdown |
| **Manual** | Claude advises only, owner applies prices manually |

### Menu Integrations

| Provider | Method |
|----------|--------|
| **QR Only** | Hosted menu page at `/menu/:slug` — prices update in real-time via SSE |
| **Square** | OAuth2 or personal access token → Catalog API |
| **Toast** | Client credentials OAuth → Menu/Config API |
| **Lightspeed** | OAuth2 → Item API |
| **Wix** | API key → Restaurants API |
| **Custom API** | Any REST API with configurable field mapping |

### First-Time Onboarding (< 5 minutes)

1. Register → add venue (name, address, coordinates, capacity)
2. Go to Integrations → click **"QR Only — get started in 60 sec"**
3. Add 5–10 menu items manually
4. Get your QR code URL
5. First Claude analysis runs within 2 minutes of signup

## API Routes

| Route | Description |
|-------|-------------|
| `POST /api/auth/register` | Create account |
| `POST /api/auth/login` | Login |
| `GET /api/venues` | List your venues |
| `POST /api/venues` | Create venue |
| `GET /api/venues/:id/pricing/current` | Current decision + signals |
| `POST /api/venues/:id/pricing/trigger` | Manually trigger Claude |
| `POST /api/venues/:id/pricing/approve` | Approve suggested prices |
| `POST /api/venues/:id/pricing/chat` | Chat with Claude about pricing |
| `GET /api/venues/:id/signals` | Live signal data |
| `GET /api/venues/:id/dashboard` | Dashboard summary |
| `GET /menu/:slug` | Public hosted menu page (QR) |
| `GET /sse/menu/:venueId` | SSE stream for live price updates |

## WebSocket Events

**Server → Client:**
- `pricing:new_decision` — new Claude recommendation ready
- `pricing:applied` — prices pushed to POS
- `pricing:failed` — POS update failed
- `signals:updated` — new signal snapshot
- `venue:mode_changed` — pricing mode changed

**Client → Server:**
- `venue:join` — subscribe to venue events
- `pricing:approve` — approve suggested pricing
- `pricing:override` — manual price override
- `venue:set_mode` — change pricing mode

## Tech Stack

**Backend:** Node.js 20, TypeScript, Express, PostgreSQL, Drizzle ORM, Redis, BullMQ, Socket.io, Anthropic SDK

**Frontend:** React 18, Vite, TypeScript, Tailwind CSS, Radix UI, React Query, Zustand, Recharts, Socket.io client

## Production Deployment

Recommended:
- **Railway** or **Render** for backend + Postgres + Redis
- **Vercel** for frontend

Set environment variables in your hosting provider's dashboard.

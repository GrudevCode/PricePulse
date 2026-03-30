/**
 * AI Service
 *
 * Production: set VITE_GROQ_API_KEY in .env → uses Groq (llama-3.1-8b-instant, free tier, ~300 tok/s)
 * Development: mock streaming with canned responses — no API key needed
 *
 * Swap to Claude: change endpoint + model + auth header.
 */

// ─── System prompt ────────────────────────────────────────────────────────────

export const SYSTEM_PROMPT = `You are PricePulse Intelligence, an AI assistant embedded in a restaurant management platform. You have real-time access to all venue data.

Current venue snapshot (March 20 2026, Friday):
- Menus: 3 active menus (Dinner, Lunch, Bar), 47 products total. Top margins: Truffle Arancini 76%, Wagyu Burger 71%, Burrata Salad 68%. Underperformers: Lobster Bisque 41%, Seafood Platter 38%.
- Bookings: Saturday at 87% occupancy (+23% vs last week). Sunday lunch up 34% MoM. Cancellation rate 8.2% (down from 11.4%). Average party size 2.8.
- Inventory: 3 items below par — Mixed Salad Leaves (7 kg / par 10 kg), Ribeye Steak (4 portions / par 12), Prosecco NV (6 bottles / par 15).
- Revenue: £28,450 this week, +12% vs prior week. 847 covers, avg spend £33.60, food cost 28.4%.

Be concise, specific, and data-driven. Use markdown with **bold** for key figures. Reference real numbers from above. Keep responses under 280 words unless asked for a detailed breakdown.`;

// ─── Reasoning steps ─────────────────────────────────────────────────────────

export function getReasoningSteps(query: string): string[] {
  const q = query.toLowerCase();
  const base = [
    'Connecting to menus…',
    'Connecting to bookings…',
    'Connecting to inventory…',
  ];

  if (q.match(/invent|stock|restock|order|supply|par level/)) {
    return [...base,
      'Reading 21 tracked ingredients…',
      'Identifying items below par level…',
      'Calculating velocity-adjusted reorder quantities…',
    ];
  }
  if (q.match(/pric|optimis|margin|upsell|revenue/)) {
    return [...base,
      'Fetching current occupancy signals…',
      'Analysing price-elasticity across 47 items…',
      'Modelling revenue uplift scenarios…',
    ];
  }
  if (q.match(/book|reserv|cover|capacity|turn|table/)) {
    return [...base,
      'Parsing 30-day booking calendar…',
      'Segmenting by party size and time slot…',
      'Detecting cancellation rate patterns…',
    ];
  }
  if (q.match(/dish|menu|item|food|cook|chef/)) {
    return [...base,
      'Loading gross margin data for 47 dishes…',
      'Comparing food cost vs selling price…',
      'Flagging engineering opportunities…',
    ];
  }
  if (q.match(/forecast|demand|weekend|saturday|sunday/)) {
    return [...base,
      'Pulling this weekend\'s booking trajectory…',
      'Cross-referencing local event signals…',
      'Running demand forecast model…',
    ];
  }
  return [...base,
    'Aggregating weekly revenue signals…',
    'Correlating occupancy with margin data…',
    'Synthesising business health metrics…',
  ];
}

// ─── Mock responses (no API key) ─────────────────────────────────────────────

function getMockResponse(query: string): string {
  const q = query.toLowerCase();

  if (q.match(/invent|stock|restock|order|supply/)) {
    return `**Inventory Status — 3 Items Below Par**

You currently have 3 items that need ordering before the weekend:

- **Mixed Salad Leaves** — 7 kg on hand (par: 10 kg) — order **4 kg**
- **Ribeye Steak** — 4 portions (par: 12) — order **10 portions**
- **Prosecco NV** — 6 bottles (par: 15) — order **10 bottles**

Given Saturday's **+23% demand spike**, I recommend ordering at **1.3× normal quantities** to cover the uplift. Estimated cost to restock: **£248**.

Would you like me to draft supplier order emails for all three items?`;
  }

  if (q.match(/pric|optimis|revenue/)) {
    return `**Dynamic Pricing Recommendation — Friday Evening**

Current occupancy is tracking at **87%** for Saturday — above the 80% threshold where price elasticity narrows.

Suggested adjustments for Friday 18:00–22:00:

1. **Wagyu Burger** +£1.50 — demand signal high, currently under-indexed
2. **Truffle Fries** +£0.75 — complements top-seller, low pushback risk
3. **House Red (bottle)** +£2.00 — bar attachment rate 68%, headroom confirmed

Projected revenue uplift: **£380–£520** for the evening session.

Shall I push these to the pricing scheduler?`;
  }

  if (q.match(/book|reserv|cover|capacity/)) {
    return `**Booking Pattern Analysis — March 2026**

Key trends this month:

1. **Peak slots** — Fri & Sat 19:00–21:00 account for **41% of all covers**
2. **Fastest-growing segment** — Sunday lunch up **34% month-on-month**
3. **Cancellation rate** — 8.2% (down from 11.4% in February)
4. **Average party size** — 2.8 covers (slightly down from 3.1)

**Recommendation:** A Sunday lunch prix-fixe at £28–£32 per head would capitalise on the growth trend and increase avg spend. Estimated revenue uplift: **+£1,200/month**.`;
  }

  if (q.match(/margin|dish|menu|food cost/)) {
    return `**Menu Engineering Matrix — This Week**

**Star performers (high margin + high volume):**
1. Truffle Arancini — **76% GM** (£8.50 GP/cover)
2. Wagyu Burger — **71% GM** (£12.20 GP/cover)
3. Burrata Salad — **68% GM** (£6.40 GP/cover)

**Items to review:**
- Lobster Bisque — 41% GM (supplier price increase, +£1.80/portion)
- Seafood Platter — 38% GM — consider repricing to £32 or removing

Removing the Seafood Platter and reallocating kitchen time to Arancini production could add **£640/week** in gross profit.`;
  }

  if (q.match(/forecast|demand|weekend|saturday/)) {
    return `**Weekend Demand Forecast**

Saturday bookings are tracking **+23% above** last week's equivalent, driven by:
- Early reservations in the **19:00–21:00 window** (62% booked already)
- A food festival 0.4 miles away on Saturday afternoon
- Strong Sunday lunch momentum (+34% MoM)

**Recommended preparation:**

1. **Raise cover prices 8–12%** for Saturday dinner — demand headroom confirmed
2. **Pre-stage bar inventory** — wine & cocktails spike ~30% on high-demand nights
3. **Order the 3 below-par items** before Friday close

Projected Saturday revenue: **£9,800–£10,400** (vs £8,640 last Saturday).`;
  }

  if (q.match(/summary|health|overview|how are we|how.*doing/)) {
    return `**Business Health Summary — Week of Mar 17–23**

| Metric | Value | vs Prior Week |
|---|---|---|
| Revenue | £28,450 | ↑ 12% |
| Covers | 847 | ↑ 8% |
| Avg spend | £33.60 | ↑ 3.7% |
| Food cost % | 28.4% | ✓ on target |
| Booking fill rate | 91% | ↑ from 84% |

**Watch:** 3 inventory items below par — order before Friday.

**Opportunity:** Sunday lunch +34% — consider expanding capacity or adding a set menu.

Overall: **strong week** with positive momentum heading into the weekend.`;
  }

  return `**Analysis Complete**

Based on your venue data for this week:

**Revenue** is up **12%** to £28,450 with 847 covers at an average of £33.60 per head — both trending in the right direction.

**This weekend** looks strong: Saturday is at **87% occupancy** and tracking +23% vs last week. Pre-stage your bar inventory and consider enabling a **Saturday premium** of 8–10% on your top-10 dishes.

**Inventory** needs attention: 3 items are below par (Mixed Salad Leaves, Ribeye Steak, Prosecco NV). I recommend placing orders today to avoid service gaps.

What would you like me to dig into further?`;
}

// ─── Streaming generator ─────────────────────────────────────────────────────

export type ChatHistoryItem = { role: 'user' | 'assistant'; content: string };

export async function* streamAIResponse(
  query: string,
  history: ChatHistoryItem[],
): AsyncGenerator<string> {
  const apiKey = (import.meta as unknown as { env: Record<string, string> }).env?.VITE_GROQ_API_KEY;

  if (apiKey) {
    // ── Real Groq API (llama-3.1-8b-instant) ──────────────────────────────
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...history.slice(-8),
          { role: 'user', content: query },
        ],
        stream: true,
        max_tokens: 700,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      // Fall through to mock on error
      yield* mockStream(getMockResponse(query));
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const raw = decoder.decode(value);
      for (const line of raw.split('\n')) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;
        try {
          const token: string = JSON.parse(data)?.choices?.[0]?.delta?.content ?? '';
          if (token) yield token;
        } catch {
          // ignore malformed SSE chunks
        }
      }
    }
  } else {
    // ── Mock streaming (dev mode — no API key needed) ─────────────────────
    yield* mockStream(getMockResponse(query));
  }
}

async function* mockStream(text: string): AsyncGenerator<string> {
  // Tokenise preserving whitespace so markdown renders correctly mid-stream
  const tokens = text.match(/\S+|\s+/g) ?? [];
  for (const token of tokens) {
    yield token;
    if (token.trim()) {
      await new Promise<void>(r => setTimeout(r, 14 + Math.random() * 22));
    }
  }
}

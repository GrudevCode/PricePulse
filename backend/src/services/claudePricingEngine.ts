import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { getDb, schema } from '../db';
import { eq, desc } from 'drizzle-orm';
import type { ClaudeRecommendation } from '@pricepulse/shared';
import { collectSignals, PERIOD_LABELS } from './signalCollector';
import { getIo } from '../lib/socket';

const useOpenAI = process.env.AI_PROVIDER === 'openai';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY || 'placeholder' });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'placeholder' });

// Model to use for each provider
const ANTHROPIC_MODEL = 'claude-sonnet-4-20250514';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

async function callAI(systemPrompt: string, userMessage: string): Promise<string> {
  if (useOpenAI) {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      max_tokens: 2048,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });
    return completion.choices[0]?.message?.content ?? '';
  } else {
    const message = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
    return message.content[0].type === 'text' ? message.content[0].text : '';
  }
}

const SYSTEM_PROMPT = `You are PricePulse, an expert AI revenue management system for hospitality venues.
Your job is to analyse real-time signals and recommend precise price adjustments
for each menu item to maximise revenue without harming customer experience.

PRICING PHILOSOPHY:
- Never exceed the venue's set maximum price per item
- Never go below the venue's set minimum price per item
- Consider customer psychology: big sudden jumps feel aggressive
- Late night / post-event surges are expected and accepted by customers
- Bad weather that keeps people home = lower demand = hold or slight reduction
- Bad weather that drives people indoors = higher demand = modest increase
- A concert ending nearby in 30 minutes = anticipate surge, price up NOW
- If occupancy is already 90%+, you can push prices harder — they're clearly popular
- If occupancy is below 30%, do not surge — focus on driving volume
- Competitor pricing matters: if you're already £3 above competitors on entry, be cautious

OCCUPANCY RULES:
- If current_occupancy_pct is null it means the venue has NOT configured occupancy tracking.
  In that case, DO NOT assume the venue is empty. Rely solely on time-of-day, day-of-week,
  weather, nearby events, and demand_score to make your recommendation.
- A demand_score above 55 should generally lead to price increases (×1.05 to ×1.20).
- A demand_score of 45-55 should hold prices near baseline (×0.97 to ×1.05).
- Only reduce prices (below ×0.97) when demand_score is below 45 AND there are clear
  negative signals like heavy rain, early morning, or confirmed slow period.

OUTPUT FORMAT — respond ONLY with valid JSON, no other text:
{
  "overall_multiplier": 1.25,
  "confidence": "high" | "medium" | "low",
  "reasoning": "2-3 sentence plain English explanation for the venue owner",
  "recommended_prices": [
    {
      "item_id": "uuid",
      "new_price_pence": 850,
      "change_reason": "short reason"
    }
  ],
  "review_again_at": "ISO timestamp — when conditions will change next",
  "alert": null | "string — only if something important to flag"
}`;

// ─── Build context for Claude ─────────────────────────────────────────────────

async function buildContext(venueId: string) {
  const db = getDb();

  const [venue, menuItems, recentDecisions, latestSignal] = await Promise.all([
    db.query.venues.findFirst({ where: eq(schema.venues.id, venueId) }),
    db.query.menuItems.findMany({ where: eq(schema.menuItems.venueId, venueId) }),
    db.query.pricingDecisions.findMany({
      where: eq(schema.pricingDecisions.venueId, venueId),
      orderBy: [desc(schema.pricingDecisions.decidedAt)],
      limit: 3,
    }),
    db.query.signalSnapshots.findFirst({
      where: eq(schema.signalSnapshots.venueId, venueId),
      orderBy: [desc(schema.signalSnapshots.capturedAt)],
    }),
  ]);

  if (!venue) throw new Error(`Venue ${venueId} not found`);
  if (!latestSignal) throw new Error(`No signals collected yet for venue ${venueId}`);

  const now = new Date();

  return {
    venue: {
      name: venue.name,
      address: venue.address,
      capacity: venue.capacity,
      // null means occupancy tracking not configured — do NOT treat as empty venue
      current_occupancy_pct: (venue.currentOccupancyPct && venue.currentOccupancyPct > 0)
        ? venue.currentOccupancyPct
        : null,
      cuisine_type: venue.cuisineType,
      competitor_notes: venue.competitorNotes || 'No competitor data entered',
    },
    time: {
      iso_string: now.toISOString(),
      hour: now.getHours(),
      day_of_week: latestSignal.dayOfWeek,
      period: latestSignal.period,
      period_label: PERIOD_LABELS[latestSignal.period as keyof typeof PERIOD_LABELS] || latestSignal.period,
      is_bank_holiday: latestSignal.isPublicHoliday,
    },
    weather: {
      condition: latestSignal.weatherCondition,
      temperature_c: parseFloat(String(latestSignal.temperatureC)),
      precipitation_mm: parseFloat(String(latestSignal.precipitationMm)),
    },
    demand_score: latestSignal.demandScore,
    nearby_events: latestSignal.nearbyEvents || [],
    nearby_venues: latestSignal.nearbyVenuesOpen || [],
    menu_items: menuItems.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      base_price_pence: item.basePrice,
      current_price_pence: item.currentPrice,
      min_price: item.minPrice,
      max_price: item.maxPrice,
      dynamic_pricing_enabled: item.isDynamicPricingEnabled,
    })),
    recent_pricing_history: recentDecisions.map((d) => ({
      decided_at: d.decidedAt,
      recommended_multiplier: d.recommendedMultiplier,
      applied_multiplier: d.appliedMultiplier,
      mode: d.mode,
      reasoning_summary: d.claudeReasoning.substring(0, 100),
    })),
  };
}

// ─── Validate prices stay in bounds ──────────────────────────────────────────

function validatePrices(
  recommendation: ClaudeRecommendation,
  menuItems: Array<{ id: string; minPrice: number; maxPrice: number; isDynamicPricingEnabled: boolean }>
): ClaudeRecommendation {
  const itemMap = new Map(menuItems.map((i) => [i.id, i]));

  const validated = recommendation.recommendedPrices
    .filter((rec) => {
      const item = itemMap.get(rec.itemId);
      return item && item.isDynamicPricingEnabled;
    })
    .map((rec) => {
      const item = itemMap.get(rec.itemId)!;
      const clamped = Math.max(item.minPrice, Math.min(item.maxPrice, rec.newPricePence));
      return { ...rec, newPricePence: clamped };
    });

  return { ...recommendation, recommendedPrices: validated };
}

// ─── Parse Claude response ────────────────────────────────────────────────────

function parseClaudeResponse(content: string): ClaudeRecommendation {
  // Strip any markdown code blocks if present
  const cleaned = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(cleaned);

  return {
    overallMultiplier: parsed.overall_multiplier,
    confidence: parsed.confidence,
    reasoning: parsed.reasoning,
    recommendedPrices: (parsed.recommended_prices || []).map(
      (r: { item_id: string; new_price_pence: number; change_reason: string }) => ({
        itemId: r.item_id,
        newPricePence: r.new_price_pence,
        changeReason: r.change_reason,
      })
    ),
    reviewAgainAt: parsed.review_again_at,
    alert: parsed.alert || null,
  };
}

// ─── Apply prices to menu items ───────────────────────────────────────────────

async function applyPrices(
  venueId: string,
  recommendation: ClaudeRecommendation
): Promise<number> {
  const db = getDb();
  let updatedCount = 0;

  for (const rec of recommendation.recommendedPrices) {
    await db.update(schema.menuItems)
      .set({ currentPrice: rec.newPricePence, lastUpdatedAt: new Date() })
      .where(eq(schema.menuItems.id, rec.itemId));
    updatedCount++;
  }

  return updatedCount;
}

// ─── Main pricing engine function ────────────────────────────────────────────

export async function runPricingEngine(venueId: string, manualTrigger = false): Promise<void> {
  const db = getDb();
  const io = getIo();

  console.log(`[Pricing] Starting engine for venue ${venueId} (manual: ${manualTrigger})`);

  // Collect fresh signals
  const signalSnapshot = await collectSignals(venueId);
  io.to(`venue:${venueId}`).emit('signals:updated', { venueId, signals: signalSnapshot });

  const venue = await db.query.venues.findFirst({ where: eq(schema.venues.id, venueId) });
  if (!venue) throw new Error('Venue not found');

  const menuItems = await db.query.menuItems.findMany({
    where: eq(schema.menuItems.venueId, venueId),
  });

  if (menuItems.length === 0) {
    console.log(`[Pricing] No menu items for venue ${venueId}, skipping`);
    return;
  }

  // Build context
  const context = await buildContext(venueId);

  // Call Claude
  let recommendation: ClaudeRecommendation;
  let rawResponse = '';

  const userMessage = `Current venue context:\n${JSON.stringify(context, null, 2)}\n\nAnalyse all signals and recommend price adjustments. Be specific about causation — which signals drove which decisions. Consider what will happen in the next 60-90 minutes not just right now.`;

  try {
    rawResponse = await callAI(SYSTEM_PROMPT, userMessage);
    recommendation = parseClaudeResponse(rawResponse);
  } catch (err) {
    // Retry once
    const provider = useOpenAI ? 'OpenAI' : 'Claude';
    console.warn(`[Pricing] ${provider} call failed, retrying...`, (err as Error).message);
    try {
      await new Promise((r) => setTimeout(r, 2000));
      rawResponse = await callAI(SYSTEM_PROMPT, userMessage);
      recommendation = parseClaudeResponse(rawResponse);
    } catch (retryErr) {
      const errMsg = (retryErr as Error).message;
      console.error(`[Pricing] ${provider} retry failed:`, errMsg);
      io.to(`venue:${venueId}`).emit('pricing:failed', { venueId, error: errMsg });
      return;
    }
  }

  // Validate price bounds
  recommendation = validatePrices(recommendation, menuItems);

  // Determine mode
  const mode = manualTrigger ? 'suggested' : venue.pricingMode === 'auto' ? 'auto' : 'suggested';

  // Store decision
  const [decision] = await db.insert(schema.pricingDecisions).values({
    venueId,
    signalsSnapshot: signalSnapshot,
    claudeReasoning: recommendation.reasoning,
    recommendedMultiplier: String(recommendation.overallMultiplier),
    appliedMultiplier: mode === 'auto' ? String(recommendation.overallMultiplier) : null,
    itemsUpdated: 0,
    mode,
    recommendation,
    isApproved: mode === 'auto' ? true : null,
  }).returning();

  // Emit to dashboard
  io.to(`venue:${venueId}`).emit('pricing:new_decision', { venueId, decision: { ...decision, recommendation } });

  // If auto mode, apply immediately
  if (mode === 'auto') {
    try {
      const updatedCount = await applyPrices(venueId, recommendation);
      await db.update(schema.pricingDecisions)
        .set({ itemsUpdated: updatedCount, approvedAt: new Date() })
        .where(eq(schema.pricingDecisions.id, decision.id));

      io.to(`venue:${venueId}`).emit('pricing:applied', {
        venueId,
        decisionId: decision.id,
        itemsUpdated: updatedCount,
      });

      console.log(`[Pricing] Auto-applied ${updatedCount} price updates for venue ${venue.name}`);
    } catch (err) {
      console.error('[Pricing] Auto-apply failed:', (err as Error).message);
      io.to(`venue:${venueId}`).emit('pricing:failed', {
        venueId,
        decisionId: decision.id,
        error: (err as Error).message,
      });
    }
  }

  console.log(`[Pricing] Decision stored for ${venue.name}: ×${recommendation.overallMultiplier} (${recommendation.confidence} confidence)`);
}

// ─── Approve a suggested pricing decision ────────────────────────────────────

export async function approvePricingDecision(decisionId: string, venueId: string): Promise<void> {
  const db = getDb();
  const io = getIo();

  const decision = await db.query.pricingDecisions.findFirst({
    where: eq(schema.pricingDecisions.id, decisionId),
  });

  if (!decision) throw new Error('Decision not found');

  const recommendation = decision.recommendation as unknown as ClaudeRecommendation;
  const menuItems = await db.query.menuItems.findMany({ where: eq(schema.menuItems.venueId, venueId) });
  const validatedRec = validatePrices(recommendation, menuItems);

  const updatedCount = await applyPrices(venueId, validatedRec);

  await db.update(schema.pricingDecisions)
    .set({
      isApproved: true,
      approvedAt: new Date(),
      itemsUpdated: updatedCount,
      appliedMultiplier: decision.recommendedMultiplier,
      mode: 'auto',
    })
    .where(eq(schema.pricingDecisions.id, decisionId));

  io.to(`venue:${venueId}`).emit('pricing:applied', {
    venueId,
    decisionId,
    itemsUpdated: updatedCount,
  });
}

// ─── Chat with Claude about pricing ──────────────────────────────────────────

export async function chatWithClaude(
  venueId: string,
  userMessage: string,
  conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<{ response: string; recommendation?: ClaudeRecommendation }> {
  const context = await buildContext(venueId);

  const systemPrompt = `${SYSTEM_PROMPT}

You are in a conversational mode with a venue owner. Answer their questions about pricing strategy, 
current conditions, and recommendations. When relevant, include specific price recommendations in 
your response as valid JSON within a code block like this:
\`\`\`json
{ "recommendation": { ... } }
\`\`\`

Current venue context:
${JSON.stringify(context, null, 2)}`;

  let text: string;

  if (useOpenAI) {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: systemPrompt },
        ...conversationHistory,
        { role: 'user', content: userMessage },
      ],
    });
    text = completion.choices[0]?.message?.content ?? '';
  } else {
    const response = await anthropic.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        { role: 'user' as const, content: userMessage },
      ],
    });
    text = response.content[0].type === 'text' ? response.content[0].text : '';
  }

  // Extract recommendation if present
  let recommendation: ClaudeRecommendation | undefined;
  const jsonMatch = text.match(/```json\n([\s\S]*?)\n```/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.recommendation) {
        recommendation = parseClaudeResponse(JSON.stringify(parsed.recommendation));
      }
    } catch {
      // ignore parse errors in chat mode
    }
  }

  return { response: text, recommendation };
}

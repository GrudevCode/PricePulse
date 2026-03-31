import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { initSocket } from './lib/socket';
import { getDb, getPool } from './db';
import { ensureSchemaPatches } from './db/ensureSchemaPatches';
import { startPricingWorker, scheduleVenuePricingJobs, getPricingQueue } from './jobs/pricingQueue';

import authRoutes from './routes/auth';
import clerkWebhookRoutes from './routes/webhooks/clerk';
import venueRoutes from './routes/venues';
import menuRoutes from './routes/menu';
import menuDefRoutes from './routes/menu/menus';
import categoryRoutes from './routes/menu/categories';
import ingredientRoutes from './routes/menu/ingredients';
import pricingRoutes from './routes/pricing';
import signalRoutes from './routes/signals';
import integrationRoutes from './routes/integrations';
import dashboardRoutes from './routes/dashboard';
import publicMenuRoutes from './routes/menu/public';
import scheduleRoutes from './routes/menu/schedule';
import sseRoutes from './routes/sse';
import bookingRoutes from './routes/bookings';
import inventoryRoutes from './routes/inventory';
import orderRoutes from './routes/orders';
import posRoutes from './routes/pos';
import recipeRoutes from './routes/recipes';

const app = express();
const httpServer = createServer(app);

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(helmet({ contentSecurityPolicy: false }));
const _allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',').map((o) => o.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow server-to-server requests (no Origin header) and listed origins
    if (!origin || _allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin "${origin}" not allowed`));
  },
  credentials: true,
}));
app.use(morgan('dev'));

// ─── Clerk webhook — must come BEFORE express.json() to keep raw body ────────
// svix needs the raw Buffer to verify the HMAC signature.
app.use('/api/webhooks/clerk', express.raw({ type: 'application/json' }), clerkWebhookRoutes);

// ─── All other routes use JSON body parsing ───────────────────────────────────
app.use(express.json({ limit: '2mb' }));

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/venues', venueRoutes);
app.use('/api/venues/:id/menu-items', menuRoutes);
app.use('/api/venues/:id/menus', menuDefRoutes);
app.use('/api/venues/:id/menus/:menuId/categories', categoryRoutes);
app.use('/api/menu-items/:itemId/ingredients', ingredientRoutes);
app.use('/api/venues/:id/pricing', pricingRoutes);
app.use('/api/venues/:id/signals', signalRoutes);
app.use('/api/venues/:id/integrations', integrationRoutes);
app.use('/api/venues/:id/dashboard', dashboardRoutes);
app.use('/api/venues/:id/schedule', scheduleRoutes);
app.use('/api/venues/:id', bookingRoutes);
app.use('/api/venues/:id', inventoryRoutes);
app.use('/api/venues/:id', orderRoutes);
app.use('/api/venues/:id', posRoutes);
app.use('/api/venues/:id', recipeRoutes);

// ─── Public Routes (no auth) ──────────────────────────────────────────────────

app.use('/menu', publicMenuRoutes);
app.use('/sse', sseRoutes);

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── WebSocket ────────────────────────────────────────────────────────────────

initSocket(httpServer);

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT || '3001');

async function start() {
  try {
    const pool = getPool();
    await pool.query('SELECT 1');
    console.log('[DB] Connected to PostgreSQL');
    try {
      await ensureSchemaPatches(pool);
    } catch (patchErr) {
      console.error('[DB] Schema patch failed (run npm run db:migrate):', (patchErr as Error).message);
    }
  } catch (err) {
    console.error('[DB] Connection failed:', (err as Error).message);
    console.warn('[DB] Continuing without DB — will fail on first request');
  }

  // Optional: start dynamic pricing worker (disabled by default for local/dev)
  if (process.env.ENABLE_PRICING === 'true') {
    startPricingWorker();
    console.log('[Queue] Pricing worker started');

    try {
      await scheduleVenuePricingJobs();
    } catch (err) {
      console.warn('[Queue] Failed to schedule jobs (DB may not be ready):', (err as Error).message);
    }
  } else {
    console.log('[Queue] Pricing worker disabled (set ENABLE_PRICING=true to enable).');
  }

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`\n[Server] Port ${PORT} already in use. Kill it with: lsof -ti:${PORT} | xargs kill -9\n`);
    } else {
      console.error('[Server] Fatal error:', err);
    }
    process.exit(1);
  });

  httpServer.listen(PORT, () => {
    console.log(`\n🚀 PricePulse backend running on http://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   Public menu: http://localhost:${PORT}/menu/:slug\n`);
  });
}

start();

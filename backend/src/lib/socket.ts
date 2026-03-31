import { Server as SocketIoServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import { verifyToken } from '@clerk/backend';

let io: SocketIoServer;

export function initSocket(httpServer: HttpServer): SocketIoServer {
  const _wsOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
    .split(',').map((o) => o.trim()).filter(Boolean);

  io = new SocketIoServer(httpServer, {
    cors: {
      origin: (origin, cb) => {
        if (!origin || _wsOrigins.includes(origin)) return cb(null, true);
        cb(new Error(`WS CORS: origin "${origin}" not allowed`));
      },
      credentials: true,
    },
  });

  // Auth middleware — accepts Clerk JWT; falls back to unauthenticated (public menu pages)
  io.use(async (socket, next) => {
    const raw = socket.handshake.auth?.token || socket.handshake.headers['authorization'];
    if (!raw) {
      socket.data.isPublic = true;
      return next();
    }

    const token = typeof raw === 'string' && raw.startsWith('Bearer ')
      ? raw.slice(7)
      : raw as string;

    try {
      const verified    = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY });
      const claims      = verified as Record<string, unknown>;
      socket.data.clerkUserId = typeof claims.sub === 'string' ? claims.sub : undefined;
      next();
    } catch {
      // Token invalid — allow as public rather than hard-reject (graceful degradation)
      socket.data.isPublic = true;
      next();
    }
  });

  io.on('connection', (socket) => {
    console.log(`[WS] Client connected: ${socket.id} (clerk: ${socket.data.clerkUserId || 'public'})`);

    socket.on('venue:join', (venueId: string) => {
      socket.join(`venue:${venueId}`);
      console.log(`[WS] Socket ${socket.id} joined venue:${venueId}`);
    });

    socket.on('venue:leave', (venueId: string) => {
      socket.leave(`venue:${venueId}`);
    });

    socket.on('pricing:approve', async ({ venueId, decisionId }) => {
      try {
        const { approvePricingDecision } = await import('../services/claudePricingEngine');
        await approvePricingDecision(decisionId, venueId);
      } catch (err) {
        socket.emit('pricing:failed', { venueId, decisionId, error: (err as Error).message });
      }
    });

    socket.on('pricing:override', async ({ venueId, itemId, newPricePence }) => {
      try {
        const { getDb, schema } = await import('../db');
        const { eq }            = await import('drizzle-orm');
        const db = getDb();
        await db.update(schema.menuItems)
          .set({ currentPrice: newPricePence, lastUpdatedAt: new Date() })
          .where(eq(schema.menuItems.id, itemId));

        io.to(`venue:${venueId}`).emit('pricing:applied', {
          venueId, decisionId: null, itemsUpdated: 1,
        });
      } catch (err) {
        socket.emit('pricing:failed', { venueId, error: (err as Error).message });
      }
    });

    socket.on('venue:set_mode', async ({ venueId, mode }) => {
      try {
        const { getDb, schema } = await import('../db');
        const { eq }            = await import('drizzle-orm');
        const db = getDb();
        await db.update(schema.venues)
          .set({ pricingMode: mode, updatedAt: new Date() })
          .where(eq(schema.venues.id, venueId));
        io.to(`venue:${venueId}`).emit('venue:mode_changed', { venueId, mode });
      } catch (err) {
        socket.emit('error', { message: (err as Error).message });
      }
    });

    socket.on('disconnect', () => {
      console.log(`[WS] Client disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIo(): SocketIoServer {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
}

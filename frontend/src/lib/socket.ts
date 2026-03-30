import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

function socketOrigin(): string | undefined {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  const origin = env?.VITE_BACKEND_ORIGIN?.replace(/\/$/, '');
  return origin || undefined;
}

/**
 * Returns the shared Socket.io instance.
 * Connects on first call; reuses on subsequent calls.
 *
 * Auth: the backend accepts unauthenticated socket connections and relies on
 * venue rooms for event scoping. All real data security is enforced by the
 * HTTP API routes (Clerk Bearer tokens via api.ts).
 */
export function getSocket(): Socket {
  if (!socket) {
    const url = socketOrigin();
    socket = io(url ?? '/', {
      transports: ['websocket', 'polling'],
    });

    socket.on('connect',       () => console.log('[WS] Connected'));
    socket.on('disconnect',    () => console.log('[WS] Disconnected'));
    socket.on('connect_error', (err) => console.error('[WS] Error:', err.message));
  }
  return socket;
}

export function joinVenueRoom(venueId: string): void {
  getSocket().emit('venue:join', venueId);
}

export function leaveVenueRoom(venueId: string): void {
  getSocket().emit('venue:leave', venueId);
}

export function disconnectSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

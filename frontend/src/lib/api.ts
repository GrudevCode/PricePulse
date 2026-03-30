import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

/** Fetch the active Clerk session token from the global Clerk instance. */
async function getClerkSessionToken(): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const clerk = (window as Window & {
    Clerk?: { session?: { getToken: () => Promise<string | null> } };
  }).Clerk;
  if (!clerk?.session?.getToken) return null;
  try {
    return await clerk.session.getToken();
  } catch {
    return null;
  }
}

// Attach Clerk token to every request
api.interceptors.request.use(async (config) => {
  // Skip auth header for public endpoints (none currently, but safe to have)
  const path = `${config.baseURL ?? ''}${config.url ?? ''}`;
  if (/\/(public|health)\b/.test(path)) return config;

  const token = await getClerkSessionToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401 — Clerk session likely expired; redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clerk will handle re-authentication via <SignIn> redirect
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export default api;

// ─── Shared types ─────────────────────────────────────────────────────────────

/** A time-based menu switch within a scheduled day */
export interface ScheduleTimeSwitch {
  hhmm: string;    // "HH:MM" — when this menu becomes active
  menuId: string;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

export const venueApi = {
  list: () => api.get('/venues'),
  get:  (venueId: string) => api.get(`/venues/${venueId}`),
  create: (data: Record<string, unknown>) => api.post('/venues', data),
  update: (venueId: string, data: Record<string, unknown>) => api.patch(`/venues/${venueId}`, data),
  delete: (venueId: string) => api.delete(`/venues/${venueId}`),
  updateQrMenuSettings: (venueId: string, data: Record<string, unknown>) =>
    api.patch(`/venues/${venueId}/qr-menu-settings`, data),
};

export const menuApi = {
  // Menu items
  list:         (venueId: string) => api.get(`/venues/${venueId}/menu-items`),
  listItems:    (venueId: string) => api.get(`/venues/${venueId}/menu-items`),
  create:       (venueId: string, data: Record<string, unknown>) => api.post(`/venues/${venueId}/menu-items`, data),
  createItem:   (venueId: string, data: Record<string, unknown>) => api.post(`/venues/${venueId}/menu-items`, data),
  update:       (venueId: string, itemId: string, data: Record<string, unknown>) => api.patch(`/venues/${venueId}/menu-items/${itemId}`, data),
  updateItem:   (venueId: string, itemId: string, data: Record<string, unknown>) => api.patch(`/venues/${venueId}/menu-items/${itemId}`, data),
  delete:       (venueId: string, itemId: string) => api.delete(`/venues/${venueId}/menu-items/${itemId}`),
  deleteItem:   (venueId: string, itemId: string) => api.delete(`/venues/${venueId}/menu-items/${itemId}`),
  bulkUpdate:   (venueId: string, data: Record<string, unknown>) => api.post(`/venues/${venueId}/menu-items/bulk-update`, data),
};

/** Menu definitions (menu containers, not items) */
export const menusApi = {
  list:   (venueId: string) => api.get(`/venues/${venueId}/menus`),
  create: (venueId: string, data: Record<string, unknown>) => api.post(`/venues/${venueId}/menus`, data),
  update: (venueId: string, menuId: string, data: Record<string, unknown>) => api.patch(`/venues/${venueId}/menus/${menuId}`, data),
  remove: (venueId: string, menuId: string) => api.delete(`/venues/${venueId}/menus/${menuId}`),
};

/** Menu categories */
export const categoriesApi = {
  list:   (venueId: string, menuId: string) => api.get(`/venues/${venueId}/menus/${menuId}/categories`),
  create: (venueId: string, menuId: string, data: Record<string, unknown>) => api.post(`/venues/${venueId}/menus/${menuId}/categories`, data),
  update: (venueId: string, menuId: string, catId: string, data: Record<string, unknown>) => api.patch(`/venues/${venueId}/menus/${menuId}/categories/${catId}`, data),
  remove: (venueId: string, menuId: string, catId: string) => api.delete(`/venues/${venueId}/menus/${menuId}/categories/${catId}`),
};

/** Menu item ingredients */
export const ingredientsApi = {
  list:   (itemId: string) => api.get(`/menu-items/${itemId}/ingredients`),
  create: (itemId: string, data: Record<string, unknown>) => api.post(`/menu-items/${itemId}/ingredients`, data),
  update: (itemId: string, ingId: string, data: Record<string, unknown>) => api.patch(`/menu-items/${itemId}/ingredients/${ingId}`, data),
  remove: (itemId: string, ingId: string) => api.delete(`/menu-items/${itemId}/ingredients/${ingId}`),
  reorder:(itemId: string, ids: string[]) => api.post(`/menu-items/${itemId}/ingredients/reorder`, { ids }),
};

export const pricingApi = {
  decisions:   (venueId: string) => api.get(`/venues/${venueId}/pricing/decisions`),
  approve:     (venueId: string, decisionId: string) => api.post(`/venues/${venueId}/pricing/decisions/${decisionId}/approve`),
  reject:      (venueId: string, decisionId: string) => api.post(`/venues/${venueId}/pricing/decisions/${decisionId}/reject`),
  trigger:     (venueId: string) => api.post(`/venues/${venueId}/pricing/trigger`),
  history:     (venueId: string, itemId: string) => api.get(`/venues/${venueId}/pricing/history/${itemId}`),
  allHistory:  (venueId: string, params?: Record<string, unknown>) => api.get(`/venues/${venueId}/pricing/history`, { params }),
  config:      (venueId: string) => api.get(`/venues/${venueId}/pricing/config`),
  updateConfig:(venueId: string, data: Record<string, unknown>) => api.patch(`/venues/${venueId}/pricing/config`, data),
  mode:        (venueId: string, mode: string) => api.post(`/venues/${venueId}/pricing/mode`, { mode }),
  chat:        (venueId: string, text: string, history: unknown[]) =>
    api.post(`/venues/${venueId}/pricing/chat`, { text, history }),
};

export const signalApi = {
  list:    (venueId: string) => api.get(`/venues/${venueId}/signals`),
  history: (venueId: string, hours?: number) =>
    api.get(`/venues/${venueId}/signals/history`, { params: hours ? { hours } : undefined }),
  create:  (venueId: string, data: Record<string, unknown>) => api.post(`/venues/${venueId}/signals`, data),
  update:  (venueId: string, signalId: string, data: Record<string, unknown>) => api.patch(`/venues/${venueId}/signals/${signalId}`, data),
  delete:  (venueId: string, signalId: string) => api.delete(`/venues/${venueId}/signals/${signalId}`),
  trigger: (venueId: string, signalId: string) => api.post(`/venues/${venueId}/signals/${signalId}/trigger`),
};

export const integrationApi = {
  list:       (venueId: string) => api.get(`/venues/${venueId}/integrations`),
  create:     (venueId: string, data: Record<string, unknown>) => api.post(`/venues/${venueId}/integrations`, data),
  connect:    (venueId: string, provider: string, data: Record<string, unknown>) => api.post(`/venues/${venueId}/integrations/${provider}/connect`, data),
  disconnect: (venueId: string, provider: string) => api.delete(`/venues/${venueId}/integrations/${provider}`),
  delete:     (venueId: string, intId: string) => api.delete(`/venues/${venueId}/integrations/${intId}`),
  sync:       (venueId: string, provider: string) => api.post(`/venues/${venueId}/integrations/${provider}/sync`),
  test:       (venueId: string, intId: string) => api.post(`/venues/${venueId}/integrations/${intId}/test`),
  status:     (venueId: string) => api.get(`/venues/${venueId}/integrations/status`),
};

export const dashboardApi = {
  summary: (venueId: string) => api.get(`/venues/${venueId}/dashboard/summary`),
  metrics: (venueId: string, params?: Record<string, unknown>) => api.get(`/venues/${venueId}/dashboard/metrics`, { params }),
  qr:      (venueId: string) => api.get(`/venues/${venueId}/dashboard/qr`),
};

export const scheduleApi = {
  list:   (venueId: string, from?: string, to?: string) =>
    api.get(`/venues/${venueId}/schedule`, { params: from ? { from, to } : undefined }),
  upsert: (venueId: string, data: Record<string, unknown>) => api.post(`/venues/${venueId}/schedule`, data),
  save:   (venueId: string, data: unknown) => api.post(`/venues/${venueId}/schedule`, data),
  delete: (venueId: string, scheduleId: string) => api.delete(`/venues/${venueId}/schedule/${scheduleId}`),
};

export const bookingApi = {
  tables:         (venueId: string) => api.get(`/venues/${venueId}/tables`),
  list:           (venueId: string, params?: Record<string, unknown>) => api.get(`/venues/${venueId}/bookings`, { params }),
  bookingsByDate: (venueId: string, date: string) => api.get(`/venues/${venueId}/bookings`, { params: { date } }),
  bookingState:   (venueId: string, date: string) => api.get(`/venues/${venueId}/booking-state`, { params: { date } }),
  createBooking:  (venueId: string, data: Record<string, unknown>) => api.post(`/venues/${venueId}/bookings`, data),
  updateBooking:  (venueId: string, bookingId: string, data: Record<string, unknown>) => api.patch(`/venues/${venueId}/bookings/${bookingId}`, data),
  deleteBooking:  (venueId: string, bookingId: string) => api.delete(`/venues/${venueId}/bookings/${bookingId}`),
  saveTables:     (venueId: string, tables: unknown[]) => api.put(`/venues/${venueId}/tables`, { tables }),
  setTableStatus: (venueId: string, tableId: string, status: string) => api.patch(`/venues/${venueId}/tables/${tableId}/status`, { status }),
  setAutoStatus:  (venueId: string, tableId: string, autoStatus: boolean) => api.patch(`/venues/${venueId}/tables/${tableId}/auto-status`, { autoStatus }),
  orderHistory:   (venueId: string, params: Record<string, unknown>) => api.get(`/venues/${venueId}/bookings/order-history`, { params }),
  getCleaningTimer: (venueId: string) => api.get(`/venues/${venueId}/cleaning-timer`),
  setCleaningTimer: (venueId: string, minutes: number) => api.patch(`/venues/${venueId}/cleaning-timer`, { minutes }),
};

export const inventoryApi = {
  list:           (venueId: string, date?: string) =>
    api.get(`/venues/${venueId}/inventory-items`, { params: date ? { date } : undefined }),
  get:            (venueId: string, itemId: string) => api.get(`/venues/${venueId}/inventory-items/${itemId}`),
  create:         (venueId: string, data: Record<string, unknown>) => api.post(`/venues/${venueId}/inventory-items`, data),
  update:         (venueId: string, itemId: string, data: Record<string, unknown>) => api.patch(`/venues/${venueId}/inventory-items/${itemId}`, data),
  delete:         (venueId: string, itemId: string) => api.delete(`/venues/${venueId}/inventory-items/${itemId}`),
  remove:         (venueId: string, itemId: string) => api.delete(`/venues/${venueId}/inventory-items/${itemId}`),
  recordMovement: (venueId: string, itemId: string, data: Record<string, unknown>) => api.post(`/venues/${venueId}/inventory-items/${itemId}/movements`, data),
  movements:      (venueId: string, itemId: string) => api.get(`/venues/${venueId}/inventory-items/${itemId}/movements`),
  sections:       (venueId: string) => api.get(`/venues/${venueId}/inventory-sections`),
  createSection:  (venueId: string, name: string) => api.post(`/venues/${venueId}/inventory-sections`, { name }),
  renameSection:  (venueId: string, sectionId: string, name: string) =>
    api.patch(`/venues/${venueId}/inventory-sections/${sectionId}`, { name }),
  deleteSection:  (venueId: string, sectionId: string) =>
    api.delete(`/venues/${venueId}/inventory-sections/${sectionId}`),
};

export const orderApi = {
  list:     (venueId: string, date?: string) =>
    api.get(`/venues/${venueId}/orders`, { params: date ? { date } : undefined }),
  create:   (venueId: string, data: Record<string, unknown>) =>
    api.post(`/venues/${venueId}/orders`, data),
  update:   (venueId: string, orderId: string, data: Record<string, unknown>) =>
    api.patch(`/venues/${venueId}/orders/${orderId}`, data),
  addItems: (venueId: string, orderId: string, items: Array<{ name: string; qty: number; unitPricePence: number }>) =>
    api.post(`/venues/${venueId}/orders/${orderId}/items`, { items }),
  remove:   (venueId: string, orderId: string) =>
    api.delete(`/venues/${venueId}/orders/${orderId}`),
};

export const posApi = {
  menu:          (venueId: string) => api.get(`/venues/${venueId}/pos/menu`),
  activeTickets: (venueId: string) => api.get(`/venues/${venueId}/pos/tickets/active`),
  listTickets:   (venueId: string, params?: Record<string, unknown>) => api.get(`/venues/${venueId}/pos/tickets`, { params }),
  createTicket:  (venueId: string, data: Record<string, unknown>) => api.post(`/venues/${venueId}/pos/tickets`, data),
  updateTicket:  (venueId: string, ticketId: string, data: Record<string, unknown>) => api.patch(`/venues/${venueId}/pos/tickets/${ticketId}`, data),
  parkTicket:    (venueId: string, ticketId: string) => api.post(`/venues/${venueId}/pos/tickets/${ticketId}/park`),
  reopenTicket:  (venueId: string, ticketId: string) => api.post(`/venues/${venueId}/pos/tickets/${ticketId}/reopen`),
  voidTicket:    (venueId: string, ticketId: string, reason: string) => api.delete(`/venues/${venueId}/pos/tickets/${ticketId}`, { data: { reason } }),
  getTicket:     (venueId: string, ticketId: string) => api.get(`/venues/${venueId}/pos/tickets/${ticketId}`),
  addItems:      (venueId: string, ticketId: string, items: Array<Record<string, unknown>>) =>
    api.post(`/venues/${venueId}/pos/tickets/${ticketId}/items`, { items }),
  updateItem:    (venueId: string, ticketId: string, itemId: string, data: Record<string, unknown>) =>
    api.patch(`/venues/${venueId}/pos/tickets/${ticketId}/items/${itemId}`, data),
  removeItem:    (venueId: string, ticketId: string, itemId: string) =>
    api.delete(`/venues/${venueId}/pos/tickets/${ticketId}/items/${itemId}`),
  applyDiscount: (venueId: string, ticketId: string, data: Record<string, unknown>) =>
    api.post(`/venues/${venueId}/pos/tickets/${ticketId}/discount`, data),
  splitTicket:   (venueId: string, ticketId: string, data: Record<string, unknown>) =>
    api.post(`/venues/${venueId}/pos/tickets/${ticketId}/split`, data),
  pay:           (venueId: string, ticketId: string, data: Record<string, unknown>) =>
    api.post(`/venues/${venueId}/pos/tickets/${ticketId}/pay`, data),
  payments:      (venueId: string, ticketId: string) =>
    api.get(`/venues/${venueId}/pos/tickets/${ticketId}/payments`),
  refund:        (venueId: string, paymentId: string, data: { amountPence: number; reason: string }) =>
    api.post(`/venues/${venueId}/pos/payments/${paymentId}/refund`, data),
  openSession:   (venueId: string, data: Record<string, unknown>) => api.post(`/venues/${venueId}/pos/sessions/open`, data),
  closeSession:  (venueId: string, data: Record<string, unknown>) => api.post(`/venues/${venueId}/pos/sessions/close`, data),
  currentSession:(venueId: string) => api.get(`/venues/${venueId}/pos/sessions/current`),
};

export const recipeApi = {
  list:            (venueId: string) => api.get(`/venues/${venueId}/recipes`),
  get:             (venueId: string, recipeId: string) => api.get(`/venues/${venueId}/recipes/${recipeId}`),
  create:          (venueId: string, data: Record<string, unknown>) => api.post(`/venues/${venueId}/recipes`, data),
  update:          (venueId: string, recipeId: string, data: Record<string, unknown>) => api.put(`/venues/${venueId}/recipes/${recipeId}`, data),
  delete:          (venueId: string, recipeId: string) => api.delete(`/venues/${venueId}/recipes/${recipeId}`),
  remove:          (venueId: string, recipeId: string) => api.delete(`/venues/${venueId}/recipes/${recipeId}`),
  publish:         (venueId: string, recipeId: string, sellPricePence: number) => api.post(`/venues/${venueId}/recipes/${recipeId}/publish`, { sellPricePence }),
  ingredients:     (venueId: string) => api.get(`/venues/${venueId}/recipes/ingredients`),
  listSubRecipes:  (venueId: string) => api.get(`/venues/${venueId}/recipes/sub-recipes`),
  createSubRecipe: (venueId: string, data: Record<string, unknown>) => api.post(`/venues/${venueId}/recipes/sub-recipes`, data),
  updateSubRecipe: (venueId: string, subRecipeId: string, data: Record<string, unknown>) => api.put(`/venues/${venueId}/recipes/sub-recipes/${subRecipeId}`, data),
  removeSubRecipe: (venueId: string, subRecipeId: string) => api.delete(`/venues/${venueId}/recipes/sub-recipes/${subRecipeId}`),
};

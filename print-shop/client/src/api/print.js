import api from './axios';

const unwrap = (p) => p.then((r) => r.data.data);

export const printApi = {
  dashboard: () => unwrap(api.get('/dashboard')),

  changePassword: (body) => api.put('/auth/password', body).then((r) => r.data),

  // The download needs the auth header, so it comes back as a blob rather than
  // a plain link the browser would fetch unauthenticated.
  downloadBackup: async () => {
    const response = await api.get('/backup', { responseType: 'blob' });
    const name = /filename="?([^"]+)"?/.exec(response.headers['content-disposition'] || '')?.[1]
      || 'print-shop-backup.sqlite';
    const url = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return name;
  },

  getSettings: () => unwrap(api.get('/settings')),

  shopify: () => unwrap(api.get('/shopify')),
  saveShopify: (body) => unwrap(api.put('/shopify', body)),
  disconnectShopify: () => unwrap(api.delete('/shopify')),
  testShopify: () => api.post('/shopify/test').then((r) => r.data),
  pullShopifyProducts: (body) => api.post('/shopify/pull/products', body || {}).then((r) => r.data),
  pullShopifyOrders: (body) => api.post('/shopify/pull/orders', body || {}).then((r) => r.data),
  shopifyRedirectUri: () => unwrap(api.get('/shopify/oauth/redirect-uri')),
  startShopifyConnect: (body) => api.post('/shopify/oauth/start', body || {}).then((r) => r.data),
  shopifyWebhooks: () => unwrap(api.get('/shopify/webhooks')),
  enableShopifyWebhooks: (body) => api.post('/shopify/webhooks', body || {}).then((r) => r.data),
  disableShopifyWebhooks: () => api.delete('/shopify/webhooks').then((r) => r.data),
  sweepShopifyOrders: () => api.post('/shopify/sweep').then((r) => r.data),
  saveSettings: (body) => unwrap(api.put('/settings', body)),

  filaments: (params) => unwrap(api.get('/filaments', { params })),
  filament: (id) => unwrap(api.get(`/filaments/${id}`)),
  createFilament: (body) => unwrap(api.post('/filaments', body)),
  updateFilament: (id, body) => unwrap(api.put(`/filaments/${id}`, body)),
  deleteFilament: (id) => api.delete(`/filaments/${id}`),
  addSpools: (id, body) => unwrap(api.post(`/filaments/${id}/spools`, body)),
  updateSpool: (spoolId, body) => unwrap(api.put(`/filaments/spools/${spoolId}`, body)),
  deleteSpool: (spoolId) => unwrap(api.delete(`/filaments/spools/${spoolId}`)),
  consumeFilament: (id, body) => unwrap(api.post(`/filaments/${id}/consume`, body)),

  spoolLocations: () => unwrap(api.get('/filaments/locations')),
  previewFilamentImport: (csv) => unwrap(api.post('/filaments/import', { csv, apply: false })),
  applyFilamentImport: (csv) => api.post('/filaments/import', { csv, apply: true }).then((r) => r.data),
  moveSpool: (spoolId, location, swap) =>
    api.put(`/filaments/spools/${spoolId}/location`, { location, swap }).then((r) => r.data),

  materials: (params) => unwrap(api.get('/materials', { params })),
  createMaterial: (body) => unwrap(api.post('/materials', body)),
  updateMaterial: (id, body) => unwrap(api.put(`/materials/${id}`, body)),
  deleteMaterial: (id) => api.delete(`/materials/${id}`),
  adjustMaterial: (id, body) => unwrap(api.post(`/materials/${id}/adjust`, body)),

  catalog: (params) => unwrap(api.get('/catalog', { params })),
  catalogOptions: () => unwrap(api.get('/catalog/options')),
  previewCatalogImport: (csv, options) => unwrap(api.post('/catalog/import', { csv, apply: false, ...options })),
  applyCatalogImport: (csv, options) => api.post('/catalog/import', { csv, apply: true, ...options }).then((r) => r.data),
  item: (id) => unwrap(api.get(`/catalog/${id}`)),
  previewItem: (body) => unwrap(api.post('/catalog/preview', body)),
  createItem: (body) => unwrap(api.post('/catalog', body)),
  updateItem: (id, body) => unwrap(api.put(`/catalog/${id}`, body)),
  deleteItem: (id) => api.delete(`/catalog/${id}`),
  adjustItem: (id, body) => unwrap(api.post(`/catalog/${id}/adjust`, body)),

  orders: (params) => unwrap(api.get('/orders', { params })),
  order: (id) => unwrap(api.get(`/orders/${id}`)),
  createOrder: (body) => unwrap(api.post('/orders', body)),
  updateOrder: (id, body) => unwrap(api.put(`/orders/${id}`, body)),
  deleteOrder: (id) => api.delete(`/orders/${id}`),
  queueOrder: (id, body) => api.post(`/orders/${id}/queue`, body).then((r) => r.data),
  orderStages: () => unwrap(api.get('/orders/stages')),
  advanceOrder: (id, body) => api.post(`/orders/${id}/advance`, body || {}).then((r) => r.data),
  suggestShipDate: (params) => unwrap(api.get('/orders/suggest-ship-date', { params })),

  queue: () => unwrap(api.get('/queue')),
  addToQueue: (body) => unwrap(api.post('/queue', body)),
  updateQueue: (id, body) => unwrap(api.put(`/queue/${id}`, body)),
  removeFromQueue: (id) => unwrap(api.delete(`/queue/${id}`)),
  reorderQueue: (ids) => unwrap(api.put('/queue/reorder/positions', { ids })),
  shortages: () => unwrap(api.get('/queue/shortages')),

  pickList: (id) => unwrap(api.get(`/queue/${id}/picklist`)),
  rebuildPickList: (id) => unwrap(api.delete(`/queue/${id}/picklist`)),
  setPicked: (pickId, picked) => unwrap(api.put(`/queue/picks/${pickId}`, { picked })),
  scanPick: (id, code) => api.post(`/queue/${id}/picklist/scan`, { code }).then((r) => r.data),

  scanLookup: (code) => unwrap(api.post('/scan/lookup', { code })),
  scanAction: (body) => api.post('/scan/action', body).then((r) => r.data),
  scanAdvance: (body) => api.post('/scan/advance', body).then((r) => r.data),
  scanTargets: () => unwrap(api.get('/scan/targets')),
  scanLink: (body) => api.post('/scan/link', body).then((r) => r.data),
};

/**
 * Turn an axios failure into something that tells you what to do about it.
 * The pages used to swallow these entirely, which made every problem look
 * identical from the outside.
 */
export function describeError(err, fallback = 'Something went wrong') {
  if (!err) return fallback;

  // No response at all: the request never reached the server.
  if (!err.response) {
    if (err.code === 'ECONNABORTED') return 'The server took too long to answer. Try again.';
    return 'Could not reach the server. Check your connection, then try again.';
  }

  const status = err.response.status;
  const serverSaid = err.response.data?.error;

  if (status === 401) return 'Your session ended. Sign in again.';
  if (status === 403) return serverSaid || 'That is not allowed.';
  if (status === 404) return serverSaid || 'That is not there any more.';
  if (status === 429) return serverSaid || 'Too many requests. Wait a moment.';
  if (status >= 500) return serverSaid ? `Server error: ${serverSaid}` : `Server error (${status}).`;
  return serverSaid || fallback;
}

export const money = (n) =>
  (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export const grams = (n) => {
  const value = Number(n) || 0;
  return value >= 1000 ? `${(value / 1000).toFixed(2)} kg` : `${Math.round(value)} g`;
};

export const hoursMinutes = (minutes) => {
  const total = Math.round(Number(minutes) || 0);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
};

export const shortDate = (value) =>
  value ? new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—';

export default printApi;

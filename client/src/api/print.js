import api from './axios';

const unwrap = (p) => p.then((r) => r.data.data);

export const printApi = {
  dashboard: () => unwrap(api.get('/print/dashboard')),

  getSettings: () => unwrap(api.get('/print/settings')),
  saveSettings: (body) => unwrap(api.put('/print/settings', body)),

  filaments: (params) => unwrap(api.get('/print/filaments', { params })),
  filament: (id) => unwrap(api.get(`/print/filaments/${id}`)),
  createFilament: (body) => unwrap(api.post('/print/filaments', body)),
  updateFilament: (id, body) => unwrap(api.put(`/print/filaments/${id}`, body)),
  deleteFilament: (id) => api.delete(`/print/filaments/${id}`),
  addSpools: (id, body) => unwrap(api.post(`/print/filaments/${id}/spools`, body)),
  updateSpool: (spoolId, body) => unwrap(api.put(`/print/filaments/spools/${spoolId}`, body)),
  deleteSpool: (spoolId) => unwrap(api.delete(`/print/filaments/spools/${spoolId}`)),
  consumeFilament: (id, body) => unwrap(api.post(`/print/filaments/${id}/consume`, body)),

  materials: (params) => unwrap(api.get('/print/materials', { params })),
  createMaterial: (body) => unwrap(api.post('/print/materials', body)),
  updateMaterial: (id, body) => unwrap(api.put(`/print/materials/${id}`, body)),
  deleteMaterial: (id) => api.delete(`/print/materials/${id}`),
  adjustMaterial: (id, body) => unwrap(api.post(`/print/materials/${id}/adjust`, body)),

  catalog: (params) => unwrap(api.get('/print/catalog', { params })),
  catalogOptions: () => unwrap(api.get('/print/catalog/options')),
  item: (id) => unwrap(api.get(`/print/catalog/${id}`)),
  previewItem: (body) => unwrap(api.post('/print/catalog/preview', body)),
  createItem: (body) => unwrap(api.post('/print/catalog', body)),
  updateItem: (id, body) => unwrap(api.put(`/print/catalog/${id}`, body)),
  deleteItem: (id) => api.delete(`/print/catalog/${id}`),
  adjustItem: (id, body) => unwrap(api.post(`/print/catalog/${id}/adjust`, body)),

  orders: (params) => unwrap(api.get('/print/orders', { params })),
  order: (id) => unwrap(api.get(`/print/orders/${id}`)),
  createOrder: (body) => unwrap(api.post('/print/orders', body)),
  updateOrder: (id, body) => unwrap(api.put(`/print/orders/${id}`, body)),
  deleteOrder: (id) => api.delete(`/print/orders/${id}`),
  queueOrder: (id, body) => api.post(`/print/orders/${id}/queue`, body).then((r) => r.data),
  suggestShipDate: (params) => unwrap(api.get('/print/orders/suggest-ship-date', { params })),

  queue: () => unwrap(api.get('/print/queue')),
  addToQueue: (body) => unwrap(api.post('/print/queue', body)),
  updateQueue: (id, body) => unwrap(api.put(`/print/queue/${id}`, body)),
  removeFromQueue: (id) => unwrap(api.delete(`/print/queue/${id}`)),
  reorderQueue: (ids) => unwrap(api.put('/print/queue/reorder/positions', { ids })),
  shortages: () => unwrap(api.get('/print/queue/shortages')),

  scanLookup: (code) => unwrap(api.post('/print/scan/lookup', { code })),
  scanAction: (body) => api.post('/print/scan/action', body).then((r) => r.data),
};

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

import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
let queued = [];

function flush(error, token = null) {
  queued.forEach(({ resolve, reject }) => (error ? reject(error) : resolve(token)));
  queued = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (!original) return Promise.reject(error);

    // No response at all — the request never landed. A tablet on shop wi-fi
    // drops one now and then, so give reads a single quiet second go before
    // calling it a failure. Writes are left alone: retrying them blind could
    // book the same stock movement twice.
    const isRead = (original.method || 'get').toLowerCase() === 'get';
    if (!error.response && isRead && !original._netRetry) {
      original._netRetry = true;
      await new Promise((resolve) => setTimeout(resolve, 700));
      return api(original);
    }

    if (error.response?.status !== 401 || original._retry) return Promise.reject(error);

    // Let one refresh run and have every other pending call wait on it.
    if (isRefreshing) {
      return new Promise((resolve, reject) => queued.push({ resolve, reject })).then((token) => {
        // Mark it too, so a still-bad token fails instead of looping.
        original._retry = true;
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      });
    }

    original._retry = true;
    isRefreshing = true;

    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      isRefreshing = false;
      window.location.href = '/login';
      return Promise.reject(error);
    }

    try {
      const { data } = await axios.post('/api/auth/refresh', { refreshToken });
      localStorage.setItem('accessToken', data.accessToken);
      flush(null, data.accessToken);
      original.headers.Authorization = `Bearer ${data.accessToken}`;
      return api(original);
    } catch (err) {
      flush(err);
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      window.location.href = '/login';
      return Promise.reject(err);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;

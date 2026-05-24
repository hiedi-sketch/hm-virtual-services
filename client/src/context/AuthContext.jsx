import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [clientData, setClientData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      api.get('/auth/me')
        .then(({ data }) => {
          setUser(data.user);
          setClientData(data.client);
        })
        .catch(() => {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  async function login(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    setUser(data.user);
    if (data.user.role === 'client') {
      const meData = await api.get('/auth/me');
      setClientData(meData.data.client);
    }
    return data.user;
  }

  async function logout() {
    const refreshToken = localStorage.getItem('refreshToken');
    try { await api.post('/auth/logout', { refreshToken }); } catch {}
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
    setClientData(null);
  }

  return (
    <AuthContext.Provider value={{ user, clientData, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

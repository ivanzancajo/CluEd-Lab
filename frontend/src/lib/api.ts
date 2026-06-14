import axios from 'axios';
import { clearAdminSession, getStoredAdminToken } from './auth';

// Creamos una instancia base para no tener que repetir la URL en cada petición
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

// Interceptor: Antes de que salga cualquier petición, comprobamos si hay un token
// y se lo pegamos en las cabeceras (headers) de autorización.
api.interceptors.request.use((config) => {
  const token = getStoredAdminToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if ([401, 403].includes(error.response?.status) && !String(error.config?.url || '').includes('/auth/login')) {
      clearAdminSession();
      if (typeof window !== 'undefined' && window.location.pathname !== '/') {
        window.location.assign('/');
      }
    }

    return Promise.reject(error);
  }
);

export default api;
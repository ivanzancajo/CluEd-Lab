import axios from 'axios';

// Creamos una instancia base para no tener que repetir la URL en cada petición
const api = axios.create({
  baseURL: 'http://localhost:4000/api',
});

// Interceptor: Antes de que salga cualquier petición, comprobamos si hay un token
// y se lo pegamos en las cabeceras (headers) de autorización.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
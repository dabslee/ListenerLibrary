import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true, // Important for session cookies
});

// Configure CSRF
api.defaults.xsrfCookieName = 'csrftoken';
api.defaults.xsrfHeaderName = 'X-CSRFToken';

export default api;

import axios from 'axios';

const baseURL = import.meta.env.DEV ? '/api' : (import.meta.env.VITE_LEXA_URL || '/api');

export const api = axios.create({
  baseURL,
  timeout: 60_000,
  headers: { 'Content-Type': 'application/json' },
});

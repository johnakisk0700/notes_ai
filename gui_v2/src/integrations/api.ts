import axios from 'axios';
import { supabase } from './supabase/client';

const BASE_URL =
  import.meta.env.MODE === 'development' ? import.meta.env.VITE_API_DEV_URL : import.meta.env.VITE_API_PROD_URL;

const defaultHeaders: Record<string, string> = {
  'Content-Type': 'application/json',
};

export const api = axios.create({
  baseURL: BASE_URL, // Ensure this is defined
  headers: {},
  withCredentials: true, // Include if backend uses cookies/session-based auth
});

api.interceptors.request.use(
  async config => {
    // Get the current session from Supabase.
    // (Depending on your Supabase client version, this may be synchronous or asynchronous.)

    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (session && session.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`;
    }

    return config;
  },
  error => Promise.reject(error)
);

export async function fetchApi(
  path: string,
  options?: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
    body?: any;
    signal?: AbortSignal;
  }
) {
  const { method = 'GET', headers = {}, body, signal } = options || {};

  // Get the current session from Supabase before making the request
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // Prepare headers with authentication
  const authHeaders = { ...defaultHeaders, ...headers };
  if (session && session.access_token) {
    authHeaders.Authorization = `Bearer ${session.access_token}`;
  }

  const res = await fetch(BASE_URL + path, {
    method,
    credentials: 'include',
    headers: authHeaders,
    body: body != null ? JSON.stringify(body) : undefined,
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  return res;
}

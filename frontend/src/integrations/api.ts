import axios from 'axios';

export const BASE_URL =
  import.meta.env.MODE === 'development' ? import.meta.env.VITE_API_DEV_URL : import.meta.env.VITE_API_PROD_URL;

// Clerk exposes a global once <ClerkProvider> has mounted; read the active
// session token from it so non-React modules (this axios instance) can auth.
export async function getClerkToken(): Promise<string | null> {
  try {
    const clerk = (window as unknown as { Clerk?: { session?: { getToken: () => Promise<string | null> } } }).Clerk;
    return (await clerk?.session?.getToken()) ?? null;
  } catch {
    return null;
  }
}

export const api = axios.create({
  baseURL: BASE_URL, // Ensure this is defined
  headers: {},
  withCredentials: true, // Include if backend uses cookies/session-based auth
});

api.interceptors.request.use(
  async config => {
    const token = await getClerkToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => Promise.reject(error)
);

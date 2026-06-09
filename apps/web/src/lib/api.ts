import axios from 'axios';
import type { ApiResponse } from '@vr-tournament/shared';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  withCredentials: true,
});

let accessToken: string | null = localStorage.getItem('accessToken');

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) {
    localStorage.setItem('accessToken', token);
  } else {
    localStorage.removeItem('accessToken');
  }
}

export function getAccessToken() {
  return accessToken;
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

let isRefreshing = false;
let refreshQueue: Array<(token: string | null) => void> = [];

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      if (isRefreshing) {
        return new Promise((resolve) => {
          refreshQueue.push((token) => {
            if (token) {
              original.headers.Authorization = `Bearer ${token}`;
              resolve(api(original));
            } else {
              resolve(Promise.reject(error));
            }
          });
        });
      }

      original._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post<ApiResponse<{ accessToken: string }>>(
          `${API_URL}/api/v1/auth/refresh`,
          {},
          { withCredentials: true }
        );

        if (data.success && data.data?.accessToken) {
          setAccessToken(data.data.accessToken);
          refreshQueue.forEach((cb) => cb(data.data!.accessToken));
          refreshQueue = [];
          original.headers.Authorization = `Bearer ${data.data.accessToken}`;
          return api(original);
        }
      } catch {
        setAccessToken(null);
        refreshQueue.forEach((cb) => cb(null));
        refreshQueue = [];
        window.location.href = '/login';
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export async function apiGet<T>(url: string) {
  const { data } = await api.get<ApiResponse<T>>(url);
  if (!data.success) throw new Error(data.error?.message || 'Request failed');
  return data.data!;
}

export async function apiPost<T>(url: string, body?: unknown) {
  const { data } = await api.post<ApiResponse<T>>(url, body);
  if (!data.success) throw new Error(data.error?.message || 'Request failed');
  return data.data!;
}

export async function apiPatch<T>(url: string, body?: unknown) {
  const { data } = await api.patch<ApiResponse<T>>(url, body);
  if (!data.success) throw new Error(data.error?.message || 'Request failed');
  return data.data!;
}

export async function apiDelete<T>(url: string) {
  const { data } = await api.delete<ApiResponse<T>>(url);
  if (!data.success) throw new Error(data.error?.message || 'Request failed');
  return data.data!;
}

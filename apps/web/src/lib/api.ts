import axios from 'axios';
import type { ApiResponse } from '@vr-tournament/shared';
import { ApiClientError } from './user-messages';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export { ApiClientError } from './user-messages';
export { getUserErrorMessage, getRegisterConflict } from './user-messages';
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

const AUTH_NO_REFRESH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh'];

function shouldAttemptTokenRefresh(url: string | undefined): boolean {
  if (!url) return true;
  return !AUTH_NO_REFRESH_PATHS.some((path) => url.includes(path));
}

function toApiError(err: unknown): ApiClientError {
  if (axios.isAxiosError(err) && err.response?.data && typeof err.response.data === 'object') {
    const payload = err.response.data as ApiResponse<unknown>;
    if (payload.error?.message) {
      return new ApiClientError(
        payload.error.message,
        payload.error.code,
        payload.error.details,
        err.response.status
      );
    }
  }
  if (err instanceof ApiClientError) return err;
  if (err instanceof Error) {
    return new ApiClientError(err.message);
  }
  return new ApiClientError('Request failed');
}
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (
      error.response?.status === 401 &&
      !original._retry &&
      shouldAttemptTokenRefresh(original.url)
    ) {
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
  try {
    const { data } = await api.get<ApiResponse<T>>(url);
    if (!data.success) {
      throw new ApiClientError(
        data.error?.message || 'Request failed',
        data.error?.code,
        data.error?.details
      );
    }
    return data.data!;
  } catch (err) {
    throw toApiError(err);
  }
}

export async function apiPost<T>(url: string, body?: unknown) {
  try {
    const { data } = await api.post<ApiResponse<T>>(url, body);
    if (!data.success) {
      throw new ApiClientError(
        data.error?.message || 'Request failed',
        data.error?.code,
        data.error?.details
      );
    }
    return data.data!;
  } catch (err) {
    throw toApiError(err);
  }
}

export async function apiPatch<T>(url: string, body?: unknown) {
  try {
    const { data } = await api.patch<ApiResponse<T>>(url, body);
    if (!data.success) {
      throw new ApiClientError(
        data.error?.message || 'Request failed',
        data.error?.code,
        data.error?.details
      );
    }
    return data.data!;
  } catch (err) {
    throw toApiError(err);
  }
}

export async function apiDelete<T>(url: string) {
  try {
    const { data } = await api.delete<ApiResponse<T>>(url);
    if (!data.success) {
      throw new ApiClientError(
        data.error?.message || 'Request failed',
        data.error?.code,
        data.error?.details
      );
    }
    return data.data!;
  } catch (err) {
    throw toApiError(err);
  }
}
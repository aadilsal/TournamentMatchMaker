import axios from 'axios';
import type { ApiMeta, ApiResponse } from '@vr-tournament/shared';
import { ApiClientError } from './user-messages';
import { API_URL } from './config';

export { API_URL } from './config';
export { ApiClientError } from './user-messages';
export { getUserErrorMessage, getRegisterConflict } from './user-messages';
export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  withCredentials: true,
});

const TOKEN_KEY = 'accessToken';

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

let accessToken: string | null = readStoredToken();

const notifyAuthChanged = () => window.dispatchEvent(new CustomEvent('auth-changed'));

export function setAccessToken(token: string | null) {
  accessToken = token;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked: keep the in-memory token */
  }
  notifyAuthChanged();
}

export function getAccessToken() {
  return accessToken;
}

const PUBLIC_PATHS = ['/', '/login', '/register', '/forgot-password', '/reset-password', '/terms', '/privacy'];

function loginRedirect() {
  const { pathname, search } = window.location;
  if (PUBLIC_PATHS.includes(pathname)) return;
  window.location.assign(`/login?returnTo=${encodeURIComponent(pathname + search)}`);
}

// Keep every tab on the same token: a refresh or logout in one tab is picked up by the others.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== TOKEN_KEY && e.key !== null) return;
    const next = readStoredToken();
    if (next === accessToken) return;
    const loggedOut = !!accessToken && !next;
    accessToken = next;
    notifyAuthChanged();
    if (loggedOut) loginRedirect();
  });
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

const AUTH_NO_REFRESH_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/forgot-password',
  '/auth/reset-password',
];

function shouldAttemptTokenRefresh(url: string | undefined): boolean {
  if (!url) return true;
  return !AUTH_NO_REFRESH_PATHS.some((path) => url.includes(path));
}

type RefreshOutcome = { token: string } | { failed: 'auth' | 'network' };

async function postRefresh(): Promise<RefreshOutcome> {
  try {
    const { data } = await axios.post<ApiResponse<{ accessToken: string }>>(
      `${API_URL}/api/v1/auth/refresh`,
      {},
      { withCredentials: true }
    );
    return data.success && data.data?.accessToken ? { token: data.data.accessToken } : { failed: 'auth' };
  } catch (err) {
    return axios.isAxiosError(err) && !err.response ? { failed: 'network' } : { failed: 'auth' };
  }
}

let refreshInFlight: Promise<RefreshOutcome> | null = null;

/**
 * One refresh at a time across all tabs: the refresh cookie is single-use, so two
 * tabs racing would log one of them out. Falls back to per-tab single-flight
 * where navigator.locks is unavailable.
 */
function refreshAccessToken(staleToken: string | null): Promise<RefreshOutcome> {
  if (!refreshInFlight) {
    const run = async (): Promise<RefreshOutcome> => {
      // Another tab may have refreshed while this one waited for the lock.
      const stored = readStoredToken();
      if (stored && stored !== staleToken) return { token: stored };
      return postRefresh();
    };
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
    const pending: Promise<RefreshOutcome> = locks?.request
      ? locks.request('vr-auth-refresh', run).then((outcome) => outcome)
      : run();
    refreshInFlight = pending
      .then((outcome) => {
        if ('token' in outcome) {
          if (outcome.token !== accessToken) setAccessToken(outcome.token);
        } else if (outcome.failed === 'auth') {
          setAccessToken(null);
          loginRedirect();
        }
        return outcome;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

/** Refreshes the access token (shared with the HTTP interceptor); true when a valid token is available. */
export async function refreshSession(): Promise<boolean> {
  return 'token' in (await refreshAccessToken(accessToken));
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
  if (axios.isAxiosError(err) && err.response) {
    return new ApiClientError(err.message, undefined, undefined, err.response.status);
  }
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
      original &&
      error.response?.status === 401 &&
      !original._retry &&
      shouldAttemptTokenRefresh(original.url)
    ) {
      original._retry = true;
      const sent = String(original.headers?.Authorization ?? '').replace(/^Bearer\s+/i, '') || null;

      // Another tab (or an earlier refresh) already replaced the token: just retry.
      const outcome: RefreshOutcome =
        accessToken && accessToken !== sent ? { token: accessToken } : await refreshAccessToken(sent);

      if ('token' in outcome) {
        original.headers.Authorization = `Bearer ${outcome.token}`;
        return api(original);
      }
    }

    return Promise.reject(toApiError(error));
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

export type ListQueryParams = Record<string, string | number | boolean | undefined | null>;

export function buildQueryString(params: ListQueryParams) {
  const q = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      q.set(key, String(value));
    }
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export async function apiGetList<T>(path: string, params?: ListQueryParams) {
  try {
    const { data } = await api.get<ApiResponse<T[]>>(`${path}${buildQueryString(params ?? {})}`);
    if (!data.success) {
      throw new ApiClientError(
        data.error?.message || 'Request failed',
        data.error?.code,
        data.error?.details
      );
    }
    return { items: data.data ?? [], meta: data.meta ?? {} };
  } catch (err) {
    throw toApiError(err);
  }
}

export type { ApiMeta };

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

export async function apiPut<T>(url: string, body?: unknown) {
  try {
    const { data } = await api.put<ApiResponse<T>>(url, body);
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
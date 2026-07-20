import { config } from '../config';
import type { ApiError } from './types';

export class ApiClientError extends Error {
  status: number;
  apiError: ApiError;

  constructor(status: number, apiError: ApiError) {
    super(apiError.message);
    this.status = status;
    this.apiError = apiError;
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${config.apiUrl}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init.headers },
    ...init,
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiClientError(response.status, body?.error || { code: 'NETWORK_ERROR', message: `Error HTTP ${response.status}` });
  }
  return body as T;
}

export const queryString = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') search.set(key, String(value)); });
  const result = search.toString();
  return result ? `?${result}` : '';
};

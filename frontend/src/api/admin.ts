import { api, queryString } from './client';
import type { Consumable, Kiosk, KioskConfiguration, Kpis, Paginated, PendingPrint, PrintJob } from './types';

type Success<T> = { success: true } & T;
const list = <T>(path: string, params: Record<string, string | number | undefined>) => api<Success<Paginated<T>>>(`${path}${queryString(params)}`);

export const adminApi = {
  session: () => api<Success<{ user: string }>>('/v1/admin/session'),
  login: (user: string, password: string) => api<Success<{ user: string }>>('/v1/admin/login', { method: 'POST', body: JSON.stringify({ user, password }) }),
  logout: () => api<Success<{ message: string }>>('/v1/admin/logout', { method: 'POST' }),
  kiosks: () => api<Success<{ kiosks: Kiosk[] }>>('/v1/admin/kiosks'),
  kiosk: (id: string) => api<Success<{ kiosk: Kiosk }>>(`/v1/admin/kiosks/${id}`),
  createKiosk: (name: string, pricePerPage: number, configuration: Omit<KioskConfiguration, 'version' | 'updatedAt' | 'changedAt' | 'source'>) => api<Success<Kiosk & { secret: string }>>('/v1/admin/kiosks', { method: 'POST', body: JSON.stringify({ name, pricePerPage, configuration }) }),
  updateKiosk: (id: string, values: { name?: string; pricePerPage?: number; configuration?: Omit<KioskConfiguration, 'version' | 'updatedAt' | 'changedAt' | 'source'> }) => api<Success<{ kiosk: Kiosk }>>(`/v1/admin/kiosks/${id}`, { method: 'PATCH', body: JSON.stringify(values) }),
  setKioskStatus: (id: string, isActive: boolean) => api<Success<{ kiosk: Kiosk }>>(`/v1/admin/kiosks/${id}/status`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
  kpis: () => api<Success<Kpis>>('/v1/admin/kpis'),
  consumables: () => api<Success<{ consumables: Consumable[] }>>('/v1/admin/consumables'),
  pendingPrints: (params: Record<string, string | number | undefined>) => list<PendingPrint>('/v1/admin/pending-prints', params),
  printJobs: (params: Record<string, string | number | undefined>) => list<PrintJob>('/v1/admin/print-jobs', params),
  printJob: (id: string) => api<Success<{ job: PrintJob }>>(`/v1/admin/print-jobs/${id}`),
  kioskPrintJobs: (id: string, params: Record<string, string | number | undefined>) => list<PrintJob>(`/v1/admin/kiosks/${id}/print-jobs`, params),
  consumableHistory: (id: string, params: Record<string, string | number | undefined>) => list<Consumable>(`/v1/admin/kiosks/${id}/consumables/history`, params),
};

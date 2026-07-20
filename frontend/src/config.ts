const parsePositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const config = {
  apiUrl: (import.meta.env.VITE_API_URL || 'http://localhost:10000').replace(/\/$/, ''),
  queryStaleTimeMs: parsePositiveInt(import.meta.env.VITE_QUERY_STALE_TIME_MS, 5000),
};

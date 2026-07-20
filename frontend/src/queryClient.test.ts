import { describe, expect, it } from 'vitest';
import { config } from './config';
import { queryClient } from './queryClient';

describe('configuración de TanStack Query', () => {
  it('mantiene los datos frescos durante el intervalo configurable y no hace sondeo global', () => {
    const options = queryClient.getDefaultOptions().queries;
    expect(options).toBeDefined();
    const queryOptions = options!;
    expect(queryOptions.staleTime).toBe(config.queryStaleTimeMs);
    expect(queryOptions.refetchOnWindowFocus).toBe(false);
    expect(queryOptions.refetchOnReconnect).toBe(false);
    expect(queryOptions.refetchInterval).toBeUndefined();
  });
});

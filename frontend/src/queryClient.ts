import { QueryClient } from '@tanstack/react-query';
import { config } from './config';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: config.queryStaleTimeMs,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
});

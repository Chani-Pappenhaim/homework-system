import React from 'react';
import ReactDOM from 'react-dom/client';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './globals.css';
import { useBootstrapAuth } from './hooks/useAuth';
import { ToastProvider, showErrorToast } from './components/ui/toast';
import { getApiErrorMessage } from './lib/errors';
import { ServerWakingBanner } from './components/ui/server-waking-banner';

function Root() {
  useBootstrapAuth();
  return (
    <>
      <ServerWakingBanner />
      <App />
    </>
  );
}

const queryClient = new QueryClient({
  // Fallback for actions that don't handle their own failure: show the server's
  // message instead of failing silently. Mutations with their own onError keep full control.
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.options.onError) return;
      showErrorToast(getApiErrorMessage(error));
    },
  }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error: any) => {
        if (error?.response?.status === 429 || error?.response?.status === 401) return false;
        return failureCount < 1;
      },
      staleTime: 1000 * 30,
      refetchOnWindowFocus: true,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Root />
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>
);

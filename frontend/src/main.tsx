import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './globals.css';
import { useBootstrapAuth } from './hooks/useAuth';
import { ToastProvider, useToast } from './components/ui/toast';
import { createQueryClient } from './lib/queryClient';
import { ServerWakingBanner } from './components/ui/server-waking-banner';
import { startSessionSync, takeSessionNotice } from './lib/sessionSync';

startSessionSync();

function Root() {
  useBootstrapAuth();
  const toast = useToast();
  useEffect(() => {
    const notice = takeSessionNotice();
    if (notice) toast.show(notice, 'success', 8000);
  }, [toast]);
  return (
    <>
      <ServerWakingBanner />
      <App />
    </>
  );
}

const queryClient = createQueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <Root />
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>
);

import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { ToastProvider } from '@/components/ui/toast';
import { ConfirmProvider } from '@/components/ui/confirm-dialog';
import './index.css';

const ReactQueryDevtools =
  import.meta.env.DEV
    ? lazy(() =>
        import('@tanstack/react-query-devtools').then((m) => ({
          default: m.ReactQueryDevtools,
        }))
      )
    : null;

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Short enough that a page revisit reflects registrations and bracket
      // changes even before the socket pushes them (or for signed-out visitors,
      // who have no socket at all).
      staleTime: 5_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

// Installable app + phone alerts; production only so local development never serves a stale cache.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('Service worker not registered:', err));
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </ToastProvider>
      {ReactQueryDevtools && (
        <Suspense fallback={null}>
          <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-left" />
        </Suspense>
      )}
    </QueryClientProvider>
  </StrictMode>
);

'use client';

import { useEffect, useState } from 'react';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { notify } from '@/lib/notify';
import { isConnectionError } from '@/lib/apiError';

/** The admin theme lives on <html data-theme>; keep sonner in step with it. */
function useAdminTheme() {
  const [theme, setTheme] = useState('light');
  useEffect(() => {
    const read = () => setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

export function AppToaster() {
  const theme = useAdminTheme();
  // Top-centre, just under the 72px admin topbar: never over the Register's
  // Pay button or a modal's footer buttons.
  return (
    <Toaster
      position="top-center"
      theme={theme}
      closeButton
      gap={10}
      offset={{ top: 84 }}
      mobileOffset={{ top: 78, left: 12, right: 12 }}
      visibleToasts={3}
      toastOptions={{
        className: 'adm-toast',
        classNames: { success: 'adm-toast-success', error: 'adm-toast-error', warning: 'adm-toast-warning', info: 'adm-toast-info' },
      }}
    />
  );
}

export default function AdminProviders({ children }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Don't hammer a server that is down; a connection error is retried once, an API 4xx never.
            retry: (count, err) => count < 1 && (isConnectionError(err) || !err?.status || err.status >= 500),
          },
          mutations: { retry: 0 },
        },
        // A mutation that forgot its own onError still tells the person it failed.
        mutationCache: new MutationCache({
          onError: (err, _vars, _ctx, mutation) => { if (!mutation.options.onError) notify.error(err); },
        }),
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <AppToaster />
    </QueryClientProvider>
  );
}

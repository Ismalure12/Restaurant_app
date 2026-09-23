'use client';

import { useState } from 'react';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { notify } from '@/lib/notify';
import { isConnectionError } from '@/lib/apiError';

// Dark toast (docs/admin-design-system.md §9). Top-centre, just under the
// 60px topbar: never over the Register's Pay button or a modal's footer.
const TOAST = {
  toast: 'group flex items-start gap-2.5 w-full rounded-[10px] bg-mq-ink text-mq-cream px-[15px] py-[13px] shadow-mq-toast font-mq',
  title: 'text-[13.5px] font-semibold leading-snug',
  description: 'text-[12.5px] opacity-70 leading-snug mt-0.5',
  icon: 'mt-0.5 flex-none',
  success: '[&_[data-icon]]:text-[#6ED3A6]',
  error: '[&_[data-icon]]:text-[#F2A597]',
  warning: '[&_[data-icon]]:text-[#E0A846]',
  info: '[&_[data-icon]]:text-[#9DC3E6]',
  actionButton: '!bg-transparent !text-[#E9A3B6] !text-[12.5px] !font-semibold !px-1',
  cancelButton: '!bg-transparent !text-mq-cream/70 !text-[12.5px]',
  closeButton: '!bg-mq-ink !border-white/20 !text-mq-cream',
};

export function AppToaster() {
  return (
    <Toaster
      position="top-center"
      closeButton
      gap={10}
      offset={{ top: 70 }}
      mobileOffset={{ top: 66, left: 12, right: 12 }}
      visibleToasts={3}
      toastOptions={{ unstyled: true, classNames: TOAST }}
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

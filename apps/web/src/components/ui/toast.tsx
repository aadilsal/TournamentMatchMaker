import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastOptions {
  /** Optional secondary line under the title. */
  description?: string;
  /** Milliseconds before auto-dismiss. Errors default to longer; pass 0 to keep until dismissed. */
  duration?: number;
}

interface ToastItem extends ToastOptions {
  id: number;
  message: string;
  variant: ToastVariant;
}

type ToastFn = (message: string, options?: ToastOptions) => void;

interface ToastApi {
  success: ToastFn;
  error: ToastFn;
  info: ToastFn;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DEFAULT_DURATION: Record<ToastVariant, number> = {
  success: 4000,
  info: 4000,
  error: 7000,
};

const variantStyles: Record<ToastVariant, { icon: typeof CheckCircle2; accent: string; iconClass: string }> = {
  success: {
    icon: CheckCircle2,
    accent: 'border-[var(--color-primary)]/40',
    iconClass: 'text-[var(--color-primary)]',
  },
  error: {
    icon: AlertCircle,
    accent: 'border-[var(--color-destructive)]/40',
    iconClass: 'text-[var(--color-destructive)]',
  },
  info: {
    icon: Info,
    accent: 'border-[var(--color-border)]',
    iconClass: 'text-[var(--color-muted-foreground)]',
  },
};

/**
 * Module-level bridge so non-React code (mutation helpers, api layer) can raise
 * toasts without threading the context through. Set by ToastProvider on mount.
 */
let externalApi: ToastApi | null = null;

export const toast: ToastApi = {
  success: (message, options) => externalApi?.success(message, options),
  error: (message, options) => externalApi?.error(message, options),
  info: (message, options) => externalApi?.info(message, options),
  dismiss: (id) => externalApi?.dismiss(id),
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (variant: ToastVariant, message: string, options?: ToastOptions) => {
      const id = nextId.current++;
      const duration = options?.duration ?? DEFAULT_DURATION[variant];

      setToasts((prev) => {
        // Collapse an identical toast already on screen instead of stacking duplicates.
        const deduped = prev.filter((t) => !(t.message === message && t.variant === variant));
        return [...deduped, { ...options, id, message, variant }].slice(-4);
      });

      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration)
        );
      }
    },
    [dismiss]
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (message, options) => push('success', message, options),
      error: (message, options) => push('error', message, options),
      info: (message, options) => push('info', message, options),
      dismiss,
    }),
    [push, dismiss]
  );

  useEffect(() => {
    externalApi = api;
    return () => {
      if (externalApi === api) externalApi = null;
    };
  }, [api]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach((timer) => clearTimeout(timer));
      pending.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function Toaster({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:top-0 sm:bottom-auto sm:items-end"
      aria-live="polite"
      aria-atomic="false"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => {
          const { icon: Icon, accent, iconClass } = variantStyles[t.variant];
          return (
            <motion.div
              key={t.id}
              layout
              role={t.variant === 'error' ? 'alert' : 'status'}
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 460, damping: 34 }}
              className={cn(
                'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-[var(--color-card)] p-3.5 shadow-lg shadow-black/30',
                accent
              )}
            >
              <Icon className={cn('mt-0.5 h-4.5 w-4.5 shrink-0', iconClass)} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium leading-snug text-[var(--color-foreground)]">
                  {t.message}
                </p>
                {t.description && (
                  <p className="mt-1 text-xs leading-relaxed text-[var(--color-muted-foreground)]">
                    {t.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onDismiss(t.id)}
                aria-label="Dismiss notification"
                className="-m-1 shrink-0 rounded-md p-1 text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}

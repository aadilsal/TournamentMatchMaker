import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ConfirmOptions {
  title: string;
  /** Body copy: say what will happen and whether it can be undone. */
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` renders a destructive confirm button. Default for irreversible actions. */
  tone?: 'danger' | 'default';
  /**
   * When set, the user must type this exact string before Confirm enables.
   * Reserve for the highest-stakes actions (refunds, superadmin promotion).
   */
  confirmText?: string;
}

interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isPending?: boolean;
  error?: string | null;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  confirmText,
  onConfirm,
  onCancel,
  isPending,
  error,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const confirmRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPending) {
        onCancel();
        return;
      }
      // Keep focus inside the dialog while it is open.
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);

    const focusTimer = setTimeout(() => {
      if (confirmText) inputRef.current?.focus();
      else confirmRef.current?.focus();
    }, 50);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
      clearTimeout(focusTimer);
      previouslyFocused?.focus?.();
    };
  }, [open, isPending, onCancel, confirmText]);

  useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  const confirmBlocked = Boolean(confirmText) && typed.trim() !== confirmText;

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center p-4 sm:items-center">
          <motion.button
            type="button"
            tabIndex={-1}
            aria-label="Cancel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => !isPending && onCancel()}
          />

          <motion.div
            ref={panelRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby={description ? 'confirm-dialog-description' : undefined}
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-2xl shadow-black/40"
          >
            <div className="relative p-6 pb-5">
              <button
                type="button"
                onClick={onCancel}
                disabled={isPending}
                aria-label="Close dialog"
                className="absolute right-4 top-4 rounded-lg p-1.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex items-start gap-3 pr-8">
                <div
                  className={cn(
                    'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl',
                    tone === 'danger'
                      ? 'bg-[var(--color-destructive)]/15 text-[var(--color-destructive)]'
                      : 'bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
                  )}
                >
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h2 id="confirm-dialog-title" className="text-lg font-bold tracking-tight">
                    {title}
                  </h2>
                  {description && (
                    <div
                      id="confirm-dialog-description"
                      className="mt-1.5 text-sm leading-relaxed text-[var(--color-muted-foreground)]"
                    >
                      {description}
                    </div>
                  )}
                </div>
              </div>

              {confirmText && (
                <div className="mt-4">
                  <label
                    htmlFor="confirm-dialog-input"
                    className="text-xs text-[var(--color-muted-foreground)]"
                  >
                    Type <span className="font-mono font-semibold text-[var(--color-foreground)]">{confirmText}</span> to confirm
                  </label>
                  <input
                    id="confirm-dialog-input"
                    ref={inputRef}
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    disabled={isPending}
                    autoComplete="off"
                    className="mt-1.5 h-10 w-full rounded-md border border-[var(--color-input)] bg-[var(--color-background)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
                  />
                </div>
              )}

              {error && (
                <p
                  role="alert"
                  className="mt-4 rounded-lg border border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]"
                >
                  {error}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t border-[var(--color-border)] p-4 sm:flex-row-reverse sm:gap-3">
              <Button
                ref={confirmRef}
                className={cn(
                  'h-11 w-full shrink-0 sm:flex-1',
                  tone === 'danger' &&
                    'bg-[var(--color-destructive)] text-white hover:bg-[var(--color-destructive)]/90'
                )}
                onClick={onConfirm}
                disabled={isPending || confirmBlocked}
              >
                {isPending ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Working…
                  </span>
                ) : (
                  confirmLabel
                )}
              </Button>
              <Button
                variant="outline"
                className="h-11 w-full sm:flex-1"
                onClick={onCancel}
                disabled={isPending}
              >
                {cancelLabel}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

/* -------------------------------------------------------------------------- */
/* Imperative API: const confirm = useConfirm(); if (await confirm({...})) ...  */
/* -------------------------------------------------------------------------- */

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ options: ConfirmOptions; resolve: (v: boolean) => void } | null>(
    null
  );
  // Retained separately so the panel keeps rendering its copy through the exit
  // animation instead of flashing blank the moment `state` clears.
  const [lastOptions, setLastOptions] = useState<ConfirmOptions | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve) => {
        setLastOptions(options);
        setState({ options, resolve });
      }),
    []
  );

  const settle = useCallback((value: boolean) => {
    setState((current) => {
      current?.resolve(value);
      return null;
    });
  }, []);

  const value = useMemo(() => confirm, [confirm]);
  const shown = state?.options ?? lastOptions;

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={state !== null}
        title={shown?.title ?? ''}
        description={shown?.description}
        confirmLabel={shown?.confirmLabel}
        cancelLabel={shown?.cancelLabel}
        tone={shown?.tone}
        confirmText={shown?.confirmText}
        onConfirm={() => settle(true)}
        onCancel={() => settle(false)}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used within a ConfirmProvider');
  return ctx;
}

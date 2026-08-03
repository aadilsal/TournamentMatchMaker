import { useEffect, useId, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Blocks Escape / backdrop dismissal while a save is in flight. */
  busy?: boolean;
  className?: string;
}

/**
 * Shared shell for form modals. Gives every dialog in the app the same
 * semantics the booking flow already had: Escape to close, scroll lock,
 * role="dialog" + aria-modal, focus trap, and focus restore on close.
 */
export function Modal({ open, title, onClose, children, busy, className }: ModalProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) {
        onClose();
        return;
      }
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
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
      panelRef.current
        ?.querySelector<HTMLElement>(
          'input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'
        )
        ?.focus();
    }, 50);

    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
      clearTimeout(focusTimer);
      previouslyFocused?.focus?.();
    };
  }, [open, busy, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
          <motion.button
            type="button"
            tabIndex={-1}
            aria-label="Close"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !busy && onClose()}
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 420, damping: 32 }}
            className={cn(
              'relative z-10 w-full max-w-sm max-h-[85vh] overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 shadow-2xl shadow-black/40',
              className
            )}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <h3 id={titleId} className="font-semibold">
                {title}
              </h3>
              <button
                type="button"
                onClick={onClose}
                disabled={busy}
                aria-label="Close dialog"
                className="-m-1 rounded-lg p-1.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

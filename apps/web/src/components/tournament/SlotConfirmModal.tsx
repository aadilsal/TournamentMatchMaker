import { useEffect } from 'react';

import { motion, AnimatePresence } from 'motion/react';

import { Button } from '@/components/ui/button';

import { cn } from '@/lib/utils';

import { formatSlotTime } from '@/components/slots/SlotPicker';

import { MapPin, Clock, Trophy, X, Sparkles, Loader2 } from 'lucide-react';

import type { Booking, TournamentRegistration } from '@vr-tournament/shared';



interface SlotConfirmModalProps {

  open: boolean;

  tournamentName: string;

  venueName: string;

  slotStart: string;

  slotEnd: string;

  onConfirm: () => void;

  onCancel: () => void;

  isPending?: boolean;

  error?: string | null;

}



function formatSlotDate(iso: string) {

  return new Date(iso).toLocaleDateString([], {

    weekday: 'long',

    month: 'short',

    day: 'numeric',

  });

}



function DetailRow({

  icon: Icon,

  label,

  value,

}: {

  icon: typeof Trophy;

  label: string;

  value: string;

}) {

  return (

    <div className="flex items-center gap-3">

      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary)]/15 text-[var(--color-primary)]">

        <Icon className="h-4 w-4" />

      </div>

      <div className="min-w-0 flex-1">

        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-muted-foreground)]">

          {label}

        </p>

        <p className="truncate font-semibold text-[var(--color-foreground)]">{value}</p>

      </div>

    </div>

  );

}



export function SlotConfirmModal({

  open,

  tournamentName,

  venueName,

  slotStart,

  slotEnd,

  onConfirm,

  onCancel,

  isPending,

  error,

}: SlotConfirmModalProps) {

  useEffect(() => {

    if (!open) return;



    const onKeyDown = (e: KeyboardEvent) => {

      if (e.key === 'Escape' && !isPending) onCancel();

    };



    document.body.style.overflow = 'hidden';

    window.addEventListener('keydown', onKeyDown);

    return () => {

      document.body.style.overflow = '';

      window.removeEventListener('keydown', onKeyDown);

    };

  }, [open, isPending, onCancel]);



  return (

    <AnimatePresence>

      {open && (

        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">

          <motion.button

            type="button"

            aria-label="Close"

            initial={{ opacity: 0 }}

            animate={{ opacity: 1 }}

            exit={{ opacity: 0 }}

            transition={{ duration: 0.2 }}

            className="absolute inset-0 bg-black/70 backdrop-blur-sm"

            onClick={() => !isPending && onCancel()}

          />



          <motion.div

            role="dialog"

            aria-modal="true"

            aria-labelledby="slot-confirm-title"

            initial={{ opacity: 0, y: 24, scale: 0.98 }}

            animate={{ opacity: 1, y: 0, scale: 1 }}

            exit={{ opacity: 0, y: 16, scale: 0.98 }}

            transition={{ type: 'spring', stiffness: 420, damping: 32 }}

            className={cn(

              'relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-[var(--color-border)]',

              'bg-[var(--color-card)] shadow-2xl shadow-black/40'

            )}

          >

            <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[var(--color-primary)]/12 to-transparent" />



            <div className="relative p-6 pb-5">

              <button

                type="button"

                onClick={onCancel}

                disabled={isPending}

                className="absolute right-4 top-4 rounded-lg p-1.5 text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-muted)] hover:text-[var(--color-foreground)] disabled:opacity-50"

                aria-label="Close dialog"

              >

                <X className="h-4 w-4" />

              </button>



              <div className="mb-5 flex items-start gap-3 pr-8">

                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-lg shadow-[var(--color-primary)]/30">

                  <Sparkles className="h-5 w-5" />

                </div>

                <div>

                  <h2 id="slot-confirm-title" className="text-xl font-bold tracking-tight">

                    Confirm booking & match

                  </h2>

                  <p className="mt-1 text-sm leading-relaxed text-[var(--color-muted-foreground)]">

                    We&apos;ll lock in your arena slot and start finding an opponent right away.

                  </p>

                </div>

              </div>



              <div className="space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)]/60 p-4">

                <DetailRow icon={Trophy} label="Tournament" value={tournamentName} />

                <DetailRow icon={MapPin} label="Venue" value={venueName} />

                <DetailRow

                  icon={Clock}

                  label="Time slot"

                  value={`${formatSlotDate(slotStart)} · ${formatSlotTime(slotStart)} – ${formatSlotTime(slotEnd)}`}

                />

              </div>

              {error && (
                <p
                  className="mt-4 rounded-lg border border-[var(--color-destructive)]/30 bg-[var(--color-destructive)]/10 px-3 py-2 text-sm text-[var(--color-destructive)]"
                  role="alert"
                >
                  {error}
                </p>
              )}

            </div>



            <div className="flex flex-col gap-2 border-t border-[var(--color-border)] bg-[var(--color-card)] p-4 sm:flex-row-reverse sm:gap-3">

              <Button

                className="h-11 w-full shrink-0 sm:flex-1"

                onClick={onConfirm}

                disabled={isPending}

              >

                {isPending ? (

                  <span className="inline-flex items-center gap-2">

                    <Loader2 className="h-4 w-4 animate-spin" />

                    Booking…

                  </span>

                ) : (

                  'Book & find match'

                )}

              </Button>

              <Button

                variant="outline"

                className="h-11 w-full sm:flex-1"

                onClick={onCancel}

                disabled={isPending}

              >

                Cancel

              </Button>

            </div>

          </motion.div>

        </div>

      )}

    </AnimatePresence>

  );

}



export interface EnterTournamentResult {

  registration: TournamentRegistration;

  booking: Booking | null;

  searching: boolean;

}



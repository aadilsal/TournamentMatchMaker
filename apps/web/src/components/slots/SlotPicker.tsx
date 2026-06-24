import type { TimeSlot } from '@vr-tournament/shared';
import { ChevronRight, Clock, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageLoader } from '@/components/ui/cricket-loader';

export function todayString() {
  return new Date().toISOString().split('T')[0];
}

export function getNextDates(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d.toISOString().split('T')[0];
  });
}

export function formatSlotTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getSlotMeta(slot: TimeSlot) {
  const available = Math.max(0, slot.maxCapacity - slot.bookedCount);
  const isFull = slot.status === 'full' || available <= 0;
  const isPast = new Date(slot.startTime).getTime() <= Date.now();
  const fillPercent = slot.maxCapacity > 0 ? (slot.bookedCount / slot.maxCapacity) * 100 : 100;
  return { available, isFull, isPast, fillPercent };
}

interface SlotDateStripProps {
  dates: string[];
  selectedDate: string;
  onSelect: (date: string) => void;
}

export function SlotDateStrip({ dates, selectedDate, onSelect }: SlotDateStripProps) {
  const today = todayString();

  return (
    <div className="relative -mx-1">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-[var(--color-background)] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-[var(--color-background)] to-transparent" />

      <div className="flex gap-2 overflow-x-auto px-1 pb-1 scroll-smooth snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {dates.map((date) => {
          const d = new Date(`${date}T12:00:00`);
          const isSelected = selectedDate === date;
          const isToday = date === today;

          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelect(date)}
              className={cn(
                'snap-start shrink-0 flex min-w-[4.5rem] flex-col items-center rounded-2xl border px-3 py-3 transition-all duration-200',
                isSelected
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-lg shadow-[var(--color-primary)]/25 scale-[1.02]'
                  : 'border-[var(--color-border)] bg-[var(--color-card)] text-[var(--color-foreground)] hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-primary)]/5'
              )}
            >
              <span
                className={cn(
                  'text-[10px] font-semibold uppercase tracking-wider',
                  isSelected ? 'text-white/80' : 'text-[var(--color-muted-foreground)]'
                )}
              >
                {isToday ? 'Today' : d.toLocaleDateString([], { weekday: 'short' })}
              </span>
              <span className="mt-0.5 text-2xl font-bold leading-none tabular-nums">
                {d.getDate()}
              </span>
              <span
                className={cn(
                  'mt-1 text-[11px] font-medium',
                  isSelected ? 'text-white/75' : 'text-[var(--color-muted-foreground)]'
                )}
              >
                {d.toLocaleDateString([], { month: 'short' })}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface TimeSlotGridProps {
  slots: TimeSlot[];
  isLoading?: boolean;
  emptyMessage?: string;
  selectedSlotId?: string | null;
  onSlotSelect?: (slot: TimeSlot) => void;
  renderSlotAction?: (slot: TimeSlot, meta: ReturnType<typeof getSlotMeta>) => React.ReactNode;
}

export function TimeSlotGrid({
  slots,
  isLoading,
  emptyMessage = 'No slots available for this date.',
  selectedSlotId,
  onSlotSelect,
  renderSlotAction,
}: TimeSlotGridProps) {
  if (isLoading) {
    return <PageLoader label="Loading slots…" />;
  }

  if (slots.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)]/50 px-6 py-10 text-center">
        <Clock className="mx-auto mb-3 h-8 w-8 text-[var(--color-muted-foreground)]/60" />
        <p className="text-sm text-[var(--color-muted-foreground)]">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {slots.map((slot) => {
        const meta = getSlotMeta(slot);
        const { available, isFull, isPast, fillPercent } = meta;
        const unavailable = isFull || isPast;
        const isSelected = selectedSlotId === slot.id;
        const interactive = !!onSlotSelect && !renderSlotAction;

        const content = (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-semibold tabular-nums tracking-tight">
                  {formatSlotTime(slot.startTime)}
                  <span className="mx-1.5 font-normal text-[var(--color-muted-foreground)]">–</span>
                  {formatSlotTime(slot.endTime)}
                </p>
                <div className="mt-2 flex items-center gap-1.5 text-xs text-[var(--color-muted-foreground)]">
                  <Users className="h-3.5 w-3.5 shrink-0" />
                  {isFull ? (
                    <span className="font-medium text-[var(--color-muted-foreground)]">Sold out</span>
                  ) : (
                    <span>
                      <span className="font-semibold text-[var(--color-foreground)]">{available}</span>
                      {' '}of {slot.maxCapacity} spots left
                    </span>
                  )}
                </div>
              </div>

              {renderSlotAction ? (
                renderSlotAction(slot, meta)
              ) : interactive && !isFull ? (
                <ChevronRight
                  className={cn(
                    'h-5 w-5 shrink-0 transition-transform',
                    isSelected ? 'text-[var(--color-primary)] translate-x-0.5' : 'text-[var(--color-muted-foreground)]'
                  )}
                />
              ) : null}
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--color-muted)]">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  isFull
                    ? 'bg-[var(--color-muted-foreground)]/30'
                    : fillPercent >= 85
                      ? 'bg-[var(--color-primary)]'
                      : fillPercent >= 60
                        ? 'bg-red-400'
                        : 'bg-[var(--color-primary)]'
                )}
                style={{ width: `${Math.min(100, fillPercent)}%` }}
              />
            </div>
          </>
        );

        if (renderSlotAction) {
          return (
            <div
              key={slot.id}
              className={cn(
                'rounded-2xl border bg-[var(--color-card)] p-4 transition-colors',
                unavailable ? 'border-[var(--color-border)] opacity-60' : 'border-[var(--color-border)]'
              )}
            >
              {content}
            </div>
          );
        }

        return (
          <button
            key={slot.id}
            type="button"
            disabled={unavailable}
            onClick={() => onSlotSelect?.(slot)}
            className={cn(
              'rounded-2xl border p-4 text-left transition-all duration-200',
              unavailable
                ? 'cursor-not-allowed border-[var(--color-border)] bg-[var(--color-card)]/40 opacity-50'
                : isSelected
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/10 shadow-md shadow-[var(--color-primary)]/10'
                  : 'border-[var(--color-border)] bg-[var(--color-card)] hover:border-[var(--color-primary)]/45 hover:bg-[var(--color-primary)]/5'
            )}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

interface SlotPickerProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  dates?: string[];
  slots: TimeSlot[];
  isLoading?: boolean;
  emptyMessage?: string;
  selectedSlotId?: string | null;
  onSlotSelect?: (slot: TimeSlot) => void;
  renderSlotAction?: (slot: TimeSlot, meta: ReturnType<typeof getSlotMeta>) => React.ReactNode;
}

export function SlotPicker({
  selectedDate,
  onDateChange,
  dates = getNextDates(7),
  slots,
  isLoading,
  emptyMessage,
  selectedSlotId,
  onSlotSelect,
  renderSlotAction,
}: SlotPickerProps) {
  return (
    <div className="space-y-5">
      <SlotDateStrip dates={dates} selectedDate={selectedDate} onSelect={onDateChange} />
      <TimeSlotGrid
        slots={slots}
        isLoading={isLoading}
        emptyMessage={emptyMessage}
        selectedSlotId={selectedSlotId}
        onSlotSelect={onSlotSelect}
        renderSlotAction={renderSlotAction}
      />
    </div>
  );
}

import { cn } from '@/lib/utils';

type ButtonVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** What the button does; shown on hover and read by screen readers. */
  tooltip?: string;
  ref?: React.Ref<HTMLButtonElement>;
}

/** Button classes, for styling a <Link> as a button instead of nesting <Button> inside it. */
export function buttonVariants({
  variant = 'default',
  size = 'md',
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(
    'inline-flex items-center justify-center rounded-md font-medium transition-colors duration-150 cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none',
    {
      // Every button has a visible border and fill, and both change on hover, so it never reads as plain text.
      'border border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-primary-foreground)] shadow-sm hover:bg-[var(--color-primary)]/85 hover:shadow-[var(--color-primary)]/30 hover:shadow-md':
        variant === 'default',
      'border border-[var(--color-border)] bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)] hover:border-[var(--color-primary)]/60 hover:bg-[var(--color-secondary)]/80':
        variant === 'secondary',
      'border border-[var(--color-destructive)] bg-[var(--color-destructive)] text-white hover:bg-[var(--color-destructive)]/85':
        variant === 'destructive',
      'border border-white/20 bg-white/[0.06] text-[var(--color-foreground)] hover:border-[var(--color-primary)]/70 hover:bg-[var(--color-primary)]/15':
        variant === 'outline',
      // Ghost is for navigation links and icon-only controls, which are recognisable on their own.
      'hover:bg-[var(--color-muted)]': variant === 'ghost',
      'h-9 px-3 text-sm': size === 'sm',
      'h-10 px-4': size === 'md',
      'h-12 px-6 text-lg': size === 'lg',
      'h-10 w-10 p-0': size === 'icon',
    },
    className
  );
}

export function Button({
  className,
  variant = 'default',
  size = 'md',
  type = 'button',
  tooltip,
  title,
  ...props
}: ButtonProps) {
  return (
    <button
      className={buttonVariants({ variant, size, className })}
      type={type}
      title={title ?? tooltip}
      aria-description={tooltip}
      {...props}
    />
  );
}

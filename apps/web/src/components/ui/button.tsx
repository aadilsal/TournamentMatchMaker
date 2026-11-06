import { cn } from '@/lib/utils';

type ButtonVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  ref?: React.Ref<HTMLButtonElement>;
}

/** Button classes, for styling a <Link> as a button instead of nesting <Button> inside it. */
export function buttonVariants({
  variant = 'default',
  size = 'md',
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(
    'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] disabled:opacity-50 disabled:pointer-events-none',
    {
      'bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90':
        variant === 'default',
      'bg-[var(--color-secondary)] text-[var(--color-secondary-foreground)] hover:opacity-80':
        variant === 'secondary',
      'bg-[var(--color-destructive)] text-white hover:opacity-90': variant === 'destructive',
      'border border-[var(--color-border)] bg-transparent hover:bg-[var(--color-muted)]':
        variant === 'outline',
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
  ...props
}: ButtonProps) {
  return <button className={buttonVariants({ variant, size, className })} type={type} {...props} />;
}

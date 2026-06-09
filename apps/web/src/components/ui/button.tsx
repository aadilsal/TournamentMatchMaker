import { cn } from '@/lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({
  className,
  variant = 'default',
  size = 'md',
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
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
          'h-8 px-3 text-sm': size === 'sm',
          'h-10 px-4': size === 'md',
          'h-12 px-6 text-lg': size === 'lg',
        },
        className
      )}
      {...props}
    />
  );
}

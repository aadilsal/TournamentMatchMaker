import { cn } from '@/lib/utils';

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  /** Marks the field as required with the conventional red asterisk. */
  required?: boolean;
}

export function Label({ className, required, children, ...props }: LabelProps) {
  return (
    <label
      className={cn('text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70', className)}
      {...props}
    >
      {children}
      {required && (
        // aria-hidden: the asterisk is decoration. `aria-required` on the input
        // is what a screen reader announces.
        <span aria-hidden="true" className="ml-0.5 text-[var(--color-primary)]">
          *
        </span>
      )}
    </label>
  );
}

import { cn } from '@/lib/utils';
import { Button } from './button';
import { Link } from 'react-router-dom';

interface EmptyStateProps {
  icon?: React.ReactNode;
  image?: string;
  title: string;
  description?: string;
  action?: { label: string; href: string };
  className?: string;
}

export function EmptyState({ icon, image, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-20 text-center', className)}>
      {image && (
        <img
          src={image}
          alt=""
          className="h-32 w-32 object-contain mb-4 opacity-80"
          aria-hidden
        />
      )}
      {!image && icon && (
        <div className="mb-4 text-[var(--color-muted-foreground)] opacity-40">{icon}</div>
      )}
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && (
        <p className="mt-2 text-sm text-[var(--color-muted-foreground)] max-w-xs leading-relaxed">
          {description}
        </p>
      )}
      {action && (
        <Link to={action.href} className="mt-6">
          <Button size="sm">{action.label}</Button>
        </Link>
      )}
    </div>
  );
}

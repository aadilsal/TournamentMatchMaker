import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Goes back a page; falls back to `to` when the page was opened directly (no history in this app). */
export function BackButton({ to, label = 'Back', className }: { to: string; label?: string; className?: string }) {
  const navigate = useNavigate();
  const hasHistory = typeof window !== 'undefined' && (window.history.state?.idx ?? 0) > 0;
  return (
    <button
      type="button"
      title={hasHistory ? 'Go back to the previous page' : `Go to ${label.replace(/^Back to /, '')}`}
      onClick={() => (hasHistory ? navigate(-1) : navigate(to))}
      className={cn(buttonVariants({ variant: 'outline', size: 'sm', className: 'gap-1.5' }), className)}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}

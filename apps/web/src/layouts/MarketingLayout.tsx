import { Outlet } from 'react-router-dom';

export function MarketingLayout() {
  return (
    <div className="min-h-dvh bg-[var(--color-background)] text-[var(--color-foreground)] overflow-x-hidden">
      <Outlet />
    </div>
  );
}

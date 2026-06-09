import { Link } from 'react-router-dom';
import { Gamepad2 } from 'lucide-react';

export function LandingFooter() {
  return (
    <footer className="border-t border-[var(--color-border)]/60 py-12">
      <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-6">
        <Link to="/" className="flex items-center gap-2 text-sm font-medium">
          <Gamepad2 className="h-4 w-4 text-[var(--color-primary)]" />
          VR Tournament Platform
        </Link>
        <nav className="flex flex-wrap justify-center gap-6 text-sm text-[var(--color-muted-foreground)]">
          <Link to="/venues" className="hover:text-[var(--color-foreground)] transition-colors">Venues</Link>
          <Link to="/register" className="hover:text-[var(--color-foreground)] transition-colors">Register</Link>
          <Link to="/login" className="hover:text-[var(--color-foreground)] transition-colors">Login</Link>
        </nav>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          © {new Date().getFullYear()} TechVersa
        </p>
      </div>
    </footer>
  );
}

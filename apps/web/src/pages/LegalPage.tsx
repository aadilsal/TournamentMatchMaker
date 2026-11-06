import { PRIVACY, TERMS } from '@/content/legal';

export function LegalPage({ doc }: { doc: 'terms' | 'privacy' }) {
  const content = doc === 'terms' ? TERMS : PRIVACY;
  return (
    <article className="max-w-2xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{content.title}</h1>
        <p className="mt-1 text-xs text-[var(--color-muted-foreground)]">Last updated {content.updated}</p>
        <p className="mt-4 leading-relaxed text-[var(--color-muted-foreground)]">{content.intro}</p>
      </header>
      {content.sections.map((section) => (
        <section key={section.heading} className="space-y-2">
          <h2 className="text-lg font-semibold">{section.heading}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph} className="text-sm leading-relaxed text-[var(--color-muted-foreground)]">
              {paragraph}
            </p>
          ))}
        </section>
      ))}
    </article>
  );
}

export const TermsPage = () => <LegalPage doc="terms" />;
export const PrivacyPage = () => <LegalPage doc="privacy" />;

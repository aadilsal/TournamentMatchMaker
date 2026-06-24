import { TOURNAMENT_FLOW_GUIDE } from '@vr-tournament/shared';

export function TournamentFlowGuide() {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">{TOURNAMENT_FLOW_GUIDE.title}</h3>
        <p className="text-xs text-[var(--color-muted-foreground)] mt-1 leading-relaxed">
          {TOURNAMENT_FLOW_GUIDE.summary}
        </p>
      </div>

      <div className="space-y-3">
        {TOURNAMENT_FLOW_GUIDE.sections.map((section) => (
          <div
            key={section.title}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-4"
          >
            <p className="text-sm font-medium">{section.title}</p>
            <p className="text-xs text-[var(--color-muted-foreground)] mt-2 leading-relaxed">
              {section.body}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

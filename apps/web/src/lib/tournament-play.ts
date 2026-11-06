/** Tournament statuses in which a registered player can still book or withdraw. */
export function tournamentIsRunning(status: string): boolean {
  return status === 'open' || status === 'in_progress';
}

/** Mirrors the API's /enter rule: running tournament, participant (if any) still active or advanced. */
export function canEnterTournament(status: string, participantStatus: string | null | undefined): boolean {
  if (!tournamentIsRunning(status)) return false;
  return !participantStatus || participantStatus === 'active' || participantStatus === 'advanced';
}

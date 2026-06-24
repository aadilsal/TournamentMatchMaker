export type RoundDurationUnit = 'minutes' | 'hours' | 'days';

export const ROUND_DURATION_UNIT_OPTIONS: { value: RoundDurationUnit; label: string }[] = [
  { value: 'minutes', label: 'Minutes' },
  { value: 'hours', label: 'Hours' },
  { value: 'days', label: 'Days' },
];

export const MIN_ROUND_DURATION_MINUTES = 15;
export const MAX_ROUND_DURATION_MINUTES = 30 * 24 * 60;

export function roundDurationToMinutes(value: number, unit: RoundDurationUnit): number {
  switch (unit) {
    case 'minutes':
      return value;
    case 'hours':
      return value * 60;
    case 'days':
      return value * 24 * 60;
  }
}

export function minutesToRoundDurationParts(minutes: number): {
  value: string;
  unit: RoundDurationUnit;
} {
  if (minutes >= 24 * 60 && minutes % (24 * 60) === 0) {
    return { value: String(minutes / (24 * 60)), unit: 'days' };
  }
  if (minutes >= 60 && minutes % 60 === 0) {
    return { value: String(minutes / 60), unit: 'hours' };
  }
  return { value: String(minutes), unit: 'minutes' };
}

export function isValidRoundDurationMinutes(minutes: number): boolean {
  return (
    Number.isInteger(minutes) &&
    minutes >= MIN_ROUND_DURATION_MINUTES &&
    minutes <= MAX_ROUND_DURATION_MINUTES
  );
}

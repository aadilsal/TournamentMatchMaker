export interface PasswordRequirement {
  id: string;
  label: string;
  met: boolean;
}

export function getPasswordRequirements(password: string): PasswordRequirement[] {
  return [
    { id: 'length', label: 'At least 8 characters', met: password.length >= 8 },
    { id: 'upper', label: 'One uppercase letter', met: /[A-Z]/.test(password) },
    { id: 'lower', label: 'One lowercase letter', met: /[a-z]/.test(password) },
    { id: 'number', label: 'One number', met: /\d/.test(password) },
  ];
}

export function passwordStrengthScore(password: string): number {
  const reqs = getPasswordRequirements(password);
  return reqs.filter((r) => r.met).length;
}

export function passwordStrengthLabel(score: number): string {
  if (score === 0) return '';
  if (score <= 1) return 'Weak';
  if (score <= 2) return 'Fair';
  if (score <= 3) return 'Good';
  return 'Strong';
}

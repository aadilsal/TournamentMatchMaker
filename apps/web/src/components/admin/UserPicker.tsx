import { useQuery } from '@tanstack/react-query';
import type { User } from '@vr-tournament/shared';
import { apiGet } from '@/lib/api';
import { Label } from '@/components/ui/label';

export function UserPicker({
  value,
  onChange,
  label = 'User',
}: {
  value: string;
  onChange: (userId: string) => void;
  label?: string;
}) {
  const { data: users = [] } = useQuery({
    queryKey: ['admin', 'users', 'picker'],
    queryFn: () => apiGet<User[]>('/admin/users?limit=100'),
  });

  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <select
        className="w-full h-10 rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-sm mt-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select user…</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.username} ({u.email})
          </option>
        ))}
      </select>
    </div>
  );
}

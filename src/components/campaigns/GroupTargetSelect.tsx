import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreatorGroups } from '@/hooks/useCreatorGroups';

/** Sentinel value for the "Creator marketplace" option (Radix Select can't use ""). */
const PUBLIC_VALUE = '__public__';

interface GroupTargetSelectProps {
  /** Selected crew id, or null for the creator marketplace. */
  value: string | null;
  onChange: (groupId: string | null) => void;
}

/**
 * "Post to: Creator marketplace | <crew>" selector for the campaign creator.
 * Choosing a crew turns the post into a free, private group campaign — only the
 * crew's active members see it and there is no payment. Emits `null` for public.
 */
export function GroupTargetSelect({ value, onChange }: GroupTargetSelectProps) {
  const { groups, isLoading } = useCreatorGroups();

  const selectedGroup = value ? groups.find((g) => g.id === value) : null;

  return (
    <div className="rounded-2xl border-2 border-dc-teal/40 bg-white p-4">
      <div className="flex items-center gap-2 mb-2">
        <Users className="w-4 h-4 text-dc-teal" aria-hidden="true" />
        <label htmlFor="group-target" className="text-sm font-bold text-dc-text">
          Post to
        </label>
      </div>

      <Select
        value={value ?? PUBLIC_VALUE}
        onValueChange={(v) => onChange(v === PUBLIC_VALUE ? null : v)}
        disabled={isLoading}
      >
        <SelectTrigger
          id="group-target"
          className="w-full rounded-full border-2 border-dc-teal/50 focus:ring-dc-teal focus:ring-offset-0"
        >
          <SelectValue placeholder="Creator marketplace" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={PUBLIC_VALUE}>Creator marketplace</SelectItem>
          {groups.map((g) => (
            <SelectItem key={g.id} value={g.id}>
              {g.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedGroup ? (
        <p className="mt-2 text-xs font-semibold text-dc-teal-dark">
          Free collab — only this crew sees it. No payment.
        </p>
      ) : groups.length === 0 ? (
        <p className="mt-2 text-xs text-dc-text-muted">
          Want a private, no-payment collab?{' '}
          <Link
            to="/dashboard/business/crews"
            className="font-semibold text-dc-teal-dark hover:underline"
          >
            Build a crew
          </Link>{' '}
          and post free campaigns just to them.
        </p>
      ) : (
        <p className="mt-2 text-xs text-dc-text-muted">
          Reaches every creator on DragonCandy. Pick a crew for a free, private collab.
        </p>
      )}
    </div>
  );
}

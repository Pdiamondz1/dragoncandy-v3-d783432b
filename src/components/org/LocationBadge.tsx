import { useAuth } from '@/hooks/useAuth';
import { useOrgUnits } from '@/hooks/useOrgData';

export function LocationBadge() {
  const { activeOrg, activeOrgUnit } = useAuth();
  const { data: units = [] } = useOrgUnits(activeOrg?.id);

  if (!activeOrgUnit || units.length <= 1) return null;

  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-100 text-teal-800">
      {activeOrgUnit.name}
    </span>
  );
}

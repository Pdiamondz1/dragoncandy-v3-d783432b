import { useAuth } from '@/hooks/useAuth';
import { DCEmptyState } from '@/components/ui/dc-empty-state';
import type { LucideIcon } from 'lucide-react';

interface LocationEmptyStateProps {
  icon: LucideIcon;
  titleTemplate: string;
  subtitle?: string;
  cta?: { label: string; to?: string; onClick?: () => void };
}

export function LocationEmptyState({ icon, titleTemplate, subtitle, cta }: LocationEmptyStateProps) {
  const { activeOrgUnit } = useAuth();
  const locationName = activeOrgUnit?.name ?? 'your location';
  const title = titleTemplate.replace('[Location]', locationName);

  return <DCEmptyState icon={icon} title={title} subtitle={subtitle} cta={cta} />;
}

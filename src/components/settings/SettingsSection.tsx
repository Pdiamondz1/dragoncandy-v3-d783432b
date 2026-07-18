import { AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';

interface SettingsSectionProps {
  value: string;
  icon: string;
  title: string;
  subtitle: string;
  nudge?: string;
  accentColor?: 'teal' | 'pink';
  children: React.ReactNode;
}

export function SettingsSection({
  value,
  icon,
  title,
  subtitle,
  nudge,
  accentColor,
  children,
}: SettingsSectionProps) {
  const borderClass = nudge
    ? accentColor === 'pink'
      ? 'border-l-4 border-l-pink-400'
      : 'border-l-4 border-l-teal-400'
    : '';

  const subtitleColorClass = nudge
    ? accentColor === 'pink'
      ? 'text-pink-500'
      : 'text-teal-500'
    : 'text-gray-500';

  return (
    <AccordionItem value={value} className={`bg-white rounded-2xl mb-3 border border-dc-teal/15 shadow-dc-sm overflow-hidden ${borderClass}`}>
      <AccordionTrigger className="px-4 py-3.5 hover:no-underline">
        <div className="flex items-center gap-3">
          <span className="text-lg">{icon}</span>
          <div className="text-left">
            <div className="font-bold text-sm">{title}</div>
            <div className={`text-xs ${subtitleColorClass}`}>
              {nudge || subtitle}
            </div>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4 border-t border-dc-teal/10">
        <div className="pt-4 space-y-4">
          {children}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';

interface CollapsibleBriefSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function CollapsibleBriefSection({
  title,
  defaultOpen = false,
  children,
}: CollapsibleBriefSectionProps) {
  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between py-1 group">
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
          {title}
        </h3>
        <ChevronDown className="h-4 w-4 text-gray-500 transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
        <div className="pt-3">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

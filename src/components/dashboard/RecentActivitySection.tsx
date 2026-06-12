import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { SectionHeader } from './SectionHeader';

function CountPill({ count, className = '' }: { count?: number; className?: string }) {
  if (typeof count !== 'number' || count <= 0) return null;
  return (
    <span className={`rounded-full bg-dc-pink/20 px-1.5 py-0.5 text-[10px] font-bold text-dc-pink-accent ${className}`}>
      {count}
    </span>
  );
}

export interface ActivityGroup {
  id: string;
  label: string;
  content: React.ReactNode;
  count?: number;
}

interface RecentActivitySectionProps {
  title?: string;
  groups: ActivityGroup[];
  /** Right-aligned header slot (view-all link, tour button) */
  action?: React.ReactNode;
}

/**
 * Progressive-disclosure container that collapses what used to be several
 * separately-framed feeds into one soft frame. Desktop shows quiet pill
 * tabs; mobile shows an accordion with the first group open.
 */
export function RecentActivitySection({
  title = 'Recent activity',
  groups,
  action,
}: RecentActivitySectionProps) {
  if (groups.length === 0) return null;

  return (
    <section>
      <SectionHeader title={title} action={action} />

      {/* Desktop: quiet pill tabs */}
      <div className="hidden lg:block rounded-2xl border border-dc-teal/15 bg-white shadow-dc-sm">
        <Tabs defaultValue={groups[0].id}>
          <TabsList className="bg-transparent p-0 gap-2 px-5 pt-4 h-auto justify-start">
            {groups.map((g) => (
              <TabsTrigger
                key={g.id}
                value={g.id}
                className="rounded-full border border-dc-teal/15 px-4 py-1.5 text-xs font-semibold text-dc-text-muted data-[state=active]:bg-dc-teal/10 data-[state=active]:text-dc-teal-btn data-[state=active]:border-dc-teal/30 data-[state=active]:shadow-none"
              >
                {g.label}
                <CountPill count={g.count} className="ml-1.5" />
              </TabsTrigger>
            ))}
          </TabsList>
          {groups.map((g) => (
            <TabsContent key={g.id} value={g.id} className="px-5 pb-5 pt-3 mt-0">
              {g.content}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {/* Mobile: accordion, first group open */}
      <div className="lg:hidden rounded-2xl border border-dc-teal/15 bg-white shadow-dc-sm overflow-hidden">
        <Accordion type="multiple" defaultValue={[groups[0].id]}>
          {groups.map((g) => (
            <AccordionItem key={g.id} value={g.id} className="border-dc-teal/10 last:border-b-0">
              <AccordionTrigger className="px-4 py-3 text-sm font-semibold text-dc-text hover:no-underline">
                <span className="flex items-center">
                  {g.label}
                  <CountPill count={g.count} className="ml-2" />
                </span>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">{g.content}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

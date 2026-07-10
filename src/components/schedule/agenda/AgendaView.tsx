import React from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AgendaDay, AgendaItem, relativeDayLabel, contentTypeEmoji } from './agendaModel';
import { MonthJumpControl } from './MonthJumpControl';

export interface AgendaViewProps {
  days: AgendaDay[];
  today: Date;
  anchorDate: Date;
  onJumpToDate?: (d: Date) => void;
  onTodayClick?: () => void;
  onScheduleClick?: () => void;
  hasContentOn?: (d: Date) => boolean;
  variant?: 'mobile' | 'desktop';
  emptyState?: React.ReactNode;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function AgendaItemRow({ item }: { item: AgendaItem }) {
  if (item.kind === 'deadline') {
    return (
      <div className="bg-dc-pink/10 border border-dc-pink/40 rounded-2xl px-4 py-3 mb-2">
        <p className="text-[10px] font-bold text-dc-pink-accent uppercase tracking-wide">⚑ Campaign deadline</p>
        <p className="text-sm font-semibold text-dc-text truncate">{item.title}</p>
      </div>
    );
  }
  const time = formatTime(item.date);
  const platform = item.platform ? item.platform.charAt(0).toUpperCase() + item.platform.slice(1) : '';
  return (
    <button
      type="button"
      onClick={item.onClick}
      className="w-full flex items-center gap-3 bg-white border border-dc-teal/15 rounded-2xl p-3 mb-2 text-left min-h-[56px] hover:border-dc-teal transition-colors"
    >
      <span className="w-10 h-10 rounded-xl bg-dc-teal/15 flex items-center justify-center text-lg shrink-0">
        {contentTypeEmoji(item.contentType)}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-sm text-dc-text truncate">{item.title}</span>
        <span className="block text-xs text-dc-text-muted mt-0.5">
          {[time, platform].filter(Boolean).join(' · ')}
        </span>
      </span>
    </button>
  );
}

export function AgendaView({
  days, today, anchorDate, onJumpToDate, onTodayClick, onScheduleClick, hasContentOn, variant = 'mobile', emptyState,
}: AgendaViewProps) {
  const isEmpty = days.length === 0;
  return (
    <div>
      {/* Sticky header: month-jump (left) + Today + Schedule (right) */}
      <div className="sticky top-0 z-10 bg-white flex items-center justify-between gap-2 pb-3 mb-1">
        <MonthJumpControl
          anchorDate={anchorDate}
          onSelect={onJumpToDate ?? (() => {})}
          hasContentOn={hasContentOn}
          variant={variant}
        />
        <div className="flex items-center gap-2">
          {onTodayClick && (
            <button
              type="button"
              onClick={onTodayClick}
              className="text-xs font-bold text-dc-teal border border-dc-teal bg-dc-teal/5 rounded-full px-4 py-2 min-h-[44px] inline-flex items-center justify-center"
            >
              Today
            </button>
          )}
          {onScheduleClick && (
            <button
              type="button"
              onClick={onScheduleClick}
              className="flex items-center gap-1 justify-center bg-dc-teal-btn hover:bg-dc-teal-btn-hover text-white rounded-full px-4 py-2 text-xs font-bold transition-colors min-h-[44px]"
            >
              <Plus className="w-4 h-4" /> Schedule
            </button>
          )}
        </div>
      </div>

      {isEmpty ? (
        emptyState ?? (
          <div className="text-center py-14 text-sm text-dc-text-muted">Nothing scheduled yet.</div>
        )
      ) : (
        <div className={cn(variant === 'desktop' && 'max-w-xl')}>
          {days.map((day) => (
            <div key={day.dateKey}>
              <div className="text-[11px] font-bold text-dc-teal uppercase tracking-wide mt-5 mb-2">
                {relativeDayLabel(day.date, today)}
              </div>
              {day.items.map((item) => (
                <AgendaItemRow key={item.id} item={item} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

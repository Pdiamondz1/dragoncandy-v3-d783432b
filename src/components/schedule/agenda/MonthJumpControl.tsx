// src/components/schedule/agenda/MonthJumpControl.tsx
import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { monthMatrix, dateKey } from './agendaModel';

export interface MonthJumpControlProps {
  anchorDate: Date;
  onSelect: (d: Date) => void;
  hasContentOn?: (d: Date) => boolean;
  variant?: 'mobile' | 'desktop';
}

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function MonthGridPicker({
  anchorDate, onPick, hasContentOn,
}: {
  anchorDate: Date;
  onPick: (d: Date) => void;
  hasContentOn?: (d: Date) => boolean;
}) {
  const [viewMonth, setViewMonth] = useState(() => new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1));
  const today = new Date();
  const weeks = monthMatrix(viewMonth.getFullYear(), viewMonth.getMonth());
  const shift = (delta: number) =>
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));

  return (
    <div className="p-1">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => shift(-1)}
          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-dc-teal/10"
        >
          <ChevronLeft className="w-4 h-4 text-dc-text-muted" />
        </button>
        <span className="text-sm font-bold text-dc-text">
          {viewMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
        </span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => shift(1)}
          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg hover:bg-dc-teal/10"
        >
          <ChevronRight className="w-4 h-4 text-dc-text-muted" />
        </button>
      </div>
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="text-[9px] font-bold text-dc-text-muted text-center">{w}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7">
          {week.map((day, di) =>
            day ? (
              <button
                key={di}
                type="button"
                onClick={() => onPick(day)}
                className={cn(
                  'aspect-square rounded-lg text-xs flex flex-col items-center justify-center hover:bg-dc-teal/10',
                  dateKey(day) === dateKey(today) ? 'text-dc-teal font-bold ring-1 ring-dc-teal' : 'text-dc-text',
                )}
              >
                {day.getDate()}
                {hasContentOn?.(day) && <span className="w-1 h-1 rounded-full bg-dc-teal mt-0.5" />}
              </button>
            ) : (
              <div key={di} className="aspect-square" />
            ),
          )}
        </div>
      ))}
    </div>
  );
}

export function MonthJumpControl({ anchorDate, onSelect, hasContentOn, variant = 'mobile' }: MonthJumpControlProps) {
  const [open, setOpen] = useState(false);
  const label = anchorDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const handlePick = (d: Date) => {
    onSelect(d);
    setOpen(false);
  };
  const trigger = (
    <button
      type="button"
      className="min-h-[44px] inline-flex items-center gap-1 font-bold text-dc-teal text-base"
    >
      {label}
      <ChevronDown className="w-4 h-4" />
    </button>
  );

  if (variant === 'desktop') {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-2">
          <MonthGridPicker anchorDate={anchorDate} onPick={handlePick} hasContentOn={hasContentOn} />
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-3xl pb-8">
        <p className="text-sm font-bold text-dc-text mb-2 mt-2">Jump to date</p>
        <MonthGridPicker anchorDate={anchorDate} onPick={handlePick} hasContentOn={hasContentOn} />
      </SheetContent>
    </Sheet>
  );
}

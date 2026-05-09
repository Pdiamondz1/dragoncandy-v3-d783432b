import React from 'react';

export interface SponsorshipEvent {
  id: string;
  date: Date;
  title: string;
  type: 'start' | 'deadline' | 'amplification';
}

const MARKER_STYLES: Record<SponsorshipEvent['type'], { bg: string; text: string; label: string }> = {
  start: { bg: 'bg-dc-teal/10', text: 'text-dc-teal', label: 'Sponsorship' },
  deadline: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Content Due' },
  amplification: { bg: 'bg-purple-50', text: 'text-purple-700', label: 'Amplify' },
};

export const SponsorshipMarkerDot: React.FC<{ type: SponsorshipEvent['type'] }> = ({ type }) => {
  const colors: Record<string, string> = {
    start: 'bg-dc-teal',
    deadline: 'bg-amber-400',
    amplification: 'bg-purple-400',
  };
  return <div className={`w-1.5 h-1.5 rounded-full ${colors[type]}`} />;
};

export const SponsorshipMarkerLabel: React.FC<{ event: SponsorshipEvent }> = ({ event }) => {
  const style = MARKER_STYLES[event.type];
  return (
    <div
      className={`text-[9px] ${style.bg} ${style.text} border rounded px-1.5 py-0.5 truncate`}
      title={`${style.label}: ${event.title}`}
    >
      {event.title}
    </div>
  );
};

export const SponsorshipMarkerDetail: React.FC<{ event: SponsorshipEvent }> = ({ event }) => {
  const style = MARKER_STYLES[event.type];
  return (
    <div className={`${style.bg} border rounded-xl p-3 mb-2`}>
      <p className={`text-[10px] ${style.text} font-semibold uppercase`}>{style.label}</p>
      <p className={`text-sm font-medium truncate ${style.text}`}>{event.title}</p>
    </div>
  );
};

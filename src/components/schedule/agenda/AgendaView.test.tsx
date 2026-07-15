// src/components/schedule/agenda/AgendaView.test.tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AgendaView } from './AgendaView';
import type { AgendaDay } from './agendaModel';

const days: AgendaDay[] = [
  {
    dateKey: '2026-6-10',
    date: new Date(2026, 6, 10),
    items: [
      { id: 'a', date: new Date(2026, 6, 10, 9).toISOString(), kind: 'post', title: 'Café Symphony', platform: 'instagram', status: 'scheduled' },
    ],
  },
];

describe('AgendaView', () => {
  it('renders day headers, items, and fires schedule + today', () => {
    const onSchedule = vi.fn();
    const onToday = vi.fn();
    render(
      <AgendaView
        days={days}
        today={new Date(2026, 6, 10)}
        anchorDate={new Date(2026, 6, 10)}
        onScheduleClick={onSchedule}
        onTodayClick={onToday}
      />,
    );
    // Note: the day header (relativeDayLabel) and the "Today" jump button both
    // render the literal text "Today" when `today`/`anchorDate` fall on the same
    // day as the item, so a plain getByText('Today') is ambiguous here. There are
    // exactly two: the day-group header + the Today button — assert both exist.
    // See task-3-report.md for details.
    expect(screen.getAllByText('Today')).toHaveLength(2);
    expect(screen.getByText('Café Symphony')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /schedule/i }));
    expect(onSchedule).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^today$/i }));
    expect(onToday).toHaveBeenCalled();
  });

  it('renders a deadline row with the campaign-deadline label and title', () => {
    const deadlineDays: AgendaDay[] = [
      {
        dateKey: '2026-6-13',
        date: new Date(2026, 6, 13),
        items: [
          { id: 'd1', date: new Date(2026, 6, 13).toISOString(), kind: 'deadline', title: 'Café Symphony' },
        ],
      },
    ];
    render(
      <AgendaView
        days={deadlineDays}
        today={new Date(2026, 6, 10)}
        anchorDate={new Date(2026, 6, 10)}
      />,
    );
    expect(screen.getByText(/campaign deadline/i)).toBeInTheDocument();
    expect(screen.getByText('Café Symphony')).toBeInTheDocument();
  });

  it('renders a sponsorship row', () => {
    const sDays = [{
      dateKey: '2026-6-12', date: new Date(2026, 6, 12),
      items: [{ id: 'sponsorship-s1', date: new Date(2026, 6, 12).toISOString(), kind: 'sponsorship' as const, title: 'Nike Amplify', sponsorship: { id: 's1', date: new Date(2026, 6, 12), title: 'Nike Amplify', type: 'amplification' as const } }],
    }];
    render(<AgendaView days={sDays} today={new Date(2026, 6, 10)} anchorDate={new Date(2026, 6, 10)} />);
    expect(screen.getByText('Nike Amplify')).toBeInTheDocument();
  });

  it('shows the empty state when there are no days', () => {
    render(
      <AgendaView
        days={[]}
        today={new Date(2026, 6, 10)}
        anchorDate={new Date(2026, 6, 10)}
        emptyState={<div>Nothing scheduled yet</div>}
      />,
    );
    expect(screen.getByText('Nothing scheduled yet')).toBeInTheDocument();
  });
});

// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MonthGrid } from './MonthGrid';
import type { Post } from '@outstand-so/ui';

const post = (id: string, day: number, caption: string): Post =>
  ({
    id,
    scheduledAt: new Date(2026, 6, day, 9).toISOString(),
    publishedAt: null,
    socialAccounts: [{ id: `sa-${id}`, network: 'instagram', status: 'scheduled' }],
    containers: [{ content: caption }],
  }) as unknown as Post;

describe('MonthGrid chips', () => {
  it('renders the post caption as a chip in the day cell', () => {
    render(
      <MonthGrid
        posts={[post('p1', 10, 'Latte art')]}
        year={2026}
        month={6}
        onDayClick={() => {}}
      />,
    );
    expect(screen.getByText(/Latte art/)).toBeInTheDocument();
  });
});

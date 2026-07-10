import { describe, it, expect } from 'vitest';
import type { Post } from '@outstand-so/ui';
import { outstandPostToAgendaItem, deadlineToAgendaItem } from './agendaAdapters';

const makePost = (over: Partial<Post> = {}): Post =>
  ({
    id: 'p1',
    scheduledAt: new Date(2026, 6, 10, 9).toISOString(),
    publishedAt: null,
    socialAccounts: [{ id: 'sa1', network: 'instagram', status: 'scheduled' }],
    containers: [{ content: 'Café Symphony' }],
    ...over,
  }) as unknown as Post;

describe('outstandPostToAgendaItem', () => {
  it('maps caption, platform, status and id', () => {
    const item = outstandPostToAgendaItem(makePost());
    expect(item).not.toBeNull();
    expect(item!.id).toBe('p1');
    expect(item!.title).toBe('Café Symphony');
    expect(item!.platform).toBe('instagram');
    expect(item!.kind).toBe('post');
    expect(item!.status).toBe('scheduled');
  });

  it('falls back to a title when caption is empty', () => {
    const item = outstandPostToAgendaItem(makePost({ containers: [] } as unknown as Partial<Post>));
    expect(item!.title).toBe('Untitled post');
  });

  it('returns null when there is no timestamp', () => {
    const item = outstandPostToAgendaItem(
      makePost({ scheduledAt: null, publishedAt: null } as unknown as Partial<Post>),
    );
    expect(item).toBeNull();
  });
});

describe('deadlineToAgendaItem', () => {
  it('maps a campaign deadline', () => {
    const item = deadlineToAgendaItem({
      id: 'd1', title: 'Café Symphony', deadline: new Date(2026, 6, 13), campaignId: 'c1',
    });
    expect(item.kind).toBe('deadline');
    expect(item.title).toBe('Café Symphony');
    expect(item.id).toBe('deadline-d1');
  });
});

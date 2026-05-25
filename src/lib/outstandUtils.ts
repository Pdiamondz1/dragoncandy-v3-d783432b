import type { Post } from '@outstand-so/ui';

export function isScheduled(p: Post): boolean {
  if (!p.scheduledAt) return false;
  if (p.publishedAt) return false;
  const sas = p.socialAccounts ?? [];
  return !sas.some((sa) => sa.status === 'published');
}

export function isInPublishedFeed(p: Post): boolean {
  if (isScheduled(p)) return false;
  const sas = p.socialAccounts ?? [];
  return sas.length > 0 || !!p.publishedAt;
}

export function postOutcome(p: Post): 'published' | 'pending' | 'failed' | 'mixed' {
  if (p.publishedAt) return 'published';
  const sas = p.socialAccounts ?? [];
  const allPublished = sas.length > 0 && sas.every((sa) => sa.status === 'published');
  if (allPublished) return 'published';
  const allFailed = sas.length > 0 && sas.every((sa) => sa.status === 'failed');
  if (allFailed) return 'failed';
  if (sas.some((sa) => sa.status === 'failed') && sas.some((sa) => sa.status === 'published')) {
    return 'mixed';
  }
  return 'pending';
}

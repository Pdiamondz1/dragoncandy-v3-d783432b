import type { Post } from '@outstand-so/ui';
import type { CampaignDeadline } from '@/components/outstand/CalendarTab';
import type { SponsorshipEvent } from '@/components/outstand/SponsorshipMarker';
import { getCaption, getUniqueNetworks } from '@/components/outstand/postUtils';
import { isScheduled } from '@/lib/outstandUtils';
import type { AgendaItem } from './agendaModel';

export function outstandPostToAgendaItem(post: Post): AgendaItem | null {
  const stamp = post.scheduledAt ?? post.publishedAt;
  if (!stamp) return null;
  return {
    id: post.id,
    date: stamp,
    kind: 'post',
    title: getCaption(post) || 'Untitled post',
    platform: getUniqueNetworks(post)[0],
    status: isScheduled(post) ? 'scheduled' : 'published',
  };
}

export function deadlineToAgendaItem(d: CampaignDeadline): AgendaItem {
  return {
    id: `deadline-${d.id}`,
    date: d.deadline.toISOString(),
    kind: 'deadline',
    title: d.title,
  };
}

export function sponsorshipToAgendaItem(s: SponsorshipEvent): AgendaItem {
  return {
    id: `sponsorship-${s.id}`,
    date: s.date.toISOString(),
    kind: 'sponsorship',
    title: s.title,
    sponsorship: s,
  };
}

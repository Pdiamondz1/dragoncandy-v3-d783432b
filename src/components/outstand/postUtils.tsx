import React from 'react';
import type { Post } from '@outstand-so/ui';

export function formatPostDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function getCaption(post: Post): string {
  const container = post.containers?.[0];
  if (!container) return '';
  const fields = container as unknown as Record<string, unknown>;
  return (
    (fields.content as string) ||
    (fields.text as string) ||
    (fields.caption as string) ||
    (fields.body as string) ||
    ''
  );
}

export interface PostMedia {
  url: string;
  filename?: string;
  contentType?: string;
}

export function getMedia(post: Post): PostMedia[] {
  const out: PostMedia[] = [];
  for (const container of post.containers ?? []) {
    const fields = container as unknown as Record<string, unknown>;
    const media = (fields.media ?? fields.attachments) as
      | Array<Record<string, unknown>>
      | undefined;
    if (!Array.isArray(media)) continue;
    for (const item of media) {
      const url = (item?.url as string) || '';
      if (!url) continue;
      out.push({
        url,
        filename: item?.filename as string | undefined,
        contentType: item?.contentType as string | undefined,
      });
    }
  }
  return out;
}

function isVideoMedia(m: PostMedia): boolean {
  if (m.contentType?.startsWith('video/')) return true;
  return /\.(mp4|mov|webm|m4v)(?:\?|$)/i.test(m.url);
}

export const MediaPreviewStrip: React.FC<{ media: PostMedia[] }> = ({ media }) => {
  if (media.length === 0) return null;
  return (
    <div className="flex gap-2 overflow-x-auto -mx-1 px-1 pt-1">
      {media.map((m, i) => (
        <div
          key={`${m.url}-${i}`}
          className="relative shrink-0 w-20 h-20 rounded-xl overflow-hidden bg-gray-100 border border-gray-200"
        >
          {isVideoMedia(m) ? (
            <video src={m.url} className="w-full h-full object-cover" muted playsInline />
          ) : (
            <img src={m.url} alt={m.filename ?? 'media'} className="w-full h-full object-cover" />
          )}
        </div>
      ))}
    </div>
  );
};

export function getUniqueNetworks(post: Post): string[] {
  const networks = (post.socialAccounts ?? []).map((sa) => sa.network);
  return Array.from(new Set(networks));
}

export const NetworkPills: React.FC<{ networks: string[] }> = ({ networks }) => {
  if (networks.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {networks.map((network) => (
        <span
          key={network}
          className="text-[10px] uppercase tracking-wide bg-dc-teal/10 text-dc-teal rounded-full px-2 py-0.5 font-semibold"
        >
          {network}
        </span>
      ))}
    </div>
  );
};

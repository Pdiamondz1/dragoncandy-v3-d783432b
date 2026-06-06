// Shared social-network display constants (colors + labels), kept in their own
// module so component files only export components (satisfies react-refresh).

export const NETWORK_COLORS: Record<string, string> = {
  instagram: '#E1306C',
  tiktok: '#000000',
  facebook: '#1877F2',
  x: '#1f2937',
  youtube: '#dc2626',
  linkedin: '#0A66C2',
  threads: '#000000',
  bluesky: '#0085FF',
  pinterest: '#E60023',
};

export const NETWORK_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  x: 'X',
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  threads: 'Threads',
  bluesky: 'Bluesky',
  pinterest: 'Pinterest',
};
